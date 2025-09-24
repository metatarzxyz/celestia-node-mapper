export interface NodeInfo {
    protocol_version: {
      p2p: string;
      block: string;
      app: string;
    };
    id: string;
    listen_addr: string;
    network: string;
    version: string;
    channels: string;
    moniker: string;
    other: {
      tx_index: string;
      rpc_address: string;
    };
  }
  
  export interface Peer {
    node_info: NodeInfo;
    is_outbound: boolean;
    connection_status: any;
    remote_ip: string;
    firewall_open: boolean
  }
  
  export interface NetInfoResponse {
    jsonrpc: string;
    id: number;
    result: {
      listening: boolean;
      listeners: string[];
      n_peers: string;
      peers: Peer[];
    };
  }

  export interface StatusInfoResponse {
    jsonrpc: string;
    id: number;
    result: {
      node_info: NodeInfo
      validator_info: {
        address: string
        voting_power: string
      }
    };
  }
  
  export interface IPGeoResponse {
    status: string;
    country: string;
    countryCode: string;
    region: string;
    regionName: string;
    city: string;
    zip: string;
    lat: number;
    lon: number;
    timezone: string;
    isp: string;
    org: string;
    as: string;
    query: string;
  }
  
  export interface Node {
    operator_address: string;
    consensus_pubkey: {
      '@type': string;
      key: string;
    };
    jailed: boolean;
    status: string;
    tokens: string;
    delegator_shares: string;
    description: {
      moniker: string;
      identity: string;
      website: string;
      security_contact: string;
      details: string;
    };
    unbonding_height: string;
    unbonding_time: string;
    commission: {
      commission_rates: {
        rate: string;
        max_rate: string;
        max_change_rate: string;
      };
      update_time: string;
    };
    min_self_delegation: string;
    unbonding_on_hold_ref_count: string;
    unbonding_ids: string[];
  }
  
  export interface NodesResponse {
    nodes: Node[];
    pagination: {
      next_key: string | null;
      total: string;
    };
  }
  
  export interface NodeMap {
    id: string;
    network: string;
    moniker: string;
    ip: string;
    country: string;
    city: string;
    lat: number;
    lon: number;
    isp: string;
    asp: string;
    firewall_open: boolean;
    last_updated: string;
  }
  
  export interface RPCConfig {
    endpoint: string;
    maxRecursionDepth: number;
    updateIntervalMinutes: number;
  }