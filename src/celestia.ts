import axios from 'axios';
import { NetInfoResponse, IPGeoResponse, NodesResponse, Node, Peer, RPCConfig, StatusInfoResponse } from './types';
import { DatabaseService } from './database';

export class CelestiaService {
  private visitedPeers: Set<string> = new Set();
  private rpcConfig: RPCConfig;
  private db: DatabaseService;

  constructor(rpcConfig: RPCConfig, db: DatabaseService) {
    this.rpcConfig = rpcConfig;
    this.db = db;

  }

  /**
   * Validate if an IP address is valid for external calls
   */
  private isValidIP(ip: string): boolean {
    // Skip localhost and private IPs
    if (ip === 'localhost' || ip === '127.0.0.1' || ip === '0.0.0.0') {
      return false;
    }

    // Skip IPv6 addresses for simplicity (many networks block IPv6)
    if (ip.includes(':')) {
      return false;
    }

    // Check for private IP ranges
    const ipParts = ip.split('.').map(part => parseInt(part, 10));
    if (ipParts.length !== 4 || ipParts.some(part => isNaN(part))) {
      return false;
    }

    // Private IP ranges:
    // 10.0.0.0 - 10.255.255.255
    // 172.16.0.0 - 172.31.255.255
    // 192.168.0.0 - 192.168.255.255
    if (ipParts[0] === 10) return false;
    if (ipParts[0] === 172 && ipParts[1] >= 16 && ipParts[1] <= 31) return false;
    if (ipParts[0] === 192 && ipParts[1] === 168) return false;
    if (ipParts[0] === 169 && ipParts[1] === 254) return false; // Link-local

    return true;
  }

  /**
   * Validate if a URL is safe and valid for external calls
   */
  private isValidEndpoint(url: string): boolean {
    try {
      const parsedUrl = new URL(url);
      
      // Only allow HTTP/HTTPS
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        return false;
      }

      // Validate hostname
      const hostname = parsedUrl.hostname;
      
      // Skip localhost
      if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0') {
        return false;
      }

      // Skip IPv6
      if (hostname.includes(':')) {
        return false;
      }

      // Check if it's a valid IP address
      if (this.isValidIP(hostname)) {
        return true;
      }

      // For domain names, we'll allow them but be cautious
      // You might want to add additional domain validation here
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Sanitize and validate RPC endpoint
   */
  private sanitizeRpcEndpoint(rpcAddress: string, peerRemoteIP: string): string | null {
    try {
      const match = rpcAddress.match(/tcp:\/\/([^:]+):(\d+)/);
      if (!match) {
        return null;
      }

      const [, host, port] = match;
      let actualHost = host;

      // Handle special cases
      if (host === '127.0.0.1' || host === '0.0.0.0') {
        // Use the peer's remote IP if localhost is specified
        if (this.isValidIP(peerRemoteIP)) {
          actualHost = peerRemoteIP;
        } else {
          return null;
        }
      }

      // Validate the host
      if (!this.isValidIP(actualHost) && !this.isValidEndpoint(`http://${actualHost}`)) {
        return null;
      }

      const endpoint = `http://${actualHost}:${port}`;
      
      // Final validation of the complete endpoint
      if (!this.isValidEndpoint(endpoint)) {
        return null;
      }

      return endpoint;
    } catch (error) {
      return null;
    }
  }

  async getNetInfo(endpoint?: string): Promise<NetInfoResponse> {
    const url = endpoint ? `${endpoint}/net_info` : `${this.rpcConfig.endpoint}/net_info`;
    
    // Validate URL before making the call
    if (endpoint && !this.isValidEndpoint(url)) {
      throw new Error(`Invalid endpoint: ${url}`);
    }
    
    try {
      const response = await axios.get(url, { 
        timeout: parseInt(process.env.REQUEST_TIMEOUT  || '3000'),
        // Add headers to avoid being blocked
        headers: {
          'User-Agent': 'Celestia-Node-Map/1.0'
        }
      });
      return response.data;
    } catch (error) {
      //console.error(`Error fetching net_info from ${url}:`);
      throw error;
    }
  }


  async getNodes(): Promise<NodesResponse> {
    const url = `${process.env.API_ENDPOINT || 'https://celestia-testnet-api.polkachu.com'}/cosmos/staking/v1beta1/nodes?pagination.limit=1000`;
    
    try {
      const response = await axios.get(url);
      return response.data;
    } catch (error) {
      console.error('Error fetching nodes:', error);
      throw error;
    }
  }

