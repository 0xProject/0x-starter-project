import { ContractWrappers, ERC20TokenContract } from '@0x/contract-wrappers';
import { DevUtilsContract } from '@0x/contracts-dev-utils';
import { generatePseudoRandomSalt, Order, signatureUtils, ZeroExTransaction } from '@0x/order-utils';
import { BigNumber } from '@0x/utils';
import { Web3Wrapper } from '@0x/web3-wrapper';

import { NETWORK_CONFIGS, TX_DEFAULTS } from '../configs';
import { DECIMALS, NULL_ADDRESS, NULL_BYTES, UNLIMITED_ALLOWANCE_IN_BASE_UNITS, ZERO } from '../constants';
import { PrintUtils } from '../print_utils';
import { providerEngine } from '../provider_engine';
import { getRandomFutureDateInSeconds, runMigrationsOnceIfRequiredAsync } from '../utils';

/**
 * In this scenario a third party, called the sender, submits the cancel operation on behalf of the maker.
 * This allows a sender to pay the gas for the maker. It can be combined with a custom sender
 * contract with additional business logic (e.g checking a whitelist). Or the sender
 * can choose how and when the transaction should be submitted, if at all.
 * The maker creates and signs the order. The signed order and cancelOrder parameters for the
 * execute transaction function call are signed by the maker as a proof of cancellation.
 */
