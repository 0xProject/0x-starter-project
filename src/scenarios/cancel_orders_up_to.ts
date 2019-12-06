import { ContractWrappers } from '@0x/contract-wrappers';
import { Order } from '@0x/order-utils';
import { BigNumber } from '@0x/utils';
import { Web3Wrapper } from '@0x/web3-wrapper';

import { NETWORK_CONFIGS, TX_DEFAULTS } from '../configs';
import { NULL_ADDRESS, NULL_BYTES, ONE_MINUTE_MS, TEN_MINUTES_MS, ZERO } from '../constants';
import { PrintUtils } from '../print_utils';
import { providerEngine } from '../provider_engine';
import { getRandomFutureDateInSeconds, runMigrationsOnceIfRequiredAsync } from '../utils';

/**
 * In this scenario, the maker creates and signs many orders selling ZRX for WETH.
 * The maker is able to cancel all any number of these orders effeciently by using cancelOrdersUpTo.
 */
export async function scenarioAsync(): Promise<void> {
    await runMigrationsOnceIfRequiredAsync();
    PrintUtils.printScenario('Cancel Orders Up To');
    // Initialize the ContractWrappers, this provides helper functions around calling
    // 0x contracts as well as ERC20/ERC721 token contracts on the blockchain
    const contractWrappers = new ContractWrappers(providerEngine, { chainId: NETWORK_CONFIGS.chainId });
    // Initialize the Web3Wrapper, this provides helper functions around fetching
    // account information, balances, general contract logs
    const web3Wrapper = new Web3Wrapper(providerEngine);
    const [maker, taker] = await web3Wrapper.getAvailableAddressesAsync();
    const zrxTokenAddress = contractWrappers.contractAddresses.zrxToken;
    const etherTokenAddress = contractWrappers.contractAddresses.etherToken;
    const printUtils = new PrintUtils(
        web3Wrapper,
        contractWrappers,
        { maker, taker },
        { WETH: etherTokenAddress, ZRX: zrxTokenAddress },
    );
    printUtils.printAccounts();

    // the amount the maker is selling of maker asset
    const makerAssetAmount = new BigNumber(100);
    // the amount the maker wants of taker asset
    const takerAssetAmount = new BigNumber(10);
    // 0x v2 uses hex encoded asset data strings to encode all the information needed to identify an asset
    const makerAssetData = await contractWrappers.devUtils.encodeERC20AssetData(zrxTokenAddress).callAsync();
    const takerAssetData = await contractWrappers.devUtils.encodeERC20AssetData(etherTokenAddress).callAsync();

    // Set up the Order and fill it
    const randomExpiration = getRandomFutureDateInSeconds();
    const exchangeAddress = contractWrappers.contractAddresses.exchange;

    // Rather than using a random salt, we use an incrementing salt value.
    // When combined with cancelOrdersUpTo, all lesser values of salt can be cancelled
    // This allows the maker to cancel many orders with one on-chain transaction
    const order1: Order = {
        chainId: NETWORK_CONFIGS.chainId,
        salt: new BigNumber(Date.now() - TEN_MINUTES_MS),
        exchangeAddress,
        makerAddress: maker,
        takerAddress: NULL_ADDRESS,
        senderAddress: NULL_ADDRESS,
        feeRecipientAddress: NULL_ADDRESS,
        expirationTimeSeconds: randomExpiration,
        makerAssetAmount,
        takerAssetAmount,
        makerAssetData,
        takerAssetData,
        makerFeeAssetData: NULL_BYTES,
        takerFeeAssetData: NULL_BYTES,
        makerFee: ZERO,
        takerFee: ZERO,
    };

    const order2: Order = {
        ...order1,
        salt: new BigNumber(Date.now() - ONE_MINUTE_MS),
    };

    const order3: Order = {
        ...order1,
        salt: new BigNumber(Date.now()),
    };

    // Fetch and print the order info
    let order1Info = await contractWrappers.exchange.getOrderInfo(order1).callAsync();
    let order2Info = await contractWrappers.exchange.getOrderInfo(order2).callAsync();
    let order3Info = await contractWrappers.exchange.getOrderInfo(order3).callAsync();
    printUtils.printOrderInfos({ order1: order1Info, order2: order2Info, order3: order3Info });

    // Maker cancels all orders before and including order2, order3 remains valid
    const targetOrderEpoch = order2.salt;
    const txHash = await contractWrappers.exchange.cancelOrdersUpTo(targetOrderEpoch).sendTransactionAsync({
        from: maker,
        gas: TX_DEFAULTS.gas,
    });
    const txReceipt = await printUtils.awaitTransactionMinedSpinnerAsync('cancelOrdersUpTo', txHash);
    printUtils.printTransaction('cancelOrdersUpTo', txReceipt, [['targetOrderEpoch', targetOrderEpoch.toString()]]);
    // Fetch and print the order info
    order1Info = await contractWrappers.exchange.getOrderInfo(order1).callAsync();
    order2Info = await contractWrappers.exchange.getOrderInfo(order2).callAsync();
    order3Info = await contractWrappers.exchange.getOrderInfo(order3).callAsync();
    printUtils.printOrderInfos({ order1: order1Info, order2: order2Info, order3: order3Info });

    // Stop the Provider Engine
    providerEngine.stop();
}

void (async () => {
    try {
        if (!module.parent) {
            await scenarioAsync();
        }
    } catch (e) {
        console.log(e);
        providerEngine.stop();
        process.exit(1);
    }
})();
