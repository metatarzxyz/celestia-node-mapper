import sqlite3 from 'sqlite3';
import { NodeMap } from './types';

export class DatabaseService {
  private db: sqlite3.Database;

  constructor(dbPath: string) {
    this.db = new sqlite3.Database(dbPath);
    this.initDatabase();
  }

  private initDatabase(): void {
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS nodes (
        id TEXT PRIMARY KEY,
        network TEXT,
        moniker TEXT,
        ip TEXT,
        country TEXT,
        city TEXT,
        lat REAL,
        lon REAL,
        isp TEXT,
        asp TEXT,
        status TEXT,
        firewall_open BOOLEAN,
        last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;

    this.db.run(createTableSQL, (err) => {
      if (err) {
        console.error('Error creating table:', err);
      } else {
        console.log('Database initialized successfully');
      }
    });
  }

  async upsertNode(node: NodeMap): Promise<void> {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT OR REPLACE INTO nodes 
        (id, network, moniker, ip, country, city, lat, lon, isp, asp, firewall_open, last_updated)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      this.db.run(sql, [
        node.id,
        node.network,
        node.moniker,
        node.ip,
        node.country,
        node.city,
        node.lat,
        node.lon,
        node.isp,
        node.asp,
        node.firewall_open ? 1 : 0,
        new Date().toISOString()
      ], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  async getNodeById(id: string): Promise<NodeMap | null> {
    return new Promise((resolve, reject) => {
      let sql = `SELECT * FROM nodes WHERE id = ?`;


      this.db.get(sql, [id], (err, row: any) => {
        if (err) {
          reject(err);
        } else if (row) {
          resolve({
            id: row.id,
            network: row.network,
            moniker: row.moniker,
            ip: row.ip,
            country: row.country,
            city: row.city,
            lat: row.lat,
            lon: row.lon,
            isp: row.isp,
            asp: row.asp,
            firewall_open: Boolean(row.firewall_open),
            last_updated: row.last_updated
          });
        } else {
          resolve(null);
        }
      });
    });
  }

  async getAllNodes(): Promise<NodeMap[]> {
    return new Promise((resolve, reject) => {
      const sql = `SELECT * FROM nodes ORDER BY moniker`;

      this.db.all(sql, [], (err, rows: any[]) => {
        if (err) {
          reject(err);
        } else {
          const nodes: NodeMap[] = rows.map(row => ({
            id: row.id,
            network: row.network,
            moniker: row.moniker,
            ip: row.ip,
            country: row.country,
            city: row.city,
            lat: row.lat,
            lon: row.lon,
            isp: row.isp,
            asp: row.asp,
            firewall_open: Boolean(row.firewall_open),
            last_updated: row.last_updated
          }));
          resolve(nodes);
        }
      });
    });
  }

  async getAllNodesByNetwork(network: string): Promise<NodeMap[] | null> {
    return new Promise((resolve, reject) => {
      const sql = `SELECT * FROM nodes WHERE network = ?`;

      this.db.all(sql, [network], (err, rows: any[]) => {
        if (err) {
          reject(err);
        } else {
            const nodes: NodeMap[] = rows.map(row => ({
              id: row.id,
              network: row.network,
              moniker: row.moniker,
              ip: row.ip,
              country: row.country,
              city: row.city,
              lat: row.lat,
              lon: row.lon,
              isp: row.isp,
              asp: row.asp,
              firewall_open: Boolean(row.firewall_open),
              last_updated: row.last_updated
            }));
            resolve(nodes);
          }
      });
    });
  }

  close(): void {
    this.db.close();
  }
}