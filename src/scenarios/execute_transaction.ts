import {
    assetDataUtils,
    BigNumber,
    ContractWrappers,
    generatePseudoRandomSalt,
    Order,
    orderHashUtils,
    signatureUtils,
    SignedOrder,
    SignerType,
} from '0x.js';
import { Web3Wrapper } from '@0xproject/web3-wrapper';

import { NETWORK_CONFIGS, TX_DEFAULTS } from '../configs';
import { NULL_ADDRESS, TEN_MINUTES } from '../constants';
import { providerEngine } from '../contracts';
import { PrintUtils } from '../print_utils';

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
    // contracts on the blockchain
    const contractWrappers = new ContractWrappers(providerEngine, { networkId: NETWORK_CONFIGS.networkId });
    // Initialize the Web3Wraper, this provides helper functions around calling
    // account information, balances, general contract logs
    const web3Wrapper = new Web3Wrapper(providerEngine);
    const [maker, taker, sender] = await web3Wrapper.getAvailableAddressesAsync();
    const feeRecipientAddress = sender;
    const zrxTokenAddress = contractWrappers.exchange.getZRXTokenAddress();
    const etherTokenAddress = contractWrappers.etherToken.getContractAddressIfExists();
    if (!etherTokenAddress) {
        throw new Error('Ether Token not found on this network');
    }
    const printUtils = new PrintUtils(
        web3Wrapper,
        contractWrappers,
        { maker, taker, sender },
        { WETH: etherTokenAddress, ZRX: zrxTokenAddress },
    );
    printUtils.printAccounts();

    // the amount the maker is selling in maker asset
    const makerAssetAmount = new BigNumber(100);
    // the amount the maker is wanting in taker asset
    const takerAssetAmount = new BigNumber(10);
    // the amount the maker pays in fees
    const makerFee = new BigNumber(2);
    // the amount the taker pays in fees
    const takerFee = new BigNumber(3);
    // 0x v2 uses asset data to encode the correct proxy type and additional parameters
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

    // Deposit ETH into WETH for the taker
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
    const randomExpiration = new BigNumber(Date.now() + TEN_MINUTES);

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

    const exchangeAddress = contractWrappers.exchange.getContractAddress();
    const order: Order = {
        ...orderWithoutExchangeAddress,
        exchangeAddress,
    };
    printUtils.printOrder(order);

    // Print out the Balances and Allowances
    await printUtils.fetchAndPrintContractAllowancesAsync();
    await printUtils.fetchAndPrintContractBalancesAsync();

    // Generate the order hash and sign the order
    const orderHashHex = orderHashUtils.getOrderHashHex(order);
    const signature = await signatureUtils.ecSignOrderHashAsync(
        providerEngine,
        orderHashHex,
        maker,
        SignerType.Default,
    );

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
    const takerSignatureHex = await signatureUtils.ecSignOrderHashAsync(
        providerEngine,
        executeTransactionHex,
        taker,
        SignerType.Default,
    );
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
    }
})();
