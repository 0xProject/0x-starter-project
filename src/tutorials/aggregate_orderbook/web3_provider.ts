import * as Web3 from 'web3';
import Web3ProviderEngine = require('web3-provider-engine');
import RpcSubprovider = require('web3-provider-engine/subproviders/rpc');
import WebSocketSubprovider = require('web3-provider-engine/subproviders/websocket');

// const RPC_URL = 'wss://mainnet.infura.io/_ws';
// const NETWORK_ID = 1;
// const RPC_URL = 'wss://kovan.infura.io/_ws';
// const RPC_URL = 'wss://kovan.infura.io/_ws'; // Not operational
const RPC_URL = 'https://kovan.infura.io';
const NETWORK_ID = 42;

const subprovider = RPC_URL.startsWith('ws')
    ? new WebSocketSubprovider({ rpcUrl: RPC_URL })
    : new RpcSubprovider({ rpcUrl: RPC_URL });

export const providerEngine = new Web3ProviderEngine();
providerEngine.addProvider(subprovider);
export const web3 = new Web3(providerEngine);
export const networkId = NETWORK_ID;
providerEngine.start();
