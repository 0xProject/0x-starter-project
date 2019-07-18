import {
    assetDataUtils,
    BigNumber,
    ContractWrappers,
    generatePseudoRandomSalt,
    Order,
    signatureUtils,
    SignedOrder,
} from '0x.js';
import { SwapQuoter, SwapQuoteConsumer } from '@0x/asset-swapper';
import { Web3Wrapper } from '@0x/web3-wrapper';
import { NETWORK_CONFIGS } from '../configs';
import { DECIMALS, NULL_ADDRESS, ZERO } from '../constants';
import { contractAddresses } from '../contracts';
import { PrintUtils } from '../print_utils';
import { providerEngine } from '../provider_engine';
import { getRandomFutureDateInSeconds } from '../utils';

/**
 * In this scenario, the maker creates and signs an order for selling ZRX for WETH.
 * The taker takes this order and fills it via the 0x Exchange contract.
 */
export async function scenarioAsync(): Promise<void> {
    PrintUtils.printScenario('AssetSwapper');
    // Initialize the ContractWrappers, this provides helper functions around calling
    // 0x contracts as well as ERC20/ERC721 token contracts on the blockchain
    const contractWrappers = new ContractWrappers(providerEngine, { networkId: NETWORK_CONFIGS.networkId });
    // Initialize the Web3Wrapper, this provides helper functions around fetching
    // account information, balances, general contract logs
    const web3Wrapper = new Web3Wrapper(providerEngine);
    const [maker, taker] = await web3Wrapper.getAvailableAddressesAsync();
    const zrxTokenAddress = contractAddresses.zrxToken;
    const etherTokenAddress = contractAddresses.etherToken;
    const printUtils = new PrintUtils(
        web3Wrapper,
        contractWrappers,
        { maker, taker },
        { WETH: etherTokenAddress, ZRX: zrxTokenAddress },
    );
    printUtils.printAccounts();

    // Allow the 0x ERC20 Proxy to move ZRX on behalf of makerAccount
    const makerZRXApprovalTxHash = await contractWrappers.erc20Token.setUnlimitedProxyAllowanceAsync(
        zrxTokenAddress,
        maker,
    );
    await printUtils.awaitTransactionMinedSpinnerAsync('Maker ZRX Approval', makerZRXApprovalTxHash);

    PrintUtils.printData('Setup', [['Maker ZRX Approval', makerZRXApprovalTxHash]]);

    
    // Create the order
    const generateRandomOrders = async (count: number): Promise<SignedOrder[]> => {
        const orders = [];
        for (let i = 0; i < count; i++) {
            // Set up the Order and fill it
            const randomExpiration = getRandomFutureDateInSeconds();
            const exchangeAddress = contractAddresses.exchange;
            const makerAssetData = assetDataUtils.encodeERC20AssetData(zrxTokenAddress);
            const takerAssetData = assetDataUtils.encodeERC20AssetData(etherTokenAddress);

            const makerAssetAmount = Web3Wrapper.toBaseUnitAmount(new BigNumber(5 * Math.random()), DECIMALS);
            const takerAssetAmount = Web3Wrapper.toBaseUnitAmount(new BigNumber(0.1), DECIMALS);
            const order: Order = {
                exchangeAddress,
                makerAddress: maker,
                takerAddress: NULL_ADDRESS,
                senderAddress: NULL_ADDRESS,
                feeRecipientAddress: NULL_ADDRESS,
                expirationTimeSeconds: randomExpiration,
                salt: generatePseudoRandomSalt(),
                makerAssetAmount,
                takerAssetAmount,
                makerAssetData,
                takerAssetData,
                makerFee: ZERO,
                takerFee: ZERO,
            };
            const signedOrder = await signatureUtils.ecSignOrderAsync(providerEngine, order, maker)
            orders.push(signedOrder);
        }
        return orders;
    };

    // Print out the Balances
    await printUtils.fetchAndPrintContractBalancesAsync();

    // Generate orders with random pricing
    const orders = await generateRandomOrders(10);

    const swapQuoter = SwapQuoter.getSwapQuoterForProvidedOrders(providerEngine, orders, {
        networkId: NETWORK_CONFIGS.networkId,
    });
    // Create the swap quote, showing best case and worst case
    let quote = await swapQuoter.getMarketBuySwapQuoteAsync(
        zrxTokenAddress,
        etherTokenAddress,
        Web3Wrapper.toBaseUnitAmount(new BigNumber(5), DECIMALS),
    );
    const consumer = new SwapQuoteConsumer(providerEngine, { networkId: NETWORK_CONFIGS.networkId });
    // Execute the swap, if the taker does not have WETH it uses the Forwarder contract
    // If the taker has WETH and a large enough balance it uses the Exchange contract
    // For all other ERC20<->ERC20 trades the Exchange contract is used
    let txHash = await consumer.executeSwapQuoteOrThrowAsync(quote, {
        takerAddress: taker,
    });
    let txReceipt = await printUtils.awaitTransactionMinedSpinnerAsync('AssetSwapper', txHash);
    printUtils.printTransaction('AssetSwapper', txReceipt, []);
    await printUtils.fetchAndPrintContractBalancesAsync();

    // Taker Deposits ETH into WETH
    const takerWETHApprovalTxHash = await contractWrappers.erc20Token.setUnlimitedProxyAllowanceAsync(
        etherTokenAddress,
        taker,
    );
    await printUtils.awaitTransactionMinedSpinnerAsync('Taker WETH Approval', takerWETHApprovalTxHash);

    // Convert ETH into WETH for taker by depositing ETH into the WETH contract
    const takerWETHDepositTxHash = await contractWrappers.etherToken.depositAsync(
        etherTokenAddress,
        Web3Wrapper.toBaseUnitAmount(new BigNumber(1), DECIMALS),
        taker,
    );
    await printUtils.awaitTransactionMinedSpinnerAsync('Taker WETH Deposit', takerWETHDepositTxHash);
    quote = await swapQuoter.getMarketBuySwapQuoteAsync(
        zrxTokenAddress,
        etherTokenAddress,
        Web3Wrapper.toBaseUnitAmount(new BigNumber(5), DECIMALS),
    );
    txHash = await consumer.executeSwapQuoteOrThrowAsync(quote, {
        takerAddress: taker,
    });
    printUtils.printTransaction('AssetSwapper', txReceipt, []);

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
