import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { DatabaseService } from './database';
import { CelestiaService } from './celestia';
import { NodeMap } from './types';

dotenv.config();

class CelestiaNodeMapService {
  private app: express.Application;
  private db: DatabaseService;
  private celestia: CelestiaService;
  private updateInterval: NodeJS.Timeout | null = null;
  private server: any = null;


  constructor() {
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();

    this.db = new DatabaseService(process.env.DATABASE_PATH || './nodes.db');
    
    this.celestia = new CelestiaService({
      endpoint: process.env.RPC_ENDPOINT || 'https://celestia-testnet-rpc.polkachu.com',
      maxRecursionDepth: parseInt(process.env.MAX_RECURSION_DEPTH || '3'),
      updateIntervalMinutes: parseInt(process.env.UPDATE_INTERVAL_MINUTES || '15')
    }, this.db);
  }

  private setupMiddleware(): void {
    this.app.use(cors());
    this.app.use(express.json());
  }

  private setupRoutes(): void {
    this.app.get('/nodes/:network', async (req, res) => {
      try {
        const network = req.params?.network

        if(!network){
            res.json({error: "network not provided"})
            return
        }

        const nodes = await this.db.getAllNodesByNetwork(network);
        res.json(nodes);
      } catch (error) {
        console.error('Error fetching npdes:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    this.app.get('/health', (req, res) => {
      res.json({ status: 'healthy', timestamp: new Date().toISOString() });
    });

  }

  async updateNodeData(): Promise<void> {
      console.log('Starting node data update...');
    
    try {
      this.celestia.resetVisitedPeers();

      // Discover peers recursively in parallel
      console.log('Starting peer discovery...');
      const discoveryResult = await this.celestia.discoverPeersRecursiveParallel(
        process.env.RPC_ENDPOINT || 'https://celestia-testnet-rpc.polkachu.com'
      );
  
      console.log(`Discovered ${discoveryResult.allPeers.length} total peers`);
  
      // Map nodes to peers with the collected firewall status
      console.log('Mapping nodes to peers...');
      const mappedData = await this.celestia.mapPeerProcessing(
        discoveryResult.allPeers
      );
  
      console.log(`Successfully mapped ${mappedData.length} nodes`);
  
      // Store in database
      console.log('Storing data in database...');
      for (const nodeData of mappedData) {
        await this.db.upsertNode(nodeData as NodeMap);
      }
  
      console.log('Node data update completed successfully');
    } catch (error) {
      console.error('Error updating node data:', error);
      throw error;
    }
  }

  startUpdateInterval(): void {
    const intervalMinutes = parseInt(process.env.UPDATE_INTERVAL_MINUTES || '15');
    const intervalMs = intervalMinutes * 60 * 1000;

    this.updateInterval = setInterval(async () => {
      try {
        await this.updateNodeData();
      } catch (error) {
        console.error('Error in scheduled update:', error);
      }
    }, intervalMs); 

    console.log(`Scheduled updates every ${intervalMinutes} minutes`);
  }

  async startServer(): Promise<void> {
    const port = process.env.PORT || 3000;

    return new Promise((resolve) => {
      this.server = this.app.listen(port, () => {
        console.log(`Celestia Node Map Service running on port ${port}`);
        resolve();
      });
    });
  }

  async start(): Promise<void> {



     // Wait a bit for database to initialize
     await new Promise(resolve => setTimeout(resolve, 1000));

     // Start the server first
     if(process.env.SERVER === 'true'){

     console.log('Starting server...');
     await this.startServer();

     }
    

    this.startInitialUpdate();
    this.startUpdateInterval();
    

  }

  private startInitialUpdate(): void {
    // Don't await this - let it run in the background
    this.updateNodeData()
      .then(() => {
        console.log('Initial data update completed successfully');
      })
      .catch((error) => {
        console.error('Initial data update failed:', error);
        // Don't exit the process - the server should keep running
      });
  }

  stop(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }

    if (this.server) {
        this.server.close(() => {
          console.log('Server stopped');
        });
      }

    this.db.close();
  }
}

// Start the service
const service = new CelestiaNodeMapService();
service.start().catch(console.error);

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down...');
  service.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('Shutting down...');
  service.stop();
  process.exit(0);
});