import * as Web3 from 'web3';

// HACK: web3 injects XMLHttpRequest into the global scope and ProviderEngine checks XMLHttpRequest
// to know whether it is running in a browser or node environment. We need it to be undefined since
// we are not running in a browser env.
// Filed issue: https://github.com/ethereum/web3.js/issues/844
(global as any).XMLHttpRequest = undefined;

import ProviderEngine = require('web3-provider-engine');
import { NonceTrackerSubprovider } from '@0xproject/subproviders';
import HookedWalletSubprovider = require('web3-provider-engine/subproviders/hooked-wallet');
import RpcSubprovider = require('web3-provider-engine/subproviders/rpc');
import { idManagement } from './id_management';
import { ZeroExConfig } from '0x.js';
import { create } from 'domain';

const IS_PRODUCTION = (process.env.TEST_MODE == 'false');

function createTestProviderEngine() {
    const engine = new ProviderEngine();
    engine.addProvider(new RpcSubprovider({ rpcUrl: 'http://localhost:8545' }));
    engine.start()
    return engine;
}

function createMainnetProviderEngine() {
    const engine = new ProviderEngine();
    engine.addProvider(new NonceTrackerSubprovider());
    engine.addProvider(new HookedWalletSubprovider(idManagement));
    engine.addProvider(new RpcSubprovider({ rpcUrl: 'https://mainnet.infura.io/' + process.env.INFURA_API_KEY }));
    engine.start()
    return engine;
}

// Local mode
const testRpcRelayerUrls = [
    'http://localhost:3000/v0'
]
const testZeroExConfig = {
    networkId: 50, // testrpc
};

// Production mode
const mainnetRelayerUrls = [
    'https://api.radarrelay.com/0x/v0/',
    'https://api.ercdex.com/api/standard/1/v0/'
]
const mainnetZeroExConfig = {
    networkId: 1, // mainnet
};

const RELAYER_URLS = IS_PRODUCTION ? mainnetRelayerUrls : testRpcRelayerUrls;
const PROVIDER_CREATOR_FN = IS_PRODUCTION ? createMainnetProviderEngine : createTestProviderEngine;
const ZERO_EX_CONFIG: ZeroExConfig = IS_PRODUCTION ? mainnetZeroExConfig : testZeroExConfig;

export const config = {
    IS_PRODUCTION,
    ARBITRAGE_PROFIT_MARGIN: 1.05,
    QUOTE_TOKEN_SYMBOL: 'WETH',
    BASE_TOKEN_SYMBOL: 'ZRX',
    BOT_ADDRESS: process.env.BOT_ADDRESS,
    BOT_PRIVATE_KEY: process.env.BOT_PRIVATE_KEY,
    RELAYER_URLS,
    PROVIDER_CREATOR_FN,
    ZERO_EX_CONFIG
}
