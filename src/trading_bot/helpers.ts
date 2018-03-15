import { 
    ZeroEx,
    Order,
    SignedOrder
} from '0x.js';
import { BigNumber } from '@0xproject/utils';

// Precision needs to be higher than baseUnit decimals for tokens (typically 18) or else we can run into rounding issues
// when converting back and forth from maker to taker amount using exchange rate.
BigNumber.config({DECIMAL_PLACES: 35})

function getExchangeRate(order: Order|SignedOrder): BigNumber {
    return order.makerTokenAmount.div(order.takerTokenAmount);
}

function convertTakerToMakerAmount(order:Order|SignedOrder, takerAmount:BigNumber) {
    const exchangeRate = getExchangeRate(order);
    return takerAmount.mul(exchangeRate).round();
}

function convertMakerToTakerAmount(order:Order|SignedOrder, makerAmount:BigNumber) {
    const exchangeRate = getExchangeRate(order);
    return makerAmount.div(exchangeRate).round();
}

export const helpers = {
    getExchangeRate,
    convertTakerToMakerAmount,
    convertMakerToTakerAmount
};