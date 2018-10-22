import { assetDataUtils, BigNumber, ContractWrappers, Order } from '0x.js';
import { Web3Wrapper } from '@0x/web3-wrapper';

import { NETWORK_CONFIGS, TX_DEFAULTS } from '../configs';
import { NULL_ADDRESS, ONE_MINUTE_MS, TEN_MINUTES_MS, ZERO } from '../constants';
import { getContractAddressesForNetwork, getContractWrappersConfig } from '../contracts';
import { PrintUtils } from '../print_utils';
import { providerEngine } from '../provider_engine';
import { getRandomFutureDateInSeconds } from '../utils';

/**
 * In this scenario, the maker creates and signs many orders selling ZRX for WETH.
 * The maker is able to cancel all any number of these orders effeciently by using cancelOrdersUpTo.
 */
export async function scenarioAsync(): Promise<void> {
    PrintUtils.printScenario('Cancel Orders Up To');
    // Initialize the ContractWrappers, this provides helper functions around calling
    // 0x contracts as well as ERC20/ERC721 token contracts on the blockchain
    const contractWrappers = new ContractWrappers(providerEngine, getContractWrappersConfig(NETWORK_CONFIGS.networkId));
    // Initialize the Web3Wrapper, this provides helper functions around fetching
    // account information, balances, general contract logs
    const web3Wrapper = new Web3Wrapper(providerEngine);
    const [maker, taker] = await web3Wrapper.getAvailableAddressesAsync();
    const contractAddresses = getContractAddressesForNetwork(NETWORK_CONFIGS.networkId);
    const zrxTokenAddress = contractAddresses.zrxToken;
    const etherTokenAddress = contractAddresses.etherToken;
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
    const makerAssetData = assetDataUtils.encodeERC20AssetData(zrxTokenAddress);
    const takerAssetData = assetDataUtils.encodeERC20AssetData(etherTokenAddress);

    // Set up the Order and fill it
    const randomExpiration = getRandomFutureDateInSeconds();
    const exchangeAddress = contractAddresses.exchange;

    // Rather than using a random salt, we use an incrementing salt value.
    // When combined with cancelOrdersUpTo, all lesser values of salt can be cancelled
    // This allows the maker to cancel many orders with one on-chain transaction

    // Create the order
    const order1: Order = {
        exchangeAddress,
        makerAddress: maker,
        takerAddress: NULL_ADDRESS,
        senderAddress: NULL_ADDRESS,
        feeRecipientAddress: NULL_ADDRESS,
        expirationTimeSeconds: randomExpiration,
        salt: new BigNumber(Date.now() - TEN_MINUTES_MS),
        makerAssetAmount,
        takerAssetAmount,
        makerAssetData,
        takerAssetData,
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
    let order1Info = await contractWrappers.exchange.getOrderInfoAsync(order1);
    let order2Info = await contractWrappers.exchange.getOrderInfoAsync(order2);
    let order3Info = await contractWrappers.exchange.getOrderInfoAsync(order3);
    printUtils.printOrderInfos({ order1: order1Info, order2: order2Info, order3: order3Info });

    // Maker cancels all orders before and including order2, order3 remains valid
    const targetOrderEpoch = order2.salt;
    const txHash = await contractWrappers.exchange.cancelOrdersUpToAsync(targetOrderEpoch, maker, {
        gasLimit: TX_DEFAULTS.gas,
    });
    const txReceipt = await printUtils.awaitTransactionMinedSpinnerAsync('cancelOrdersUpTo', txHash);
    printUtils.printTransaction('cancelOrdersUpTo', txReceipt, [['targetOrderEpoch', targetOrderEpoch.toString()]]);
    // Fetch and print the order info
    order1Info = await contractWrappers.exchange.getOrderInfoAsync(order1);
    order2Info = await contractWrappers.exchange.getOrderInfoAsync(order2);
    order3Info = await contractWrappers.exchange.getOrderInfoAsync(order3);
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
