import { BlockchainLifecycle, devConstants, web3Factory } from '@0xproject/dev-utils';
import 'mocha';
import * as Web3 from 'web3';
import * as chai from 'chai';
import { Token, ZeroEx, OrderFillRequest } from '0x.js';
import { SignedOrder, Order } from '@0xproject/connect';
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

        // TODO: FLAKY TEST
        // it('shouldn\'t include filled orders', async () => {
        //     const fillAmounts = [{fillAmount: new BigNumber(2), partialFillAmount: new BigNumber(1)}, 
        //                          {fillAmount: new BigNumber(1), partialFillAmount: new BigNumber(1)}];
        //     const orders = await Promise.all(fillAmounts.map(amounts => {
        //         return fillScenarios.createPartiallyFilledSignedOrderAsync(
        //             makerToken.address,
        //             takerToken.address,
        //             taker,
        //             ZeroEx.toBaseUnitAmount(amounts.fillAmount, decimals),
        //             ZeroEx.toBaseUnitAmount(amounts.partialFillAmount, decimals)
        //         );
        //     }));
        //     const ordersAndFillableAmounts = await getAllNextOrdersAndFillableMakerAmount(orders[Symbol.iterator](), taker);

        //     const baseFillAmount = ZeroEx.toBaseUnitAmount(new BigNumber(1), decimals);
        //     const expectedNextOrders = [{order: orders[0], fillableAmount: fillableAmount.minus(baseFillAmount)}];
        //     expect(ordersAndFillableAmounts).to.be.deep.equal(expectedNextOrders);
        // });

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

    describe('#orderBatchGenerator', () => {
        async function createOrder(makerToken: Token, takerToken: Token, makerFillAmount: BigNumber, takerFillAmount: BigNumber, partialFillTakerAmount?: BigNumber) {
            const signedOrder = await fillScenarios.createAsymmetricFillableSignedOrderAsync(
                makerToken.address,
                takerToken.address,
                maker,
                taker,
                makerFillAmount,
                takerFillAmount,
            );
            

            if (partialFillTakerAmount && partialFillTakerAmount.gt(0)) {
                const shouldThrowOnInsufficientBalanceOrAllowance = false;
                await zeroEx.exchange.fillOrderAsync(
                    signedOrder,
                    partialFillTakerAmount,
                    shouldThrowOnInsufficientBalanceOrAllowance,
                    taker,
                );
            }

            return signedOrder;
        }

        async function createBid(quoteFillAmount: BigNumber, baseFillAmount: BigNumber, partialFillBaseAmount?: BigNumber) {
            return createOrder(makerToken, takerToken, quoteFillAmount, baseFillAmount, partialFillBaseAmount)
        }

        // Flip for asks
        async function createAsk(quoteFillAmount: BigNumber, baseFillAmount: BigNumber, partialFillQuoteAmount?: BigNumber) {
            return createOrder(takerToken, makerToken, baseFillAmount, quoteFillAmount, partialFillQuoteAmount)
        }

        async function getAllOrderBatches(orderGen: () => Promise<OrderFillRequest[] | null>) {
            let batch: OrderFillRequest[]|null;
            let batches: OrderFillRequest[][] = [];
            while ((batch = await orderGen())) {
                batches.push(batch);
            }
            return batches;
        }

        it('should match 2 orders', async () => {
            const bidFillAmounts = [{quote: new BigNumber(1), base: new BigNumber(1)}];
            const askFillAmounts = [{quote: new BigNumber(1), base: new BigNumber(1.5)}];

            const bids = await Promise.all(bidFillAmounts.map(fills => {
                return createBid(ZeroEx.toBaseUnitAmount(fills.quote, decimals), ZeroEx.toBaseUnitAmount(fills.base, decimals));
            }));
            const asks = await Promise.all(askFillAmounts.map(fills => {
                return createAsk(ZeroEx.toBaseUnitAmount(fills.quote, decimals), ZeroEx.toBaseUnitAmount(fills.base, decimals));
            }));

            const gen = matchingFunctions.orderBatchGenerator(zeroEx, orderStateUtils, bids, asks, makerToken, takerToken, taker);
            const orderBatches = await getAllOrderBatches(gen);

            const expectedBatch = [[{signedOrder: bids[0], takerTokenFillAmount:bids[0].takerTokenAmount},
                                    {signedOrder: asks[0], takerTokenFillAmount:asks[0].takerTokenAmount}]];
            expect(orderBatches).to.be.deep.equal(expectedBatch);
        });

        it('should not match equal orders (no profit)', async () => {
            const bidFillAmounts = [{quote: new BigNumber(1), base: new BigNumber(1)}];
            const askFillAmounts = [{quote: new BigNumber(1), base: new BigNumber(1)}];

            const bids = await Promise.all(bidFillAmounts.map(fills => {
                return createBid(ZeroEx.toBaseUnitAmount(fills.quote, decimals), ZeroEx.toBaseUnitAmount(fills.base, decimals));
            }));
            const asks = await Promise.all(askFillAmounts.map(fills => {
                return createAsk(ZeroEx.toBaseUnitAmount(fills.quote, decimals), ZeroEx.toBaseUnitAmount(fills.base, decimals));
            }));
            
            const gen = matchingFunctions.orderBatchGenerator(zeroEx, orderStateUtils, bids, asks, makerToken, takerToken, taker);
            const orderBatches = await getAllOrderBatches(gen);

            const expectedBatch: OrderFillRequest[][] = [];
            expect(orderBatches).to.be.deep.equal(expectedBatch);
        });

        it('should match bid to multiple asks', async () => {
            // Bid will fill both asks
            const bidFillAmounts = [{quote: new BigNumber(2), base: new BigNumber(2)}];
            const askFillAmounts = [{quote: new BigNumber(1), base: new BigNumber(1.5)}, {quote: new BigNumber(0.5), base: new BigNumber(0.8)}];

            const bids = await Promise.all(bidFillAmounts.map(fills => {
                return createBid(ZeroEx.toBaseUnitAmount(fills.quote, decimals), ZeroEx.toBaseUnitAmount(fills.base, decimals));
            }));
            const asks = await Promise.all(askFillAmounts.map(fills => {
                return createAsk(ZeroEx.toBaseUnitAmount(fills.quote, decimals), ZeroEx.toBaseUnitAmount(fills.base, decimals));
            }));
            
            const gen = matchingFunctions.orderBatchGenerator(zeroEx, orderStateUtils, bids, asks, makerToken, takerToken, taker);
            const orderBatches = await getAllOrderBatches(gen);

            const expectedBatch = [[{signedOrder: bids[0], takerTokenFillAmount:asks[0].takerTokenAmount.plus(asks[1].takerTokenAmount)},
                                    {signedOrder: asks[0], takerTokenFillAmount:asks[0].takerTokenAmount},
                                    {signedOrder: asks[1], takerTokenFillAmount:asks[1].takerTokenAmount}]];
            expect(orderBatches).to.be.deep.equal(expectedBatch);
        });

        it('should match ask to multiple bids', async () => {
            // Ask will fill both bids
            const bidFillAmounts = [{quote: new BigNumber(0.5), base: new BigNumber(0.5)}, {quote: new BigNumber(0.4), base: new BigNumber(0.4)}];
            const askFillAmounts = [{quote: new BigNumber(1), base: new BigNumber(1.5)}];

            const bids = await Promise.all(bidFillAmounts.map(fills => {
                return createBid(ZeroEx.toBaseUnitAmount(fills.quote, decimals), ZeroEx.toBaseUnitAmount(fills.base, decimals));
            }));
            const asks = await Promise.all(askFillAmounts.map(fills => {
                return createAsk(ZeroEx.toBaseUnitAmount(fills.quote, decimals), ZeroEx.toBaseUnitAmount(fills.base, decimals));
            }));
            
            const gen = matchingFunctions.orderBatchGenerator(zeroEx, orderStateUtils, bids, asks, makerToken, takerToken, taker);
            const orderBatches = await getAllOrderBatches(gen);

            const expectedBatch = [[{signedOrder: bids[0], takerTokenFillAmount:bids[0].takerTokenAmount},
                                    {signedOrder: asks[0], takerTokenFillAmount:bids[0].takerTokenAmount}],
                                   [{signedOrder: bids[1], takerTokenFillAmount:bids[1].takerTokenAmount},
                                    {signedOrder: asks[0], takerTokenFillAmount:bids[1].takerTokenAmount}]];
            expect(orderBatches).to.be.deep.equal(expectedBatch);
        });

        // it('should handle partially filled orders', async () => {
        //     const bidFillAmounts = [{quote: new BigNumber(1), base: new BigNumber(1), partial: new BigNumber(0.4)}];
        //     const askFillAmounts = [{quote: new BigNumber(0.8), base: new BigNumber(1), partial: new BigNumber(0.5)},
        //                             {quote: new BigNumber(1), base: new BigNumber(1.6), partial: new BigNumber(0.1)}];

        //     const bids = await Promise.all(bidFillAmounts.map(fills => {
        //         const partialFillAmount = fills.partial ? ZeroEx.toBaseUnitAmount(fills.partial, decimals) : undefined;
        //         return createBid(ZeroEx.toBaseUnitAmount(fills.quote, decimals), ZeroEx.toBaseUnitAmount(fills.base, decimals), 
        //             partialFillAmount);
        //     }));
        //     const asks = await Promise.all(askFillAmounts.map(fills => {
        //         const partialFillAmount = fills.partial ? ZeroEx.toBaseUnitAmount(fills.partial, decimals) : undefined;
        //         return createAsk(ZeroEx.toBaseUnitAmount(fills.quote, decimals), ZeroEx.toBaseUnitAmount(fills.base, decimals),
        //             partialFillAmount);
        //     }));

        //     const gen = matchingFunctions.orderBatchGenerator(zeroEx, orderStateUtils, bids, asks, makerToken, takerToken, taker);
        //     const orderBatches = await getAllOrderBatches(gen);

        //     const partialBidFillAmt = ZeroEx.toBaseUnitAmount(bidFillAmounts[0].partial, decimals);
        //     const partialAskFillAmt = ZeroEx.toBaseUnitAmount(askFillAmounts[0].partial, decimals);
        //     const remainingAskFillAmt = asks[0].takerTokenAmount.minus(partialAskFillAmt);
        //     const expectedBatch = [[{signedOrder: bids[0], takerTokenFillAmount:bids[0].takerTokenAmount.minus(partialBidFillAmt)},
        //                             {signedOrder: asks[0], takerTokenFillAmount:remainingAskFillAmt},
        //                             {signedOrder: asks[1], takerTokenFillAmount:asks[1].takerTokenAmount.minus(remainingAskFillAmt)}]];
        //     console.log(orderBatches)
        //     console.log(expectedBatch)
        //     expect(orderBatches).to.be.deep.equal(expectedBatch);
        // });

        // it('should ignore filled orders', async () => {
        //     const bidFillAmounts = [{quote: new BigNumber(1), base: new BigNumber(1), partial: new BigNumber(1)}, 
        //                             {quote: new BigNumber(0.4), base: new BigNumber(0.4)}];
        //     const askFillAmounts = [{quote: new BigNumber(1), base: new BigNumber(1.5)},
        //                             {quote: new BigNumber(1), base: new BigNumber(2), partial: new BigNumber(1)}];

        //     const bids = await Promise.all(bidFillAmounts.map(fills => {
        //         const partialFillAmount = fills.partial ? ZeroEx.toBaseUnitAmount(fills.partial, decimals) : undefined;
        //         return createBid(ZeroEx.toBaseUnitAmount(fills.quote, decimals), ZeroEx.toBaseUnitAmount(fills.base, decimals), 
        //             partialFillAmount);
        //     }));
        //     const asks = await Promise.all(askFillAmounts.map(fills => {
        //         const partialFillAmount = fills.partial ? ZeroEx.toBaseUnitAmount(fills.partial, decimals) : undefined;
        //         return createAsk(ZeroEx.toBaseUnitAmount(fills.quote, decimals), ZeroEx.toBaseUnitAmount(fills.base, decimals),
        //             partialFillAmount);
        //     }));

        //     const gen = matchingFunctions.orderBatchGenerator(zeroEx, orderStateUtils, bids, asks, makerToken, takerToken, taker);
        //     const orderBatches = await getAllOrderBatches(gen);

        //     const expectedBatch = [[{signedOrder: bids[1], takerTokenFillAmount:asks[0].takerTokenAmount},
        //                             {signedOrder: asks[0], takerTokenFillAmount:asks[0].takerTokenAmount}]];
        //     expect(orderBatches).to.be.deep.equal(expectedBatch);
        // });

        it('should handle no bids/asks', async () => {
            const bidFillAmounts = [{quote: new BigNumber(5), base: new BigNumber(5)}, {quote: new BigNumber(6), base: new BigNumber(6)}];
            const askFillAmounts: {quote: BigNumber, base: BigNumber}[] = [];

            const bids = await Promise.all(bidFillAmounts.map(fills => {
                return createBid(ZeroEx.toBaseUnitAmount(fills.quote, decimals), ZeroEx.toBaseUnitAmount(fills.base, decimals));
            }));
            const asks = await Promise.all(askFillAmounts.map(fills => {
                return createAsk(ZeroEx.toBaseUnitAmount(fills.quote, decimals), ZeroEx.toBaseUnitAmount(fills.base, decimals));
            }));

            const gen = matchingFunctions.orderBatchGenerator(zeroEx, orderStateUtils, bids, asks, makerToken, takerToken, taker);
            const orderBatches = await getAllOrderBatches(gen);

            const expectedBatch: OrderFillRequest[][] = [];
            expect(orderBatches).to.be.deep.equal(expectedBatch);
        });
    });
});