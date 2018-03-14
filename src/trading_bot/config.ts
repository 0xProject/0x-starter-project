import * as Web3 from 'web3';

export const config = {
    ARBITRAGE_PROFIT_MARGIN: 1.05,
    QUOTE_TOKEN_SYMBOL: 'WETH',
    BASE_TOKEN_SYMBOL: 'ZRX'
}

// Local mode
const testRpcRelayerUrls = [
    'http://localhost:3000/v0'
]
const testProvider = new Web3.providers.HttpProvider('http://localhost:8545');

// Production mode
const mainnetRelayerUrls = [
    'https://api.radarrelay.com/0x/v0/',
    'https://api.ercdex.com/api/standard/1/v0/'
]
const mainnetProvider = new Web3.providers.HttpProvider('http://localhost:8545');


var IS_PRODUCTION = false;
export const RELAYER_URLS = IS_PRODUCTION ? mainnetRelayerUrls : testRpcRelayerUrls;
export const PROVIDER: Web3.Provider = IS_PRODUCTION ? mainnetProvider : testProvider;

