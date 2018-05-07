import { ZeroEx } from '0x.js';
import {
    OrderbookChannel,
    OrderbookChannelHandler,
    OrderbookChannelSubscriptionOpts,
    OrderbookResponse,
    SignedOrder,
    WebSocketOrderbookChannel,
    WebSocketOrderbookChannelConfig,
} from '@0xproject/connect';

import { AggregateOrderbook } from './aggregate_orderbook';

// tslint:disable-next-line:no-var-requires
const debugOrderbook = require('debug')('orderbook');
// tslint:disable-next-line:no-var-requires
const debugOrderWatcher = require('debug')('orderwatcher');

export class WebsocketOrderbookFetcher implements OrderbookChannelHandler {
    private _aggregateOrderbook: AggregateOrderbook;
    private _debug: any;
    private _name: string;
    private _zeroEx: ZeroEx;
    private _orderbookChannel: OrderbookChannel;
    constructor(
        zeroEx: ZeroEx,
        url: string,
        aggregateOrderbook: AggregateOrderbook,
        channelConfig: WebSocketOrderbookChannelConfig,
    ) {
        const config = {
            heartbeatIntervalMs: 10000,
            ...channelConfig,
        };
        this._aggregateOrderbook = aggregateOrderbook;
        this._orderbookChannel = new WebSocketOrderbookChannel(url, config);
        this._zeroEx = zeroEx;
        this._debug = require('debug')('websocket-orderbook');
    }
    public subscribe(subscriptionOpts: OrderbookChannelSubscriptionOpts) {
        this._orderbookChannel.subscribe(subscriptionOpts, this);
    }
    public close() {
        this._orderbookChannel.close();
    }
    // tslint:disable-next-line:prefer-function-over-method
    public onSnapshot(
        channel: OrderbookChannel,
        subscriptionOpts: OrderbookChannelSubscriptionOpts,
        snapshot: OrderbookResponse,
    ) {
        snapshot.bids.forEach(order => this._processOrder(order));
        snapshot.asks.forEach(order => this._processOrder(order));
    }
    // tslint:disable-next-line:prefer-function-over-method
    public async onUpdate(
        channel: OrderbookChannel,
        subscriptionOpts: OrderbookChannelSubscriptionOpts,
        order: SignedOrder,
    ) {
        this._processOrder(order);
    }
    // tslint:disable-next-line:prefer-function-over-method
    public onError(channel: OrderbookChannel, subscriptionOpts: OrderbookChannelSubscriptionOpts, err: Error) {
        debugOrderbook(`ERROR: ${err}`);
    }
    // tslint:disable-next-line:prefer-function-over-method
    public onClose(channel: OrderbookChannel, subscriptionOpts: OrderbookChannelSubscriptionOpts) {
        debugOrderbook(`CLOSE`);
    }

    private _processOrder(order: SignedOrder) {
        this._aggregateOrderbook.addOrder(order);
    }
}
