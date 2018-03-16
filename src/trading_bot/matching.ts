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

// TODO: should be pulled out into shared dependency in 0x.js
import { OrderStateUtils } from '0x.js/lib/src/utils/order_state_utils';

async function nextOrder(iter: IterableIterator<SignedOrder>, orderStateUtils: OrderStateUtils, takerAddress?: string) {
    let order: SignedOrder;
    let state: OrderState | null = null;
    let availableMakerAmount: BigNumber = new BigNumber(0);
    while ((order = iter.next().value)) {
        // If the taker is set, we won't be able to fill this order
        if (order.taker != ZeroEx.NULL_ADDRESS && order.taker != takerAddress) { continue; }

        state = await orderStateUtils.getOrderStateAsync(order);

        // Go to next order if in an invalid state
        if (!state.isValid) { console.log(state.error); continue; }

        // Check that there is some available fill amount
        availableMakerAmount = (state as OrderStateValid).orderRelevantState.remainingFillableMakerTokenAmount;
        if (availableMakerAmount.greaterThan(0)) { break; }
    }

    if (!order) { return null; }

    // At this point, state must be valid
    const validState = (state as OrderStateValid);
    return { order, state: validState }
}

function orderBatchGenerator(zeroEx: ZeroEx, orderStateUtils: OrderStateUtils, bids: SignedOrder[], asks: SignedOrder[],
                             quoteTokenInfo: Token, baseTokenInfo: Token):
    () => Promise<OrderFillRequest[] | null> {
    // Returns batches of orders that result in positive arbitrage.
    // Terminates with a null return value;
    const bidIterator = helpers.sortOrders(bids, quoteTokenInfo, baseTokenInfo)[Symbol.iterator]();
    const askIterator = helpers.sortOrders(asks, baseTokenInfo, quoteTokenInfo)[Symbol.iterator]();

    let bid: { order: SignedOrder, state: OrderStateValid } | null;
    let ask: { order: SignedOrder, state: OrderStateValid } | null;
    const gen = async (): Promise<OrderFillRequest[] | null> => {
        // Find next bid that has available fill amount
        bid = await nextOrder(bidIterator, orderStateUtils);

        // There may be an ask with available fill amount from prev run (mainly for initial run)
        if (!ask) { ask = await nextOrder(askIterator, orderStateUtils); }

        if (!bid || !ask) {
            // Reached end of one of the lists
            return null;
        }

        let availableBidMakerAmount = bid.state.orderRelevantState.remainingFillableMakerTokenAmount;
        let availableAskTakerAmount = ask.state.orderRelevantState.remainingFillableTakerTokenAmount;
        let initialAvailableBidAmount = availableBidMakerAmount;

        const matchingAsks = [];
        while (availableBidMakerAmount.gt(0)) {
            // Check that bid exchange rate is better than ask, and give 5% leeway for fees and gas
            const bidExchangeRate = helpers.getExchangeRate(bid.order, quoteTokenInfo, baseTokenInfo);
            const askExchangeRate = helpers.getExchangeRate(ask.order, baseTokenInfo, quoteTokenInfo);
            if (bidExchangeRate.mul(askExchangeRate).lte(config.ARBITRAGE_PROFIT_MARGIN)) {
                break;
            }

            if (availableAskTakerAmount.gt(0)) {
                // Check if current ask can completely fill bid
                if (availableAskTakerAmount.gte(availableBidMakerAmount)) {
                    matchingAsks.push({ signedOrder: ask.order, takerTokenFillAmount: availableBidMakerAmount });
                    availableAskTakerAmount = availableAskTakerAmount.minus(availableBidMakerAmount);
                    availableBidMakerAmount = new BigNumber(0);
                }
                // Otherwise, completely fill ask
                else {
                    matchingAsks.push({ signedOrder: ask.order, takerTokenFillAmount: availableAskTakerAmount });
                    availableBidMakerAmount = availableBidMakerAmount.minus(availableAskTakerAmount);
                }
            }

            ask = await nextOrder(askIterator, orderStateUtils);
            if (!ask) { break; }
        }

        if (matchingAsks.length > 0) {
            const bidMakerFillAmount = initialAvailableBidAmount.minus(availableBidMakerAmount);
            const bidTakerFillAmount = helpers.convertMakerToTakerAmount(bid.order, bidMakerFillAmount, quoteTokenInfo, baseTokenInfo);
            const bidOrderRequest: OrderFillRequest = { signedOrder: bid.order, takerTokenFillAmount: bidTakerFillAmount };
            const orderFillRequests: OrderFillRequest[] = [bidOrderRequest, ...matchingAsks];

            return orderFillRequests;
        }

        // No asks to match this bid
        return null;
    }

    return gen;
}

// For testing
export const matchingFunctions = {
    nextOrder,
    orderBatchGenerator
}
