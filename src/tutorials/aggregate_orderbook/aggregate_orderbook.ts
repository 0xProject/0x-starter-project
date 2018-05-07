import { ZeroEx } from '0x.js';
import { OrderStateWatcher } from '0x.js/lib/src/order_watcher/order_state_watcher';
import { OrderState, OrderStateInvalid, OrderStateValid, OrderStateWatcherConfig } from '0x.js/lib/src/types';
import { SignedOrder } from '@0xproject/connect';
import { BigNumber } from '@0xproject/utils';

// tslint:disable-next-line:no-var-requires
const debug = require('debug')('aggregateOrderbook');
// tslint:disable-next-line:no-var-requires
const debugOrderWatcher = require('debug')('orderwatcher');

export interface SignedOrderWithState {
    order: SignedOrder;
    state: OrderState;
}
export interface OrderbookBidAsks {
    baseTokenAddress: string;
    quoteTokenAddress: string;
    bids: SignedOrderWithState[];
    asks: SignedOrderWithState[];
}
interface Orderbook {
    [baseTokenAddress: string]: {
        [quoteTokenAddress: string]: SignedOrderWithState[];
    };
}
interface OrderbookSubscriptions {
    [baseTokenAddress: string]: {
        [quoteTokenAddress: string]: OnOrderbookChangeCallback[];
    };
}
export declare type OnOrderbookChangeCallback = (orderBook: OrderbookBidAsks) => void;

