import { BlockParamLiteral, ZeroEx, ZeroExConfig } from '0x.js';
import { OrderStateWatcherConfig } from '0x.js/lib/src/types';
import { OrderbookChannelSubscriptionOpts, WebSocketOrderbookChannelConfig } from '@0xproject/connect';
import { BigNumber } from '@0xproject/utils';
import Web3ProviderEngine = require('web3-provider-engine');
import RpcSubprovider = require('web3-provider-engine/subproviders/rpc');
import WebSocketSubprovider = require('web3-provider-engine/subproviders/websocket');

import { AggregateOrderbook } from './aggregate_orderbook';
import { HTTPOrderBookFetcher } from './http_orderbook_fetcher';
import { networkId, providerEngine, web3 } from './web3_provider';
import { WebsocketOrderbookFetcher } from './websocket_orderbook_fetcher';

// tslint:disable-next-line:no-var-requires
const debug = require('debug')('main');

process.on('unhandledRejection', (reason, p) => {
    debug('Possibly Unhandled Rejection at: Promise ', p, ' reason: ', reason);
});

const WEBSOCKET_ENDPOINTS = {
    1: ['wss://ws.radarrelay.com/0x/v0/ws'],
    42: ['wss://ws.kovan.radarrelay.com/0x/v0/ws'],
};
const HTTP_ENDPOINTS = {
    1: [
        'https://api.radarrelay.com/0x/v0/',
        'https://api.ercdex.com/api/standard/1/v0/',
        //  'https://sra.bamboorelay.com/main/v0/',
    ],
    42: [
        'https://api.kovan.radarrelay.com/0x/v0/',
        'https://api.ercdex.com/api/standard/42/v0/',
        // 'https://sra.bamboorelay.com/kovan/v0/',
    ],
};

const mainAsync = async () => {
    providerEngine.start();
    // Instantiate 0x.js instance
    const zeroExConfig: ZeroExConfig = {
        networkId,
    };
    const zeroEx = new ZeroEx(web3.currentProvider, zeroExConfig);
    // Get token information
    const wethTokenInfo = await zeroEx.tokenRegistry.getTokenBySymbolIfExistsAsync('WETH');
    const zrxTokenInfo = await zeroEx.tokenRegistry.getTokenBySymbolIfExistsAsync('ZRX');
    // Check if either getTokenBySymbolIfExistsAsync query resulted in undefined
    if (wethTokenInfo === undefined || zrxTokenInfo === undefined) {
        throw new Error('could not find token info');
    }
    debug('wethTokenAddress', wethTokenInfo.address);
    debug('zrxTokenAddress', zrxTokenInfo.address);

    // Get token contract addresses
    const WETH_ADDRESS = wethTokenInfo.address;
    const ZRX_ADDRESS = zrxTokenInfo.address;
    const orderStateWatcherConfig: OrderStateWatcherConfig = {
        stateLayer: BlockParamLiteral.Latest,
    };
    // Create our Aggregate Orderbook
    const aggregateOrderbook = new AggregateOrderbook(zeroEx, orderStateWatcherConfig);
    aggregateOrderbook.subscribe(ZRX_ADDRESS, WETH_ADDRESS, orderBook => {
        const spread = aggregateOrderbook.getSpread(ZRX_ADDRESS, WETH_ADDRESS);
        debug('orderbook', orderBook);
        debug('spread:ZRX/WETH', spread.toString());
    });

    const zrxWethBaseConfig = {
        baseTokenAddress: ZRX_ADDRESS,
        quoteTokenAddress: WETH_ADDRESS,
    };
    const defaultOrderbookChannelSubscriptionOpts = {
        snapshot: true,
        limit: 20,
    };
    // Generate OrderbookChannelSubscriptionOpts for watching the ZRX/WETH orderbook
    const zrxWethSubscriptionOpts: OrderbookChannelSubscriptionOpts = {
        ...defaultOrderbookChannelSubscriptionOpts,
        ...zrxWethBaseConfig,
    };
    // Websocket Fetcher
    const websocketEndpoints = WEBSOCKET_ENDPOINTS[networkId];
    const channelConfig: WebSocketOrderbookChannelConfig = { heartbeatIntervalMs: 10000 };
    websocketEndpoints.forEach(endpoint => {
        const websocketOrderbookFetcher = new WebsocketOrderbookFetcher(
            zeroEx,
            endpoint,
            aggregateOrderbook,
            channelConfig,
        );
        websocketOrderbookFetcher.subscribe(zrxWethSubscriptionOpts);
    });

    // HTTP Fetcher
    const httpEndpoints = HTTP_ENDPOINTS[networkId];
    httpEndpoints.forEach(endpoint => {
        const zrxWethHttpOrderbook = new HTTPOrderBookFetcher(
            zeroEx,
            aggregateOrderbook,
            'ZRX/WETH',
            endpoint,
            zrxWethBaseConfig,
        );
    });
};

mainAsync().catch(console.error);
