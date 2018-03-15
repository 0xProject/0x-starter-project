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

function getExchangeRate(order: Order | SignedOrder, makerTokenInfo: Token, takerTokenInfo: Token): BigNumber {
    const makerUnitAmount = ZeroEx.toUnitAmount(order.makerTokenAmount, makerTokenInfo.decimals);
    const takerUnitAmount = ZeroEx.toUnitAmount(order.takerTokenAmount, takerTokenInfo.decimals);
    return makerUnitAmount.div(takerUnitAmount);
}

function convertTakerToMakerAmount(order: Order | SignedOrder, takerBaseUnitAmount: BigNumber, makerTokenInfo: Token, takerTokenInfo: Token) {
    const exchangeRate = getExchangeRate(order, makerTokenInfo, takerTokenInfo);
    const takerUnitAmount = ZeroEx.toUnitAmount(takerBaseUnitAmount, takerTokenInfo.decimals);
    const makerUnitAmount = takerUnitAmount.mul(exchangeRate);
    const makerBaseUnitAmount = ZeroEx.toUnitAmount(makerUnitAmount, makerTokenInfo.decimals);
    return makerBaseUnitAmount;
}

function convertMakerToTakerAmount(order: Order | SignedOrder, makerBaseUnitAmount: BigNumber, makerTokenInfo: Token, takerTokenInfo: Token) {
    const exchangeRate = getExchangeRate(order, makerTokenInfo, takerTokenInfo);
    const makerUnitAmount = ZeroEx.toUnitAmount(makerBaseUnitAmount, makerTokenInfo.decimals);
    const takerUnitAmount = makerBaseUnitAmount.mul(exchangeRate);
    const takerBaseUnitAmount = ZeroEx.toUnitAmount(makerUnitAmount, takerTokenInfo.decimals);
    return takerBaseUnitAmount;
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
