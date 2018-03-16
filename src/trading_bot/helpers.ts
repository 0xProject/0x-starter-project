import {
    ZeroEx,
    Order,
    SignedOrder,
    Token
} from '0x.js';
import { BigNumber } from '@0xproject/utils';

// Precision needs to be higher than baseUnit decimals for tokens (typically 18) or else we can run into rounding issues
// when converting back and forth from maker to taker amount using exchange rate.
BigNumber.config({ DECIMAL_PLACES: 35 })

function getExchangeRate(order: Order, makerTokenInfo: Token, takerTokenInfo: Token): BigNumber {
    const makerUnitAmount = ZeroEx.toUnitAmount(order.makerTokenAmount, makerTokenInfo.decimals);
    const takerUnitAmount = ZeroEx.toUnitAmount(order.takerTokenAmount, takerTokenInfo.decimals);
    return makerUnitAmount.div(takerUnitAmount);
}

function convertTakerToMakerAmount(order: Order, takerBaseUnitAmount: BigNumber, makerTokenInfo: Token, takerTokenInfo: Token) {
    const exchangeRate = getExchangeRate(order, makerTokenInfo, takerTokenInfo);
    const takerUnitAmount = ZeroEx.toUnitAmount(takerBaseUnitAmount, takerTokenInfo.decimals);
    const makerUnitAmount = takerUnitAmount.mul(exchangeRate).round(makerTokenInfo.decimals);
    const makerBaseUnitAmount = ZeroEx.toBaseUnitAmount(makerUnitAmount, makerTokenInfo.decimals);
    return makerBaseUnitAmount.floor();
}

function convertMakerToTakerAmount(order: Order, makerBaseUnitAmount: BigNumber, makerTokenInfo: Token, takerTokenInfo: Token) {
    const exchangeRate = getExchangeRate(order, makerTokenInfo, takerTokenInfo);
    const makerUnitAmount = ZeroEx.toUnitAmount(makerBaseUnitAmount, makerTokenInfo.decimals);
    const takerUnitAmount = makerUnitAmount.div(exchangeRate).round(takerTokenInfo.decimals);
    const takerBaseUnitAmount = ZeroEx.toBaseUnitAmount(takerUnitAmount, takerTokenInfo.decimals);
    return takerBaseUnitAmount.floor();
}

function sortOrders(orders: SignedOrder[], makerTokenInfo: Token, takerTokenInfo: Token) {
    // Bids will be sorted by desc rate, asks will be sorted by asc rate
    return orders.sort((orderA, orderB) => {
        const orderRateA = helpers.getExchangeRate(orderA, makerTokenInfo, takerTokenInfo);
        const orderRateB = helpers.getExchangeRate(orderB, makerTokenInfo, takerTokenInfo);
        return orderRateB.comparedTo(orderRateA);
    });
}

export const helpers = {
    getExchangeRate,
    convertTakerToMakerAmount,
    convertMakerToTakerAmount,
    sortOrders
};
