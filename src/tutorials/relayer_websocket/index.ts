import {
    ZeroEx,
    ZeroExConfig,
} from '0x.js';
import {
    OrderbookChannel,
    OrderbookChannelHandler,
    OrderbookChannelSubscriptionOpts,
    WebSocketOrderbookChannel,
} from '@0xproject/connect';
import * as Web3 from 'web3';

import {CustomOrderbookChannelHandler} from './custom_orderbook_channel_handler';

const mainAsync = async () => {
    // Provider pointing to local TestRPC on default port 8545
    const provider = new Web3.providers.HttpProvider('http://localhost:8545');

    // Instantiate 0x.js instance
    const zeroExConfig: ZeroExConfig = {
        networkId: 50, // testrpc
    };
    const zeroEx = new ZeroEx(provider, zeroExConfig);

    // Instantiate an orderbook channel pointing to a local server on port 3001
    const relayerWsApiUrl = 'http://localhost:3001/v0';
    const orderbookChannel: OrderbookChannel = new WebSocketOrderbookChannel(relayerWsApiUrl);

    // Get exchange contract address
    const EXCHANGE_ADDRESS = await zeroEx.exchange.getContractAddress();

    // Get token information
    const wethTokenInfo = await zeroEx.tokenRegistry.getTokenBySymbolIfExistsAsync('WETH');
    const zrxTokenInfo = await zeroEx.tokenRegistry.getTokenBySymbolIfExistsAsync('ZRX');

    // Check if either getTokenBySymbolIfExistsAsync query resulted in undefined
    if (wethTokenInfo === undefined || zrxTokenInfo === undefined) {
        throw new Error('could not find token info');
    }

    // Get token contract addresses
    const WETH_ADDRESS = wethTokenInfo.address;
    const ZRX_ADDRESS = zrxTokenInfo.address;

    // Generate OrderbookChannelSubscriptionOpts for watching the ZRX/WETH orderbook
    const zrxWethSubscriptionOpts: OrderbookChannelSubscriptionOpts = {
        baseTokenAddress: ZRX_ADDRESS,
        quoteTokenAddress: WETH_ADDRESS,
        snapshot: true,
        limit: 20,
    };

    // Create a OrderbookChannelHandler to handle messages from the relayer
    const orderbookChannelHandler: OrderbookChannelHandler = new CustomOrderbookChannelHandler(zeroEx);

    // Subscribe to the relayer
    orderbookChannel.subscribe(zrxWethSubscriptionOpts, orderbookChannelHandler);
    console.log('Listening for ZRX/WETH orderbook...');
};

mainAsync().catch(console.error);
