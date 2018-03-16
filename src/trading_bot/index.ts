import {
    ZeroEx,
    ZeroExConfig,
    OrderFillRequest,
    OrderState,
    OrderStateValid,
    Token
} from '0x.js';
import {
    FeesRequest,
    FeesResponse,
    HttpClient,
    Order,
    OrderbookRequest,
    OrderbookResponse,
    SignedOrder,
} from '@0xproject/connect';
import { BigNumber } from '@0xproject/utils';
import { config } from './config';
import * as _ from 'lodash';
import { helpers } from './helpers';
import { matchingFunctions } from './matching';

// TODO: should be pulled out into shared dependency in 0x.js
import { OrderStateUtils } from '0x.js/lib/src/utils/order_state_utils';

const mainAsync = async () => {
    // Create a provider engine
    const providerEngine = config.PROVIDER_CREATOR_FN();

    // Instantiate 0x.js instance
    const zeroEx = new ZeroEx(providerEngine, config.ZERO_EX_CONFIG);

    // Instantiate relayer clients
    const relayerClients = config.RELAYER_URLS.map(url => new HttpClient(url));

    // Get exchange contract address
    const EXCHANGE_ADDRESS = zeroEx.exchange.getContractAddress();

    // HACK: Grab the OrderStateUtils object from the OrderStateWatcher so we can query 
    // for available maker/taker fill amounts. This class should be exposed on 0x.js so 
    // we can directly access it.
    const orderStateUtils: OrderStateUtils = (zeroEx.orderStateWatcher as any)._orderStateUtils;

    // Get the symbols from config
    const quoteSymbol = config.QUOTE_TOKEN_SYMBOL;
    const baseSymbol = config.BASE_TOKEN_SYMBOL;

    // Get token information
    const quoteTokenInfo = await zeroEx.tokenRegistry.getTokenBySymbolIfExistsAsync(quoteSymbol);
    const baseTokenInfo = await zeroEx.tokenRegistry.getTokenBySymbolIfExistsAsync(baseSymbol);

    // Check if either getTokenBySymbolIfExistsAsync query resulted in undefined
    if (quoteTokenInfo === undefined || baseTokenInfo === undefined) {
        throw new Error('could not find token info');
    }

    console.log('Quote Token Info: ');
    console.log(quoteTokenInfo);
    console.log('Base Token Info: ');
    console.log(baseTokenInfo);

    // Get token contract addresses
    const quoteTokenAddress = quoteTokenInfo.address;
    const baseTokenAddress = baseTokenInfo.address;

    // Get all available addresses
    const addresses = await zeroEx.getAvailableAddressesAsync();

    // Get the first address, this address is preloaded with a ZRX balance from the snapshot
    const zrxOwnerAddress = addresses[0];

    // Generate orderbook request for pair
    const orderbookRequest: OrderbookRequest = {
        baseTokenAddress, quoteTokenAddress,
    };

    // Send orderbook request to relayer and receive an OrderbookResponse instance
    const orderbookResponses: OrderbookResponse[] = await Promise.all(relayerClients.map((relayer) => {
        return relayer.getOrderbookAsync(orderbookRequest);
    }));

    // Combine and sort all orderbooks
    const sortedBids = helpers.sortOrders(_.flatten(orderbookResponses.map(o => o.bids)), quoteTokenInfo, baseTokenInfo);
    const sortedAsks = helpers.sortOrders(_.flatten(orderbookResponses.map(o => o.asks)), baseTokenInfo, quoteTokenInfo);

    // Calculate and print out the exchange rates
    const bid_rates = sortedBids.map(order => {
        const rate = helpers.getExchangeRate(order, quoteTokenInfo, baseTokenInfo).toFormat(4);
        const takerAmt = ZeroEx.toUnitAmount(order.takerTokenAmount, baseTokenInfo.decimals);
        const makerAmt = ZeroEx.toUnitAmount(order.makerTokenAmount, quoteTokenInfo.decimals);
        const orderHash = ZeroEx.getOrderHashHex(order).substring(0, 5);
        return (`${rate} ${quoteSymbol}/${baseSymbol}, buying ${takerAmt} ${baseSymbol}, selling ${makerAmt} ${quoteSymbol}, ${orderHash}`);
    });
    console.log('Bids:');
    console.log(bid_rates);

    const ask_rates = sortedAsks.map(order => {
        const rate = new BigNumber(1).div(helpers.getExchangeRate(order, baseTokenInfo, quoteTokenInfo)).toFormat(4);
        const takerAmt = ZeroEx.toUnitAmount(order.takerTokenAmount, quoteTokenInfo.decimals);
        const makerAmt = ZeroEx.toUnitAmount(order.makerTokenAmount, baseTokenInfo.decimals);
        const orderHash = ZeroEx.getOrderHashHex(order).substring(0, 5);
        return (`${rate} ${quoteSymbol}/${baseSymbol}, buying ${takerAmt} ${quoteSymbol}, selling ${makerAmt} ${baseSymbol}, ${orderHash}`);
    });
    console.log('Asks:');
    console.log(ask_rates);


    // Get balances before the fill
    const baseBalanceBeforeFill = await zeroEx.token.getBalanceAsync(baseTokenAddress, zrxOwnerAddress);
    const quoteBalanceBeforeFill = await zeroEx.token.getBalanceAsync(quoteTokenAddress, zrxOwnerAddress);
    console.log(`${baseSymbol} Before: ` + ZeroEx.toUnitAmount(baseBalanceBeforeFill, baseTokenInfo.decimals).toString());
    console.log(`${quoteSymbol} Before: ` + ZeroEx.toUnitAmount(quoteBalanceBeforeFill, quoteTokenInfo.decimals).toString());

    // Iterate through batches and fill them
    const orderGen = matchingFunctions.orderBatchGenerator(zeroEx, orderStateUtils, sortedBids, sortedAsks, quoteTokenInfo, baseTokenInfo);
    let batch: OrderFillRequest[] | null;
    const batches: OrderFillRequest[][] = [];
    while ((batch = await orderGen())) {
        const bid = batch[0];
        const asks = batch.slice(1);
        const bidTakerFillAmount = ZeroEx.toUnitAmount(bid.takerTokenFillAmount, baseTokenInfo.decimals);
        const bidMakerFillBaseUnitAmount = helpers.convertTakerToMakerAmount(bid.signedOrder, bid.takerTokenFillAmount, quoteTokenInfo, baseTokenInfo);
        const bidMakerFillAmount = ZeroEx.toUnitAmount(bidMakerFillBaseUnitAmount, quoteTokenInfo.decimals)
        const bidOrderHash = ZeroEx.getOrderHashHex(bid.signedOrder).substring(0, 8)
        console.log('--------------------------------');
        console.log(`Bid: ${bidTakerFillAmount} ${baseSymbol} -> ${bidMakerFillAmount} ${quoteSymbol}, ${bidOrderHash}`);
        for (const ask of asks) {
            const askTakerFillAmount = ZeroEx.toUnitAmount(ask.takerTokenFillAmount, quoteTokenInfo.decimals);
            const askMakerFillBaseUnitAmount = helpers.convertTakerToMakerAmount(ask.signedOrder, ask.takerTokenFillAmount, baseTokenInfo, quoteTokenInfo);
            const askMakerFillAmount = ZeroEx.toUnitAmount(askMakerFillBaseUnitAmount, baseTokenInfo.decimals);
            const askOrderHash = ZeroEx.getOrderHashHex(ask.signedOrder).substring(0, 8);
            console.log(`Ask: ${askTakerFillAmount} ${quoteSymbol} -> ${askMakerFillAmount} ${baseSymbol}, ${askOrderHash}`);
        }

        batches.push(batch);
    }
    console.log('--------------------------------');

    if (config.IS_PRODUCTION) {
        console.log('BATCH FILL OR KILL REMOVED');
    } else {
        const txnHashes = await Promise.all(batches.map(async (batch) => {
            return zeroEx.exchange.batchFillOrKillAsync(batch, zrxOwnerAddress);
        }));
        await Promise.all(txnHashes.map((txnHash) => {
            return zeroEx.awaitTransactionMinedAsync(txnHash);
        }))
    }

    // Get balances after the fill
    const baseBalanceAfterFill = await zeroEx.token.getBalanceAsync(baseTokenAddress, zrxOwnerAddress);
    const quoteBalanceAfterFill = await zeroEx.token.getBalanceAsync(quoteTokenAddress, zrxOwnerAddress);
    console.log(`${baseSymbol} After: ` + ZeroEx.toUnitAmount(baseBalanceAfterFill, baseTokenInfo.decimals).toString());
    console.log(`${quoteSymbol} After: ` + ZeroEx.toUnitAmount(quoteBalanceAfterFill, quoteTokenInfo.decimals).toString());

    // Stop the providerEngine so that the process can end
    providerEngine.stop()
};

mainAsync().catch(console.error);
