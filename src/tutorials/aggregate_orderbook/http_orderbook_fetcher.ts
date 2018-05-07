import { ZeroEx } from '0x.js';
import { HttpClient, OrderbookRequest, OrderbookResponse, SignedOrder } from '@0xproject/connect';

import { AggregateOrderbook } from './aggregate_orderbook';

// tslint:disable-next-line:no-var-requires
const debugOrderbook = require('debug')('orderbook-http');

export interface TokenBasePair {
    baseTokenAddress: string;
    quoteTokenAddress: string;
}

export class HTTPOrderBookFetcher {
    public _aggregateOrderbook: AggregateOrderbook;
    private _request: OrderbookRequest;
    private _client: HttpClient;
    private _debug: any;
    private _name: string;
    private _zeroEx: ZeroEx;
    constructor(
        zeroEx: ZeroEx,
        aggregateOrderbook: AggregateOrderbook,
        name: string,
        url: string,
        tokenBasePair: TokenBasePair,
        timeout: number = 5000,
    ) {
        this._zeroEx = zeroEx;
        this._aggregateOrderbook = aggregateOrderbook;
        this._name = name;
        this._debug = require('debug')(`orderbook-http:${this._name}`);
        this._client = new HttpClient(url);
        this._debug('url', url);
        this._request = tokenBasePair;
        setInterval(() => {
            void this._fetchAndProcessOrderBookAsync();
        }, timeout);
    }
    private async _fetchOrderBookAsync(): Promise<OrderbookResponse> {
        try {
            const response = await this._client.getOrderbookAsync(this._request);
            return response;
        } catch (err) {
            this._debug(err);
            throw err;
        }
    }
    private async _fetchAndProcessOrderBookAsync() {
        const response = await this._fetchOrderBookAsync();
        response.asks.forEach(async order => this._processOrder(order));
        response.bids.forEach(async order => this._processOrder(order));
    }
    private async _processOrder(order: SignedOrder) {
        this._aggregateOrderbook.addOrder(order);
    }
}
