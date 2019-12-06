import { APIOrder, OrderbookResponse } from '@0x/connect';
import {
    ContractWrappers,
    DecodedLogEvent,
    ExchangeCancelEventArgs,
    ExchangeEvents,
    ExchangeFillEventArgs,
    OrderStatus,
} from '@0x/contract-wrappers';
import { SignedOrder } from '@0x/order-utils';
import { BigNumber } from '@0x/utils';
import * as bodyParser from 'body-parser';
import * as express from 'express';

import { NETWORK_CONFIGS } from './configs';
import { NULL_ADDRESS, ZERO } from './constants';
import { providerEngine } from './provider_engine';

const HTTP_OK_STATUS = 200;
const HTTP_BAD_REQUEST_STATUS = 400;
const HTTP_PORT = 3000;

// Global state
const orders: SignedOrder[] = [];
const ordersByHash: { [hash: string]: SignedOrder } = {};

// We subscribe to the Exchange Events to remove any filled or cancelled orders
const contractWrappers = new ContractWrappers(providerEngine, { chainId: NETWORK_CONFIGS.chainId });
contractWrappers.exchange.subscribe(
    ExchangeEvents.Fill,
    {},
    (err: null | Error, decodedLogEvent?: DecodedLogEvent<ExchangeFillEventArgs>) => {
        if (err) {
            console.log('error:', err);
        } else if (decodedLogEvent) {
            const fillLog = decodedLogEvent.log;
            const orderHash = fillLog.args.orderHash;
            console.log(`Order filled ${fillLog.args.orderHash}`);
            removeOrder(orderHash);
        }
    },
);
// Listen for Cancel Exchange Events and remove any orders
contractWrappers.exchange.subscribe(
    ExchangeEvents.Cancel,
    {},
    (err: null | Error, decodedLogEvent?: DecodedLogEvent<ExchangeCancelEventArgs>) => {
        if (err) {
            console.log('error:', err);
        } else if (decodedLogEvent) {
            const fillLog = decodedLogEvent.log;
            const orderHash = fillLog.args.orderHash;
            console.log(`Order cancelled ${fillLog.args.orderHash}`);
            removeOrder(orderHash);
        }
    },
);

// HTTP Server
const app = express();
app.use(bodyParser.json());
/**
 * GET Orderbook endpoint retrieves the orderbook for a given asset pair.
 * http://sra-spec.s3-website-us-east-1.amazonaws.com/#operation/getOrderbook
 */
app.get('/v3/orderbook', (req, res) => {
    console.log('HTTP: GET orderbook');
    const baseAssetData = req.query.baseAssetData;
    const quoteAssetData = req.query.quoteAssetData;
    const chainIdRaw = req.query.chainId;
    // tslint:disable-next-line:custom-no-magic-numbers
    const chainId = parseInt(chainIdRaw, 10);
    if (chainId !== NETWORK_CONFIGS.chainId) {
        console.log(`Incorrect Chain ID: ${chainId}`);
        res.status(HTTP_BAD_REQUEST_STATUS).send({});
    } else {
        const orderbookResponse = renderOrderbookResponse(baseAssetData, quoteAssetData);
        res.status(HTTP_OK_STATUS).send(orderbookResponse);
    }
});
/**
 * POST Order config endpoint retrives the values for order fields that the relayer requires.
 * http://sra-spec.s3-website-us-east-1.amazonaws.com/#operation/getOrderConfig
 */
app.post('/v3/order_config', (req, res) => {
    console.log('HTTP: POST order config');
    const chainIdRaw = req.query.chainId;
    // tslint:disable-next-line:custom-no-magic-numbers
    const chainId = parseInt(chainIdRaw, 10);
    if (chainId !== NETWORK_CONFIGS.chainId) {
        console.log(`Incorrect Chain ID: ${chainId}`);
        res.status(HTTP_BAD_REQUEST_STATUS).send({});
    } else {
        const orderConfigResponse = {
            senderAddress: NULL_ADDRESS,
            feeRecipientAddress: NULL_ADDRESS,
            makerFee: ZERO,
            takerFee: '1000',
        };
        res.status(HTTP_OK_STATUS).send(orderConfigResponse);
    }
});
/**
 * POST Order endpoint submits an order to the Relayer.
 * http://sra-spec.s3-website-us-east-1.amazonaws.com/#operation/postOrder
 */