export async function scenarioAsync(): Promise<void> {
    await runMigrationsOnceIfRequiredAsync();
    PrintUtils.printScenario('Execute Transaction cancelOrderOrder');
    // Initialize the ContractWrappers, this provides helper functions around calling
    // 0x contracts as well as ERC20/ERC721 token contracts on the blockchain
    const contractWrappers = new ContractWrappers(providerEngine, { chainId: NETWORK_CONFIGS.chainId });
    // Initialize the Web3Wrapper, this provides helper functions around fetching
    // account information, balances, general contract logs
    const web3Wrapper = new Web3Wrapper(providerEngine);
    const [maker, taker, sender] = await web3Wrapper.getAvailableAddressesAsync();
    const feeRecipientAddress = sender;
    const zrxTokenAddress = contractWrappers.contractAddresses.zrxToken;
    const etherTokenAddress = contractWrappers.contractAddresses.etherToken;
    const printUtils = new PrintUtils(
        web3Wrapper,
        contractWrappers,
        { maker, taker, sender },
        { WETH: etherTokenAddress, ZRX: zrxTokenAddress },
    );
    printUtils.printAccounts();

    // the amount the maker is selling of maker asset
    const makerAssetAmount = Web3Wrapper.toBaseUnitAmount(new BigNumber(5), DECIMALS);
    // the amount the maker wants of taker asset
    const takerAssetAmount = Web3Wrapper.toBaseUnitAmount(new BigNumber(0.1), DECIMALS);
    // 0x v2 uses hex encoded asset data strings to encode all the information needed to identify an asset
    const makerAssetData = await contractWrappers.devUtils.encodeERC20AssetData(zrxTokenAddress).callAsync();
    const takerAssetData = await contractWrappers.devUtils.encodeERC20AssetData(etherTokenAddress).callAsync();
    let txHash;

    // Allow the 0x ERC20 Proxy to move ZRX on behalf of makerAccount
    const erc20Token = new ERC20TokenContract(zrxTokenAddress, providerEngine);
    const makerZRXApprovalTxHash = await erc20Token
        .approve(contractWrappers.contractAddresses.erc20Proxy, UNLIMITED_ALLOWANCE_IN_BASE_UNITS)
        .sendTransactionAsync({ from: maker });
    await printUtils.awaitTransactionMinedSpinnerAsync('Maker ZRX Approval', makerZRXApprovalTxHash);
    const takerZRXApprovalTxHash = await erc20Token
        .approve(contractWrappers.contractAddresses.erc20Proxy, UNLIMITED_ALLOWANCE_IN_BASE_UNITS)
        .sendTransactionAsync({ from: taker });

    // Allow the 0x ERC20 Proxy to move WETH on behalf of takerAccount
    const etherToken = contractWrappers.weth9;
    const takerWETHApprovalTxHash = await etherToken
        .approve(contractWrappers.contractAddresses.erc20Proxy, UNLIMITED_ALLOWANCE_IN_BASE_UNITS)
        .sendTransactionAsync({ from: taker });
    await printUtils.awaitTransactionMinedSpinnerAsync('Taker WETH Approval', takerWETHApprovalTxHash);

    // Convert ETH into WETH for taker by depositing ETH into the WETH contract
    const takerWETHDepositTxHash = await etherToken.deposit().sendTransactionAsync({
        from: taker,
        value: takerAssetAmount,
    });
    await printUtils.awaitTransactionMinedSpinnerAsync('Taker WETH Deposit', takerWETHDepositTxHash);

    PrintUtils.printData('Setup', [
        ['Maker ZRX Approval', makerZRXApprovalTxHash],
        ['Taker ZRX Approval', takerZRXApprovalTxHash],
        ['Taker WETH Approval', takerWETHApprovalTxHash],
        ['Taker WETH Deposit', takerWETHDepositTxHash],
    ]);

    // Set up the Order and fill it
    const randomExpiration = getRandomFutureDateInSeconds();

    // Create the order
    const order: Order = {
        chainId: NETWORK_CONFIGS.networkId,
        exchangeAddress: contractWrappers.contractAddresses.exchange,
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
        makerFeeAssetData: NULL_BYTES,
        takerFeeAssetData: NULL_BYTES,
        makerFee: ZERO,
        takerFee: ZERO,
    };

    printUtils.printOrder(order);

    // Print out the Balances and Allowances
    await printUtils.fetchAndPrintContractAllowancesAsync();
    await printUtils.fetchAndPrintContractBalancesAsync();

    // Generate the order hash and sign it
    const signedOrder = await signatureUtils.ecSignOrderAsync(providerEngine, order, maker);
    const { orderHash } = await contractWrappers.exchange.getOrderInfo(signedOrder).callAsync();

    let orderInfo = await contractWrappers.exchange.getOrderInfo(signedOrder).callAsync();
    printUtils.printOrderInfos({ order: orderInfo });

    // This is an ABI encoded function call that the taker wishes to perform
    // in this scenario it is a fillOrder
    const cancelData = contractWrappers.exchange.cancelOrder(order).getABIEncodedTransactionData();
    // Generate a random salt to mitigate replay attacks
    const makerCancelOrderTransactionSalt = generatePseudoRandomSalt();
    // The maker signs the operation data (cancelOrder) with the salt
    const zeroExTransaction: ZeroExTransaction = {
        data: cancelData,
        salt: makerCancelOrderTransactionSalt,
        signerAddress: maker,
        expirationTimeSeconds: randomExpiration,
        gasPrice: new BigNumber(2000000000),
        domain: {
            chainId: NETWORK_CONFIGS.networkId,
            verifyingContract: contractWrappers.contractAddresses.exchange,
        },
    };
    const devUtils = new DevUtilsContract(contractWrappers.contractAddresses.devUtils, providerEngine);
    const executeTransactionHex = await devUtils
        .getTransactionHash(
            zeroExTransaction,
            new BigNumber(NETWORK_CONFIGS.chainId),
            contractWrappers.contractAddresses.exchange,
        )
        .callAsync();
    const makerCancelOrderSignatureHex = await signatureUtils.ecSignHashAsync(
        providerEngine,
        executeTransactionHex,
        maker,
    );
    // The sender submits this operation via executeTransaction passing in the signature from the taker
    txHash = await contractWrappers.exchange
        .executeTransaction(zeroExTransaction, makerCancelOrderSignatureHex)
        .sendTransactionAsync({
            gas: TX_DEFAULTS.gas,
            from: sender,
        });
    const txReceipt = await printUtils.awaitTransactionMinedSpinnerAsync('executeTransaction', txHash);
    printUtils.printTransaction('Execute Transaction cancelOrderOrder', txReceipt, [['orderHash', orderHash]]);

    orderInfo = await contractWrappers.exchange.getOrderInfo(signedOrder).callAsync();
    printUtils.printOrderInfos({ order: orderInfo });

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
