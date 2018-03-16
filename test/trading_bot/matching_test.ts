import { BlockchainLifecycle, devConstants, web3Factory } from '@0xproject/dev-utils';
import 'mocha';
import * as Web3 from 'web3';
import * as chai from 'chai';
import { Token, ZeroEx } from '0x.js';
import { SignedOrder } from '@0xproject/connect';
import { BigNumber } from '@0xproject/utils';
import { matchingFunctions } from '../../src/trading_bot/matching';
import * as _ from 'lodash';

// TODO: should become a shared dependency
import { chaiSetup } from '0x.js/lib/test/utils/chai_setup';
import { TokenUtils } from '0x.js/lib/test/utils/token_utils';
import { constants } from '0x.js/lib/test/utils/constants';
import { FillScenarios } from '0x.js/lib/test/utils/fill_scenarios';
import { OrderStateUtils } from '0x.js/lib/src/utils/order_state_utils';

chaiSetup.configure();
const expect = chai.expect;
const blockchainLifecycle = new BlockchainLifecycle();

describe('Trading bot', () => {
    let web3: Web3;
    let zeroEx: ZeroEx;
    let orderStateUtils: OrderStateUtils;
    let tokens: Token[];
    let tokenUtils: TokenUtils;
    let fillScenarios: FillScenarios;
    let userAddresses: string[];
    let zrxTokenAddress: string;
    let exchangeContractAddress: string;
    let makerToken: Token;
    let takerToken: Token;
    let maker: string;
    let taker: string;
    const config = {
        networkId: constants.TESTRPC_NETWORK_ID,
    };
    const decimals = constants.ZRX_DECIMALS;
    const fillableAmount = ZeroEx.toBaseUnitAmount(new BigNumber(5), decimals);
    before(async () => {
        web3 = web3Factory.create();
        zeroEx = new ZeroEx(web3.currentProvider, config);
        orderStateUtils = (zeroEx.orderStateWatcher as any)._orderStateUtils;
        exchangeContractAddress = zeroEx.exchange.getContractAddress();
        userAddresses = await zeroEx.getAvailableAddressesAsync();
        [, maker, taker] = userAddresses;
        tokens = await zeroEx.tokenRegistry.getTokensAsync();
        tokenUtils = new TokenUtils(tokens);
        zrxTokenAddress = tokenUtils.getProtocolTokenOrThrow().address;
        fillScenarios = new FillScenarios(zeroEx, userAddresses, tokens, zrxTokenAddress, exchangeContractAddress);
        [makerToken, takerToken] = tokenUtils.getDummyTokens();
        await fillScenarios.initTokenBalancesAsync();
    });
    beforeEach(async () => {
        await blockchainLifecycle.startAsync();
    });
    afterEach(async () => {
        await blockchainLifecycle.revertAsync();
    });

    describe('#nextOrder', () => {
        async function getAllNextOrdersAndFillableMakerAmount(iter: IterableIterator<SignedOrder>, taker?: string) {
            const orders = [];
            let next;
            while ((next = await matchingFunctions.nextOrder(iter, orderStateUtils, taker))) {
                orders.push(next);
            }

            return orders.map(orderAndState => {
            //     console.log(orderAndState.order.makerTokenAmount.toString());
            //     console.log(orderAndState.state.orderRelevantState.filledTakerTokenAmount.toString());
            //     console.log(orderAndState.state.orderRelevantState.cancelledTakerTokenAmount.toString());
            //     console.log(orderAndState.state.orderRelevantState.remainingFillableTakerTokenAmount.toString());
            //     console.log(orderAndState.state.orderRelevantState.remainingFillableMakerTokenAmount.toString());
                return {order: orderAndState.order, fillableAmount: orderAndState.state.orderRelevantState.remainingFillableMakerTokenAmount}
            });
        }

        it('should generate each order sequentially', async () => {
            // Create 10-length array
            const arr = Array(10).fill(0);
            const orders = await Promise.all(arr.map(() => {
                return fillScenarios.createFillableSignedOrderAsync(
                    makerToken.address,
                    takerToken.address,
                    maker,
                    ZeroEx.NULL_ADDRESS,
                    fillableAmount,
                );
            }));
            const ordersAndFillableAmounts = await getAllNextOrdersAndFillableMakerAmount(orders[Symbol.iterator]())

            const expectedNextOrders = orders.map(order => {
                return {order, fillableAmount}
            });
            expect(ordersAndFillableAmounts).to.be.deep.equal(expectedNextOrders);
        });

        it('should include orders where the taker matches', async () => {
            const takers = [taker, ZeroEx.NULL_ADDRESS];
            const orders = await Promise.all(takers.map(taker => {
                return fillScenarios.createFillableSignedOrderAsync(
                    makerToken.address,
                    takerToken.address,
                    maker,
                    taker,
                    fillableAmount,
                );
            }));
            const ordersAndFillableAmounts = await getAllNextOrdersAndFillableMakerAmount(orders[Symbol.iterator](), taker)

            const expectedNextOrders = orders.map(order => ({order, fillableAmount}));
            expect(ordersAndFillableAmounts).to.be.deep.equal(expectedNextOrders);
        });

        it('shouldn\'t include orders with a different taker', async () => {
            const takers = [taker, ZeroEx.NULL_ADDRESS];
            const orders = await Promise.all(takers.map(taker => {
                return fillScenarios.createFillableSignedOrderAsync(
                    makerToken.address,
                    takerToken.address,
                    maker,
                    taker,
                    fillableAmount,
                );
            }));
            const ordersAndFillableAmounts = await getAllNextOrdersAndFillableMakerAmount(orders[Symbol.iterator]())

            const expectedNextOrders = [{order: orders[1], fillableAmount}];
            expect(ordersAndFillableAmounts).to.be.deep.equal(expectedNextOrders);
        });

        it('shouldn\'t include filled orders', async () => {
            const fillAmounts = [{fillAmount: new BigNumber(10), partialFillAmount: new BigNumber(1)}, 
                                 {fillAmount: new BigNumber(5), partialFillAmount: new BigNumber(5)}];
            const orders = await Promise.all(fillAmounts.map(amounts => {
                return fillScenarios.createPartiallyFilledSignedOrderAsync(
                    makerToken.address,
                    takerToken.address,
                    taker,
                    ZeroEx.toBaseUnitAmount(amounts.fillAmount, decimals),
                    ZeroEx.toBaseUnitAmount(amounts.partialFillAmount, decimals)
                );
            }));
            const ordersAndFillableAmounts = await getAllNextOrdersAndFillableMakerAmount(orders[Symbol.iterator](), taker);

            const baseFillAmount = ZeroEx.toBaseUnitAmount(new BigNumber(1), decimals);
            const expectedNextOrders = [{order: orders[0], fillableAmount: fillableAmount.minus(baseFillAmount)}];
            expect(ordersAndFillableAmounts).to.be.deep.equal(expectedNextOrders);
        });

        it('should return null after completion', async () => {
            const signedOrder = await fillScenarios.createFillableSignedOrderAsync(
                makerToken.address,
                takerToken.address,
                maker,
                ZeroEx.NULL_ADDRESS,
                fillableAmount,
            );
            
            const iter = [signedOrder][Symbol.iterator]();
            const order = await matchingFunctions.nextOrder(iter, orderStateUtils);
            const shouldBeNull = await matchingFunctions.nextOrder(iter, orderStateUtils);

            expect(shouldBeNull).to.be.null();
        });
    });
});