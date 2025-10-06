[![logo.png](https://i.postimg.cc/4xtzY1jT/logo.png)](https://postimg.cc/hXDJwVSC)

## About

KISS celestia node mapper in Typescript (Node.js). Iteratively scans the network for new peers (/net_info? endpoint) and fetches the geolocation and firewall status for each peer.

## Features

- Configurable recursive search 
- Works with IP Geolocation API https://ip-api.com 
- Local db (sqlite3) for peer storal and local cache
- Express server :3000 for easy peer retrieval


## Getting started

Download and checkout the repo. Then, install Node.js deps:

```sh
yarn install
```

Copy the example `env.example` file and replace the values to suit your needs:

```sh
cp env.example .env
```

Start up the server and node mapper service:

```sh
yarn dev
```


## Parameters

| Environment Variable | Explanation | Default Value |
|---------------------|-------------|---------------|
| PORT | The port number on which the application server runs | 3000 |
| SERVER | Boolean flag to enable/disable server functionality | true |
| REQUEST_TIMEOUT | Timeout duration for HTTP requests in milliseconds | 3000 |
| RPC_ENDPOINT | URL for Celestia mainnet RPC endpoint | https://celestia-mainnet-rpc.itrocket.net |
| API_ENDPOINT | URL for Celestia API services | https://celestia-api.polkachu.com |
| IP_API_ENDPOINT | URL for IP geolocation API service | http://ip-api.com/json |
| MAX_RECURSION_DEPTH | Maximum depth for recursive operations | 10 |
| UPDATE_INTERVAL_MINUTES | Time interval for periodic updates in minutes | 15 |
| DATABASE_PATH | File path for the sqlite database | ./nodes.db |


## API

- GET `'/nodes/:network'`: Fetches nodes from local db and returns a JSON array of NodeMap objects, with the following format:

```ts
 {
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
```

## License

MIT - Metatarz.xyz, 2025