  async getIPGeoInfo(ip: string): Promise<IPGeoResponse> {
    // Validate IP before making the call
    if (!this.isValidIP(ip)) {
      throw new Error(`Invalid IP for geo lookup: ${ip}`);
    }

    const url = `${process.env.IP_API_ENDPOINT || 'http://ip-api.com/json'}/${ip}`;
    
    try {
      const response = await axios.get(url);
      return response.data;
    } catch (error) {
      console.error(`Error fetching IP geo info for ${ip}:`, error);
      throw error;
    }
  }

  async checkFirewall(peer: Peer): Promise<boolean> {
    try {
      const endpoint = this.getPeerRpcEndpoint(peer);
      if (!endpoint) {
        return false;
      }

      // Try to get net_info from the peer's RPC endpoint
      await this.getNetInfo(endpoint);
      return true;
    } catch (error) {
      return false;
    }
  }

  extractIPFromListenAddr(listenAddr: string): string {
    const match = listenAddr.match(/tcp:\/\/([^:]+):(\d+)/);
    if (match && match[1] !== '0.0.0.0') {
      return match[1];
    }
    return '';
  }

  /**
   * Get RPC endpoint from a peer with validation
   */
  getPeerRpcEndpoint(peer: Peer): string | null {
    try {
      const rpcAddress = peer.node_info.other.rpc_address;
      return this.sanitizeRpcEndpoint(rpcAddress, peer.remote_ip);
    } catch (error) {
      return null;
    }
  }

  /**
   * Process a batch of peers in parallel to get their net_info with URL validation
   */
  async processPeersBatch(peers: Peer[]): Promise<{
    successfulPeers: Peer[];
    newDiscoveredPeers: Peer[];
  }> {
    const batchPromises = peers.map(async (peer) => {
      const endpoint = this.getPeerRpcEndpoint(peer);
      if (!endpoint) {
        console.log(`Skipping peer ${peer.node_info.moniker} - invalid endpoint`);
        return { peer, success: false, newPeers: [], firewallOpen: false };
      }

      // Additional validation for the endpoint
      if (!this.isValidEndpoint(endpoint)) {
        console.log(`Skipping peer ${peer.node_info.moniker} - endpoint failed validation: ${endpoint}`);
        return { peer, success: false, newPeers: [], firewallOpen: false};
      }

      try {
        // Check if this peer is a node (for firewall test)
        let firewallOpen = false;
          try {
            await this.getNetInfo(endpoint);
            firewallOpen = true;


          } catch (error) {
            firewallOpen = false;
          }
        

        const netInfo = await this.getNetInfo(endpoint);
        console.log(`✓ Successfully queried peer: ${peer.node_info.moniker} at ${endpoint}`);
        
        return {
          peer,
          success: true,
          newPeers: netInfo.result.peers || [],
          firewallOpen
        };
      } catch (error) {
        console.log(`✗ Failed to query peer: ${peer.node_info.moniker} at ${endpoint}`);
        return { peer, success: false, newPeers: [], firewallOpen: false };
      }
    });

    const results = await Promise.all(batchPromises);
    
    const successfulPeers: Peer[] = [];
    const newDiscoveredPeers: Peer[] = [];

    for (const result of results) {
      if (result.success) {
        successfulPeers.push({...result.peer, firewall_open: result.firewallOpen});
        
        // Add new peers that haven't been visited yet
        for (const newPeer of result.newPeers) {
          const peerKey = newPeer.node_info.id;
          if (!this.visitedPeers.has(peerKey)) {
            this.visitedPeers.add(peerKey);
            
            // Validate the new peer's endpoint before adding
            const newPeerEndpoint = this.getPeerRpcEndpoint(newPeer);
            if (newPeerEndpoint && this.isValidEndpoint(newPeerEndpoint)) {
              newDiscoveredPeers.push(newPeer);
            }
          }
        }
      }
    }

    return { successfulPeers, newDiscoveredPeers };
  }

