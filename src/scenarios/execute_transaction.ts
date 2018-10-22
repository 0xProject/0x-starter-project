import {
    assetDataUtils,
    BigNumber,
    ContractWrappers,
    generatePseudoRandomSalt,
    Order,
    orderHashUtils,
    signatureUtils,
    SignedOrder,
} from '0x.js';
import { Web3Wrapper } from '@0x/web3-wrapper';

import { NETWORK_CONFIGS, TX_DEFAULTS } from '../configs';
import { DECIMALS, NULL_ADDRESS } from '../constants';
import { getContractAddressesForNetwork, getContractWrappersConfig } from '../contracts';
import { PrintUtils } from '../print_utils';
import { providerEngine } from '../provider_engine';
import { getRandomFutureDateInSeconds } from '../utils';

/**
 * In this scenario a third party, called the sender, submits the operation on behalf of the taker.
 * This allows a sender to pay the gas on for the taker. It can be combined with a custom sender
 * contract with additional business logic (e.g checking a whitelist). Or the sender
 * can choose how and when the transaction should be submitted, if at all.
 * The maker creates and signs the order. The signed order and fillOrder parameters for the
 * execute transaction function call are signed by the taker.
 */
export async function scenarioAsync(): Promise<void> {
    PrintUtils.printScenario('Execute Transaction fillOrder');
    // Initialize the ContractWrappers, this provides helper functions around calling
    // 0x contracts as well as ERC20/ERC721 token contracts on the blockchain
    const contractWrappers = new ContractWrappers(providerEngine, getContractWrappersConfig(NETWORK_CONFIGS.networkId));
    // Initialize the Web3Wrapper, this provides helper functions around fetching
    // account information, balances, general contract logs
    const web3Wrapper = new Web3Wrapper(providerEngine);
    const [maker, taker, sender] = await web3Wrapper.getAvailableAddressesAsync();
    const feeRecipientAddress = sender;
    const contractAddresses = getContractAddressesForNetwork(NETWORK_CONFIGS.networkId);
    const zrxTokenAddress = contractAddresses.zrxToken;
    const etherTokenAddress = contractAddresses.etherToken;
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
    // the amount of fees the maker pays in ZRX
    const makerFee = Web3Wrapper.toBaseUnitAmount(new BigNumber(0.01), DECIMALS);
    // the amount of fees the taker pays in ZRX
    const takerFee = Web3Wrapper.toBaseUnitAmount(new BigNumber(0.01), DECIMALS);
    // 0x v2 uses hex encoded asset data strings to encode all the information needed to identify an asset
    const makerAssetData = assetDataUtils.encodeERC20AssetData(zrxTokenAddress);
    const takerAssetData = assetDataUtils.encodeERC20AssetData(etherTokenAddress);
    let txHash;

    // Approve the ERC20 Proxy to move ZRX for maker
    const makerZRXApprovalTxHash = await contractWrappers.erc20Token.setUnlimitedProxyAllowanceAsync(
        zrxTokenAddress,
        maker,
    );
    await printUtils.awaitTransactionMinedSpinnerAsync('Maker ZRX Approval', makerZRXApprovalTxHash);

    // Approve the ERC20 Proxy to move ZRX for taker
    const takerZRXApprovalTxHash = await contractWrappers.erc20Token.setUnlimitedProxyAllowanceAsync(
        zrxTokenAddress,
        taker,
    );
    await printUtils.awaitTransactionMinedSpinnerAsync('Taker ZRX Approval', takerZRXApprovalTxHash);

    // Approve the ERC20 Proxy to move WETH for taker
    const takerWETHApprovalTxHash = await contractWrappers.erc20Token.setUnlimitedProxyAllowanceAsync(
        etherTokenAddress,
        taker,
    );
    await printUtils.awaitTransactionMinedSpinnerAsync('Taker WETH Approval', takerWETHApprovalTxHash);

    // Convert ETH into WETH for taker by depositing ETH into the WETH contract
    const takerWETHDepositTxHash = await contractWrappers.etherToken.depositAsync(
        etherTokenAddress,
        takerAssetAmount,
        taker,
    );
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
    const orderWithoutExchangeAddress = {
        makerAddress: maker,
        takerAddress: NULL_ADDRESS,
        senderAddress: NULL_ADDRESS,
        feeRecipientAddress,
        expirationTimeSeconds: randomExpiration,
        salt: generatePseudoRandomSalt(),
        makerAssetAmount,
        takerAssetAmount,
        makerAssetData,
        takerAssetData,
        makerFee,
        takerFee,
    };

    const exchangeAddress = contractAddresses.exchange;
    const order: Order = {
        ...orderWithoutExchangeAddress,
        exchangeAddress,
    };
    printUtils.printOrder(order);

    // Print out the Balances and Allowances
    await printUtils.fetchAndPrintContractAllowancesAsync();
    await printUtils.fetchAndPrintContractBalancesAsync();

    // Generate the order hash and sign it
    const orderHashHex = orderHashUtils.getOrderHashHex(order);
    const signature = await signatureUtils.ecSignHashAsync(providerEngine, orderHashHex, maker);

    const signedOrder: SignedOrder = {
        ...order,
        signature,
    };

    // The transaction encoder provides helpers in encoding 0x Exchange transactions to allow
    // a third party to submit the transaction. This operates in the context of the signer (taker)
    // rather then the context of the submitter (sender)
    const transactionEncoder = await contractWrappers.exchange.transactionEncoderAsync();
    // This is an ABI encoded function call that the taker wishes to perform
    // in this scenario it is a fillOrder
    const fillData = transactionEncoder.fillOrderTx(signedOrder, takerAssetAmount);
    // Generate a random salt to mitigate replay attacks
    const takerTransactionSalt = generatePseudoRandomSalt();
    // The taker signs the operation data (fillOrder) with the salt
    const executeTransactionHex = transactionEncoder.getTransactionHex(fillData, takerTransactionSalt, taker);
    const takerSignatureHex = await signatureUtils.ecSignHashAsync(providerEngine, executeTransactionHex, taker);
    // The sender submits this operation via executeTransaction passing in the signature from the taker
    txHash = await contractWrappers.exchange.executeTransactionAsync(
        takerTransactionSalt,
        taker,
        fillData,
        takerSignatureHex,
        sender,
        {
            gasLimit: TX_DEFAULTS.gas,
        },
    );
    const txReceipt = await printUtils.awaitTransactionMinedSpinnerAsync('executeTransaction', txHash);
    printUtils.printTransaction('Execute Transaction fillOrder', txReceipt, [['orderHash', orderHashHex]]);

    // Print the Balances
    await printUtils.fetchAndPrintContractBalancesAsync();

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