app.post('/v3/order', (req, res) => {
    console.log('HTTP: POST order');
    const chainIdRaw = req.query.chainId;
    // tslint:disable-next-line:custom-no-magic-numbers
    const chainId = parseInt(chainIdRaw, 10);
    if (chainId !== NETWORK_CONFIGS.chainId) {
        console.log(`Incorrect Chain ID: ${chainId}`);
        res.status(HTTP_BAD_REQUEST_STATUS).send({});
    } else {
        const signedOrder = parseHTTPOrder(req.body);
        contractWrappers.devUtils
            .getOrderRelevantState(signedOrder, signedOrder.signature)
            .callAsync()
            .then(orderRelevantState => {
                const [{ orderStatus, orderHash }, remainingFillableAmount, isValidSignature] = orderRelevantState;
                if (
                    orderStatus === OrderStatus.Fillable &&
                    remainingFillableAmount.isGreaterThan(0) &&
                    isValidSignature
                ) {
                    // Order is fillable
                    ordersByHash[orderHash] = signedOrder;
                    orders.push(signedOrder);
                    res.status(HTTP_OK_STATUS).send({});
                } else {
                    res.status(HTTP_BAD_REQUEST_STATUS).send();
                }
            });
    }
});
app.listen(HTTP_PORT, () => console.log('Standard relayer API (HTTP) listening on port 3000!'));
function getCurrentUnixTimestampSec(): BigNumber {
    const milisecondsInSecond = 1000;
    return new BigNumber(Date.now() / milisecondsInSecond).integerValue(BigNumber.ROUND_FLOOR);
}
function renderOrderbookResponse(baseAssetData: string, quoteAssetData: string): OrderbookResponse {
    const bidOrders = orders.filter(order => {
        return (
            order.takerAssetData === baseAssetData &&
            order.makerAssetData === quoteAssetData &&
            order.expirationTimeSeconds.isGreaterThan(getCurrentUnixTimestampSec())
        );
    });
    const askOrders = orders.filter(order => {
        return (
            order.takerAssetData === quoteAssetData &&
            order.makerAssetData === baseAssetData &&
            order.expirationTimeSeconds.isGreaterThan(getCurrentUnixTimestampSec())
        );
    });
    const bidApiOrders: APIOrder[] = bidOrders.map(order => {
        return { metaData: {}, order };
    });
    const askApiOrders: APIOrder[] = askOrders.map(order => {
        return { metaData: {}, order };
    });
    return {
        bids: {
            records: bidApiOrders,
            page: 1,
            perPage: 100,
            total: bidOrders.length,
        },
        asks: {
            records: askApiOrders,
            page: 1,
            perPage: 100,
            total: askOrders.length,
        },
    };
}

// As the orders come in as JSON they need to be turned into the correct types such as BigNumber
function parseHTTPOrder(signedOrder: any): SignedOrder {
    signedOrder.salt = new BigNumber(signedOrder.salt);
    signedOrder.makerAssetAmount = new BigNumber(signedOrder.makerAssetAmount);
    signedOrder.takerAssetAmount = new BigNumber(signedOrder.takerAssetAmount);
    signedOrder.makerFee = new BigNumber(signedOrder.makerFee);
    signedOrder.takerFee = new BigNumber(signedOrder.takerFee);
    signedOrder.expirationTimeSeconds = new BigNumber(signedOrder.expirationTimeSeconds);
    return signedOrder;
}

function removeOrder(orderHash: string): void {
    const order = ordersByHash[orderHash];
    const orderIndex = orders.indexOf(order);
    if (orderIndex > -1) {
        orders.splice(orderIndex, 1);
    }
}
