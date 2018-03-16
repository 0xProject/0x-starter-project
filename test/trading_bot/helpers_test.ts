import 'mocha';
import * as chai from 'chai';
import { Token, ZeroEx } from '0x.js';
import { SignedOrder } from '@0xproject/connect';
import { BigNumber } from 'bignumber.js';
import { helpers } from '../../src/trading_bot/helpers';

// TODO: should become a shared dependency
import { chaiSetup } from '0x.js/lib/test/utils/chai_setup'

chaiSetup.configure();
const expect = chai.expect;

describe('Trading Bot Helpers', () => {
    let tokenA: Token, tokenB: Token;

    before(() => {
        tokenA = {
            name: 'Token A',
            address: '0x1234',
            symbol: 'A',
            decimals: 18
        }
        tokenB = {
            name: 'Token B',
            address: '0x5678',
            symbol: 'B',
            decimals: 12
        }
    });

    function createDummyOrder(makerUnitAmount: BigNumber, takerUnitAmount: BigNumber): SignedOrder {
        return {
            exchangeContractAddress: '0x923',
            maker: '0x832',
            taker: ZeroEx.NULL_ADDRESS,
            makerFee: new BigNumber(0),
            takerFee: new BigNumber(0),
            makerTokenAmount: ZeroEx.toBaseUnitAmount(makerUnitAmount, tokenA.decimals),
            takerTokenAmount: ZeroEx.toBaseUnitAmount(takerUnitAmount, tokenB.decimals),
            makerTokenAddress: tokenA.address,
            takerTokenAddress: tokenB.address,
            feeRecipient: ZeroEx.NULL_ADDRESS,
            expirationUnixTimestampSec: new BigNumber(0),
            salt: ZeroEx.generatePseudoRandomSalt(),
            ecSignature: {
                v: 0,
                r: 'fake',
                s: 'signature'
            }
        };
    }

    describe('#getExchangeRate', () => {
        it('different decimal tokens', () => {
            const makerUnitAmount = new BigNumber(100);
            const takerUnitAmount = new BigNumber(200);

            const order = createDummyOrder(makerUnitAmount, takerUnitAmount);

            expect(helpers.getExchangeRate(order, tokenA, tokenB)).to.be.bignumber.equal(new BigNumber(0.5));
        });
    });

    describe('maker/taker conversion', () => {
        it('rational exchange rate', () => {
            const makerUnitAmount = new BigNumber(100);
            const takerUnitAmount = new BigNumber(200);

            const order = createDummyOrder(makerUnitAmount, takerUnitAmount);

            const makerFillAmount = ZeroEx.toBaseUnitAmount(new BigNumber(50), tokenA.decimals);
            const takerFillAmount = ZeroEx.toBaseUnitAmount(new BigNumber(100), tokenB.decimals);
            
            expect(helpers.convertMakerToTakerAmount(order, makerFillAmount, tokenA, tokenB)).to.be.bignumber.equal(takerFillAmount);
            expect(helpers.convertTakerToMakerAmount(order, takerFillAmount, tokenA, tokenB)).to.be.bignumber.equal(makerFillAmount);
        });

        it('irrational exchange rate', () => {
            const makerUnitAmount = new BigNumber(100);
            const takerUnitAmount = new BigNumber(337);

            const order = createDummyOrder(makerUnitAmount, takerUnitAmount);

            const makerFillAmount = ZeroEx.toBaseUnitAmount(new BigNumber(35), tokenA.decimals);
            const takerFillUnitAmount = new BigNumber(35).div(makerUnitAmount.div(takerUnitAmount)).round(tokenB.decimals);
            const takerFillAmount = ZeroEx.toBaseUnitAmount(takerFillUnitAmount, tokenB.decimals);
            
            expect(helpers.convertMakerToTakerAmount(order, makerFillAmount, tokenA, tokenB)).to.be.bignumber.equal(takerFillAmount);
            expect(helpers.convertTakerToMakerAmount(order, takerFillAmount, tokenA, tokenB)).to.be.bignumber.equal(makerFillAmount);
        });
    });

    describe('#sortOrders', () => {
        it('sorts bids by desc exchange rate', () => {
            const exchangeRates = [0.2, 0.5, 0.1, 0.4, 0.3];
            const makerUnitAmount = new BigNumber(100);
            const orders = exchangeRates.map(rate => {
                const takerUnitAmount = makerUnitAmount.div(rate).round(tokenB.decimals);
                return createDummyOrder(makerUnitAmount, takerUnitAmount);
            });

            const expectedBidOrders = [1, 3, 4, 0, 2].map(i => orders[i]);
            expect(helpers.sortOrders(orders, tokenA, tokenB)).to.be.deep.equal(expectedBidOrders);
        });

        it('sorts asks by asc exchange rate', () => {
            const exchangeRates = [0.2, 0.5, 0.1, 0.4, 0.3];
            const takerUnitAmount = new BigNumber(100);
            const orders = exchangeRates.map(rate => {
                const makerUnitAmount = takerUnitAmount.div(rate).round(tokenA.decimals);
                return createDummyOrder(makerUnitAmount, takerUnitAmount);
            });

            const expectedAskOrders = [2, 0, 4, 3, 1].map(i => orders[i]);
            expect(helpers.sortOrders(orders, tokenB, tokenA)).to.be.deep.equal(expectedAskOrders);
        });
    });
});