  /**
   * Parallel recursive discovery of peers with URL validation
   */
  async discoverPeersRecursiveParallel(
    initialEndpoint: string
  ): Promise<{ allPeers: Peer[]}> {
    const allPeers: Peer[] = [];
    
    // Validate initial endpoint
    if (!this.isValidEndpoint(initialEndpoint)) {
      console.error(`Invalid initial endpoint: ${initialEndpoint}`);
      return { allPeers };
    }

    // Get initial peers from main endpoint
    try {
      const initialNetInfo = await this.getNetInfo(initialEndpoint);
      const initialPeers = initialNetInfo.result.peers || [];
      
      // Filter and validate initial peers
      const validInitialPeers = initialPeers.filter(peer => {
        const endpoint = this.getPeerRpcEndpoint(peer);
        return endpoint && this.isValidEndpoint(endpoint);
      });

      // Mark valid initial peers as visited
      validInitialPeers.forEach(peer => this.visitedPeers.add(peer.node_info.id));
      allPeers.push(...validInitialPeers);

      let currentLevelPeers = validInitialPeers;
      let depth = 0;

      console.log(`Starting discovery with ${validInitialPeers.length} valid initial peers`);

      while (depth < this.rpcConfig.maxRecursionDepth && currentLevelPeers.length > 0) {
        console.log(`Recursion depth ${depth + 1}: Processing ${currentLevelPeers.length} peers...`);
        
        // Process current level peers in parallel batches
        const batchSize = 50; // Reduced batch size for better stability
        const batches: Peer[][] = [];
        
        for (let i = 0; i < currentLevelPeers.length; i += batchSize) {
          batches.push(currentLevelPeers.slice(i, i + batchSize));
        }

        let nextLevelPeers: Peer[] = [];

        // Process batches sequentially but peers within batches in parallel
        for (const batch of batches) {
          const batchResult = await this.processPeersBatch(batch);
          
          // Add successful peers to results
          allPeers.push(...batchResult.successfulPeers);
        
          
          // Collect peers for next level
          nextLevelPeers.push(...batchResult.newDiscoveredPeers);

          // Small delay between batches to avoid overwhelming the network
          if (batches.length > 1) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }

        // Remove duplicates from next level peers and validate endpoints
        const uniqueNextLevelPeers = nextLevelPeers.filter((peer, index, array) => {
          const isUnique = index === array.findIndex(p => p.node_info.id === peer.node_info.id);
          if (!isUnique) return false;
          
          // Additional endpoint validation
          const endpoint = this.getPeerRpcEndpoint(peer);
          return endpoint && this.isValidEndpoint(endpoint);
        });

        console.log(`Depth ${depth + 1}: Discovered ${uniqueNextLevelPeers.length} new valid peers`);
        currentLevelPeers = uniqueNextLevelPeers;
        depth++;
      }

    } catch (error) {
      console.error('Error in recursive discovery:', error);
    }

    console.log(`Discovery completed. Total valid peers: ${allPeers.length}`);
    return { allPeers };
  }

  /**
   * Enhanced mapping with parallel processing and IP validation
   */
  async mapPeerProcessing(
    peers: Peer[]
  ): Promise<any[]> {
    const mappedData = [];
    const batchSize = 1;

    // Create a map for quick moniker lookup
    const peerMap = new Map<string, Peer>();
    peers.forEach(peer => {
      peerMap.set(peer.node_info.moniker.toLowerCase(), peer);
    });

    for (let i = 0; i < peers.length; i += batchSize) {
      const batch = peers.slice(i, i + batchSize);
      const batchPromises = batch.map(async (peer) => {
          try {
            // Validate IP before geo lookup
            if (!this.isValidIP(peer.remote_ip)) {
              console.log(`Skipping geo lookup for ${peer.node_info.moniker} - invalid IP: ${peer.remote_ip}`);
              return null;
            }
            // Get IP geo info whenever not stored locally
            const nodeFromDb = await this.db.getNodeById(peer.node_info.id)

            let ipGeo
            if(!(nodeFromDb && nodeFromDb.id)){
                console.log(`getting geo ip for new peer: ${peer.remote_ip}`)
                ipGeo = await this.getIPGeoInfo(peer.remote_ip)
                // Delay between batches to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 1500));
                
            }else{
                ipGeo = {
                    country: nodeFromDb.country,
                    city: nodeFromDb.city,
                    lat: nodeFromDb.lat,
                    lon: nodeFromDb.lon,
                    isp: nodeFromDb.isp,
                    as: nodeFromDb.asp
                }
            }
            
            return {
              id: peer.node_info.id,
              network: peer.node_info.network,
              moniker: peer.node_info.moniker,
              ip: peer.remote_ip,
              country: ipGeo.country,
              city: ipGeo.city,
              lat: ipGeo.lat,
              lon: ipGeo.lon,
              isp: ipGeo.isp,
              asp: ipGeo.as,
              firewall_open: peer.firewall_open
            };
          } catch (error) {
            console.error(`Error processing peer ${peer.node_info.moniker}:`, error);
            return null;
          }
      });

      const batchResults = await Promise.all(batchPromises);
      const successfulResults = batchResults.filter(result => result !== null);
      mappedData.push(...successfulResults);

  
    }

    return mappedData;
  }

  resetVisitedPeers(): void {
    this.visitedPeers.clear();
  }
}