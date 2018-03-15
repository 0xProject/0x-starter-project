import {
    ZeroEx,
    ZeroExConfig,
    OrderFillRequest,
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

function sortOrders(orders: SignedOrder[]) {
    // Bids will be sorted by desc rate, asks will be sorted by asc rate
    return orders.sort((orderA, orderB) => {
        const orderRateA = helpers.getExchangeRate(orderA);
        const orderRateB = helpers.getExchangeRate(orderB);
        return orderRateB.comparedTo(orderRateA);
    });
}

function orderBatchGenerator(zeroEx: ZeroEx, bids: SignedOrder[], asks: SignedOrder[]): () => Promise<OrderFillRequest[]|null> {
    // Returns batches of orders that result in positive arbitrage.
    // Terminates with a null return value;
    const bidIterator = sortOrders(bids)[Symbol.iterator]();
    const askIterator = sortOrders(asks)[Symbol.iterator]();

    const nextBid = async () => {
        let bid = bidIterator.next().value;

        if (!bid) { return null; }

        let availableMakerAmount = await helpers.getFillableMakerAmount(zeroEx, bid);
        return {order: bid, availableMakerAmount}
    }
    const nextAsk = async () => {
        let ask = askIterator.next().value;

        if (!ask) { return null; }

        let availableTakerAmount = await helpers.getFillableTakerAmount(zeroEx, ask);
        return {order: ask, availableTakerAmount}
    }
    
    var bid: {order: SignedOrder, availableMakerAmount: BigNumber}|null;
    var ask: {order: SignedOrder, availableTakerAmount: BigNumber}|null;
    var gen = async (): Promise<OrderFillRequest[]|null> => {
        // Find next bid that has available fill amount
        bid = await nextBid();
        while (bid && bid.availableMakerAmount.lte(0)) {
            bid = await nextBid();
        }
        // There may be an ask with available fill amount from prev run (mainly for initial run)
        if (!ask) { ask = await nextAsk(); }

        if (!bid || !ask) {
            // Reached end of one of the lists
            return null;
        }

        let initialAvailableBidAmount = bid.availableMakerAmount;
        let matchingAsks = [];
        while (bid.availableMakerAmount.gt(0)) {
            // Check that bid exchange rate is better than ask, and give 5% leeway for fees and gas
            if (helpers.getExchangeRate(bid.order).mul(helpers.getExchangeRate(ask.order)).lte(config.ARBITRAGE_PROFIT_MARGIN)) {
                break;
            }

            if (ask.availableTakerAmount.gt(0)) {
                // Check if current ask can completely fill bid
                if (ask.availableTakerAmount.gte(bid.availableMakerAmount)) {
                    matchingAsks.push({signedOrder: ask.order, takerTokenFillAmount: bid.availableMakerAmount});
                    ask.availableTakerAmount = ask.availableTakerAmount.minus(bid.availableMakerAmount);
                    bid.availableMakerAmount = new BigNumber(0);
                } 
                // Otherwise, completely fill ask
                else {
                    matchingAsks.push({signedOrder: ask.order, takerTokenFillAmount: ask.availableTakerAmount});
                    bid.availableMakerAmount = bid.availableMakerAmount.minus(ask.availableTakerAmount);
                }
            }
            
            ask = await nextAsk();
            if (!ask) { break; }
        }

        if (matchingAsks.length > 0) {
            let bidMakerFillAmount = initialAvailableBidAmount.minus(bid.availableMakerAmount);
            let bidTakerFillAmount = bidMakerFillAmount.div(helpers.getExchangeRate(bid.order)).round();
            let bidOrderRequest: OrderFillRequest = {signedOrder: bid.order, takerTokenFillAmount: bidTakerFillAmount};
            let orderFillRequests: OrderFillRequest[] = [bidOrderRequest, ...matchingAsks];

            return orderFillRequests;
        }
        
        // No asks to match this bid
        return null;
    }

    return gen;
}

const mainAsync = async () => {
    // Create a provider engine
    const providerEngine = config.PROVIDER_CREATOR_FN();

    // Instantiate 0x.js instance
    const zeroEx = new ZeroEx(providerEngine, config.ZERO_EX_CONFIG);

    // Instantiate relayer clients
    const relayerClients = config.RELAYER_URLS.map(url => new HttpClient(url));

    // Get exchange contract address
    const EXCHANGE_ADDRESS = zeroEx.exchange.getContractAddress();

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
    const sortedBids = sortOrders(_.flatten(orderbookResponses.map(o => o.bids)));
    const sortedAsks = sortOrders(_.flatten(orderbookResponses.map(o => o.asks)));

    // Calculate and print out the exchange rates
    const bid_rates = sortedBids.map(order => {
        let rate = helpers.getExchangeRate(order).toFormat(4);
        let takerAmt = ZeroEx.toUnitAmount(order.takerTokenAmount, baseTokenInfo.decimals);
        let makerAmt = ZeroEx.toUnitAmount(order.makerTokenAmount, quoteTokenInfo.decimals);
        let orderHash = ZeroEx.getOrderHashHex(order).substring(0,5);
        return (`${rate} ${quoteSymbol}/${baseSymbol}, buying ${takerAmt} ${baseSymbol}, selling ${makerAmt} ${quoteSymbol}, ${orderHash}`);
    });
    console.log('Bids:');
    console.log(bid_rates);

    const ask_rates = sortedAsks.map(order => {
        let rate = new BigNumber(1).div(helpers.getExchangeRate(order)).toFormat(4);
        let takerAmt = ZeroEx.toUnitAmount(order.takerTokenAmount, quoteTokenInfo.decimals);
        let makerAmt = ZeroEx.toUnitAmount(order.makerTokenAmount, baseTokenInfo.decimals);
        let orderHash = ZeroEx.getOrderHashHex(order).substring(0,5);
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
    const orderGen = orderBatchGenerator(zeroEx, sortedBids, sortedAsks);
    let batch: OrderFillRequest[]|null;
    let batches: OrderFillRequest[][] = [];
    while ((batch = await orderGen())) {
        let bid = batch[0];
        let asks = batch.slice(1);
        let bidTakerFillAmount = ZeroEx.toUnitAmount(bid.takerTokenFillAmount, baseTokenInfo.decimals);
        let bidMakerFillAmount = ZeroEx.toUnitAmount(helpers.convertTakerToMakerAmount(bid.signedOrder, bid.takerTokenFillAmount), quoteTokenInfo.decimals)
        let bidOrderHash = ZeroEx.getOrderHashHex(bid.signedOrder).substring(0,8)
        console.log('--------------------------------');
        console.log(`Bid: ${bidTakerFillAmount} ${baseSymbol} -> ${bidMakerFillAmount} ${quoteSymbol}, ${bidOrderHash}`);
        for (let ask of asks) {
            let askTakerFillAmount = ZeroEx.toUnitAmount(ask.takerTokenFillAmount, quoteTokenInfo.decimals);
            let askMakerFillAmount = ZeroEx.toUnitAmount(helpers.convertTakerToMakerAmount(ask.signedOrder, ask.takerTokenFillAmount), baseTokenInfo.decimals);
            let askOrderHash = ZeroEx.getOrderHashHex(ask.signedOrder).substring(0,8);
            console.log(`Ask: ${askTakerFillAmount} ${quoteSymbol} -> ${askMakerFillAmount} ${baseSymbol}, ${askOrderHash}`);
        }

        batches.push(batch);
    }
    console.log('--------------------------------');

    console.log('BATCH FILL OR KILL REMOVED');
    // const txnHashes = await Promise.all(batches.map(async (batch) => {
    //     return zeroEx.exchange.batchFillOrKillAsync(batch, zrxOwnerAddress);
    // }));
    // await Promise.all(txnHashes.map((txnHash) => {
    //     return zeroEx.awaitTransactionMinedAsync(txnHash);
    // }))

    // Get balances after the fill
    const baseBalanceAfterFill = await zeroEx.token.getBalanceAsync(baseTokenAddress, zrxOwnerAddress);
    const quoteBalanceAfterFill = await zeroEx.token.getBalanceAsync(quoteTokenAddress, zrxOwnerAddress);
    console.log(`${baseSymbol} After: ` + ZeroEx.toUnitAmount(baseBalanceAfterFill, baseTokenInfo.decimals).toString());
    console.log(`${quoteSymbol} After: ` + ZeroEx.toUnitAmount(quoteBalanceAfterFill, quoteTokenInfo.decimals).toString());

    // Stop the providerEngine so that the process can end
    providerEngine.stop()
};

mainAsync().catch(console.error);