export class AggregateOrderbook {
    private _subscriptions: OrderbookSubscriptions;
    private _orderbook: Orderbook;
    private _orderWatcher: OrderStateWatcher;
    private _orders: { [key: string]: SignedOrder };
    private _name: string;
    private _zeroEx: ZeroEx;
    constructor(zeroEx: ZeroEx, orderStateWatcherConfig: OrderStateWatcherConfig) {
        this._zeroEx = zeroEx;
        this._orders = {};
        this._orderbook = {};
        this._orderWatcher = zeroEx.createOrderStateWatcher(orderStateWatcherConfig);
        this._orderWatcher.subscribe(this._orderWatcherSubscribe.bind(this));
        this._subscriptions = {};
    }
    public subscribe(baseTokenAddress: string, quoteTokenAddress: string, callback: OnOrderbookChangeCallback) {
        const baseTokenSubscription = this._subscriptions[baseTokenAddress];
        if (baseTokenSubscription === undefined) {
            this._subscriptions[baseTokenAddress] = {};
        }
        const tokenPairSubscription = this._subscriptions[baseTokenAddress][quoteTokenAddress];
        if (tokenPairSubscription === undefined) {
            this._subscriptions[baseTokenAddress][quoteTokenAddress] = [];
        }
        this._subscriptions[baseTokenAddress][quoteTokenAddress].push(callback);
    }
    public async addOrder(order: SignedOrder) {
        const orderHash = ZeroEx.getOrderHashHex(order);
        if (!this._orders[orderHash]) {
            this._orders[orderHash] = order;
            this._orderWatcher.addOrder(order);
            const state = await this._zeroEx.exchange.getOrderStateAsync(order);
            const orderWithState = { order, state };
            this._addOrderToOrderBook(orderWithState);
        }
    }
    public getBidsAndAsks(baseTokenAddress: string, quoteTokenAddress: string): OrderbookBidAsks {
        const bids = this._getOrders(baseTokenAddress, quoteTokenAddress);
        const asks = this._getOrders(quoteTokenAddress, baseTokenAddress);
        const bidsAndAsks = {
            baseTokenAddress,
            quoteTokenAddress,
            bids,
            asks,
        };
        return bidsAndAsks;
    }
    public getSpread(baseTokenAddress: string, quoteTokenAddress: string): BigNumber {
        const bidsAndAsks = this.getBidsAndAsks(baseTokenAddress, quoteTokenAddress);
        const bidAmounts = bidsAndAsks.bids
            .map(o => o.order.takerTokenAmount.dividedBy(o.order.makerTokenAmount))
            .sort((a, b) => a.minus(b).toNumber());
        const askAmounts = bidsAndAsks.asks
            .map(o => o.order.makerTokenAmount.dividedBy(o.order.takerTokenAmount))
            .sort((a, b) => a.minus(b).toNumber());
        const firstAsk = askAmounts[0];
        const firstBid = bidAmounts[0];
        if (firstAsk && firstBid) {
            const spread = firstBid.minus(firstAsk);
            return spread;
        }
        return new BigNumber(0);
    }
    private _getOrders(baseTokenAddress: string, quoteTokenAddress: string): SignedOrderWithState[] {
        const ordersForBaseToken = this._orderbook[baseTokenAddress];
        if (ordersForBaseToken === undefined) {
            this._orderbook[baseTokenAddress] = {};
        }
        const ordersForTokenPair = this._orderbook[baseTokenAddress][quoteTokenAddress];
        if (ordersForTokenPair === undefined) {
            this._orderbook[baseTokenAddress][quoteTokenAddress] = [];
        }
        return this._orderbook[baseTokenAddress][quoteTokenAddress];
    }
    private _addOrderToOrderBook(order: SignedOrderWithState) {
        if (order.state.isValid) {
            debug('%O', order);
            const orders = this._getOrders(order.order.makerTokenAddress, order.order.takerTokenAddress);
            orders.push(order);
            this._broadcastChange(order.order.makerTokenAddress, order.order.takerTokenAddress);
        } else {
            const invalidOrderState: OrderStateInvalid = order.state;
            debug('invalid state', order.state.orderHash, invalidOrderState.error);
        }
    }
    private _orderWatcherSubscribe(err: Error | null, orderState?: OrderState) {
        if (orderState) {
            if (orderState.isValid) {
                const validOrderState: OrderStateValid = orderState;
                debugOrderWatcher(`orderhash`, orderState.orderHash);
                debugOrderWatcher('%O', validOrderState.orderRelevantState);
                if (!this._orders[validOrderState.orderHash]) {
                    debug('removed order now valid', validOrderState.orderHash);
                }
            } else {
                const invalidOrderState: OrderStateInvalid = orderState;
                debugOrderWatcher(`invalid`, orderState.orderHash);
                debugOrderWatcher(invalidOrderState.error);
                // Remove the order from our order book as it is no longer valid
                this._removeOrder(orderState.orderHash);
            }
        } else {
            debugOrderWatcher(`error`, err);
        }
    }
    private _removeOrder(orderHash: string) {
        const order = this._orders[orderHash];
        if (order) {
            debug('remove', orderHash);
            const oldOrders = this._getOrders(order.makerTokenAddress, order.takerTokenAddress);
            const orderIndex = oldOrders.findIndex(o => o.state.orderHash === orderHash);
            const newOrders = oldOrders.splice(orderIndex, 1);
            this._orderbook[order.makerTokenAddress][order.takerTokenAddress] = newOrders;
            delete this._orders[orderHash];
            this._broadcastChange(order.makerTokenAddress, order.takerTokenAddress);
        }
    }
    private _broadcastChange(baseTokenAddress: string, quoteTokenAddress: string) {
        let subscriptions =
            this._subscriptions[baseTokenAddress] && this._subscriptions[baseTokenAddress][quoteTokenAddress]
                ? this._subscriptions[baseTokenAddress][quoteTokenAddress]
                : [];
        const bidsAndAsks = this.getBidsAndAsks(baseTokenAddress, quoteTokenAddress);
        subscriptions.forEach(subscription => subscription(bidsAndAsks));
        subscriptions =
            this._subscriptions[quoteTokenAddress] && this._subscriptions[quoteTokenAddress][baseTokenAddress]
                ? this._subscriptions[quoteTokenAddress][baseTokenAddress]
                : [];
        subscriptions.forEach(subscription => subscription(bidsAndAsks));
    }
}
