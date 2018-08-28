import {
    assetDataUtils,
    BigNumber,
    ContractWrappers,
    generatePseudoRandomSalt,
    Order,
    orderHashUtils,
    signatureUtils,
    SignerType,
} from '0x.js';
import { Web3Wrapper } from '@0xproject/web3-wrapper';

import { NETWORK_CONFIGS, TX_DEFAULTS } from '../configs';
import { NULL_ADDRESS, TEN_MINUTES, ZERO } from '../constants';
import { providerEngine } from '../contracts';
import { PrintUtils } from '../print_utils';

/**
 * In this scenario, the leftMaker creates and signs an order (leftOrder) for selling ZRX for WETH.
 * The rightMaker has a matched (or mirrored) order (rightOrder) of WETH for ZRX.
 * The matcher submits both orders and the 0x Exchange contract calling matchOrders.
 * The matcher pays taker fees on both orders, the leftMaker pays the leftOrder maker fee
 * and the rightMaker pays the rightOrder maker fee.
 * Any spread in the two orders is sent to the sender.
 */
export async function scenarioAsync(): Promise<void> {
    PrintUtils.printScenario('Match Orders');
    // Initialize the ContractWrappers, this provides helper functions around calling
    // contracts on the blockchain
    const contractWrappers = new ContractWrappers(providerEngine, { networkId: NETWORK_CONFIGS.networkId });
    // Initialize the Web3Wraper, this provides helper functions around calling
    // account information, balances, general contract logs
    const web3Wrapper = new Web3Wrapper(providerEngine);
    const [leftMaker, rightMaker, matcherAccount] = await web3Wrapper.getAvailableAddressesAsync();
    const zrxTokenAddress = contractWrappers.exchange.getZRXTokenAddress();
    const etherTokenAddress = contractWrappers.etherToken.getContractAddressIfExists();
    if (!etherTokenAddress) {
        throw new Error('Ether Token not found on this network');
    }
    const printUtils = new PrintUtils(
        web3Wrapper,
        contractWrappers,
        { leftMaker, rightMaker, matcherAccount },
        { WETH: etherTokenAddress, ZRX: zrxTokenAddress },
    );
    printUtils.printAccounts();

    // the amount the maker is selling in maker asset
    const makerAssetAmount = new BigNumber(10);
    // the amount the maker is wanting in taker asset
    const takerAssetAmount = new BigNumber(4);
    // 0x v2 uses asset data to encode the correct proxy type and additional parameters
    const makerAssetData = assetDataUtils.encodeERC20AssetData(zrxTokenAddress);
    const takerAssetData = assetDataUtils.encodeERC20AssetData(etherTokenAddress);
    let txHash;
    let txReceipt;

    // Approve the ERC20 Proxy to move ZRX for makerAccount
    const leftMakerZRXApprovalTxHash = await contractWrappers.erc20Token.setUnlimitedProxyAllowanceAsync(
        zrxTokenAddress,
        leftMaker,
    );
    await printUtils.awaitTransactionMinedSpinnerAsync('Left Maker ZRX Approval', leftMakerZRXApprovalTxHash);

    // Approve the ERC20 Proxy to move ZRX for rightMaker
    const rightMakerZRXApprovalTxHash = await contractWrappers.erc20Token.setUnlimitedProxyAllowanceAsync(
        zrxTokenAddress,
        rightMaker,
    );
    await printUtils.awaitTransactionMinedSpinnerAsync('Right Maker ZRX Approval', rightMakerZRXApprovalTxHash);

    // Approve the ERC20 Proxy to move ZRX for matcherAccount
    const matcherZRXApprovalTxHash = await contractWrappers.erc20Token.setUnlimitedProxyAllowanceAsync(
        zrxTokenAddress,
        matcherAccount,
    );
    await printUtils.awaitTransactionMinedSpinnerAsync('Matcher ZRX Approval', matcherZRXApprovalTxHash);

    // Approve the ERC20 Proxy to move WETH for rightMaker
    const rightMakerWETHApprovalTxHash = await contractWrappers.erc20Token.setUnlimitedProxyAllowanceAsync(
        etherTokenAddress,
        rightMaker,
    );
    await printUtils.awaitTransactionMinedSpinnerAsync('Right Maker WETH Approval', rightMakerZRXApprovalTxHash);

    // Deposit ETH into WETH for the taker
    const rightMakerWETHDepositTxHash = await contractWrappers.etherToken.depositAsync(
        etherTokenAddress,
        takerAssetAmount,
        rightMaker,
    );
    await printUtils.awaitTransactionMinedSpinnerAsync('Right Maker WETH Deposit', rightMakerWETHDepositTxHash);

    PrintUtils.printData('Setup', [
        ['Left Maker ZRX Approval', leftMakerZRXApprovalTxHash],
        ['Right Maker ZRX Approval', rightMakerZRXApprovalTxHash],
        ['Matcher Maker ZRX Approval', matcherZRXApprovalTxHash],
        ['Right Maker WETH Approval', rightMakerWETHApprovalTxHash],
        ['RIght Maker WETH Deposit', rightMakerWETHDepositTxHash],
    ]);

    // Set up the Order and fill it
    const randomExpiration = new BigNumber(Date.now() + TEN_MINUTES);
    const exchangeAddress = contractWrappers.exchange.getContractAddress();

    // Create the order
    const leftOrder: Order = {
        exchangeAddress,
        makerAddress: leftMaker,
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
    PrintUtils.printData('Left Order', Object.entries(leftOrder));

    // Create the matched order
    const rightOrderTakerAssetAmount = new BigNumber(2);
    const rightOrder: Order = {
        exchangeAddress,
        makerAddress: rightMaker,
        takerAddress: NULL_ADDRESS,
        senderAddress: NULL_ADDRESS,
        feeRecipientAddress: NULL_ADDRESS,
        expirationTimeSeconds: randomExpiration,
        salt: generatePseudoRandomSalt(),
        makerAssetAmount: leftOrder.takerAssetAmount,
        takerAssetAmount: rightOrderTakerAssetAmount,
        makerAssetData: leftOrder.takerAssetData,
        takerAssetData: leftOrder.makerAssetData,
        makerFee: ZERO,
        takerFee: ZERO,
    };
    PrintUtils.printData('Right Order', Object.entries(rightOrder));

    // Generate the order hash and sign the order
    const leftOrderHashHex = orderHashUtils.getOrderHashHex(leftOrder);
    const leftOrderSignature = await signatureUtils.ecSignOrderHashAsync(
        providerEngine,
        leftOrderHashHex,
        leftMaker,
        SignerType.Default,
    );
    const leftSignedOrder = { ...leftOrder, signature: leftOrderSignature };

    // Generate the order hash and sign the order
    const rightOrderHashHex = orderHashUtils.getOrderHashHex(rightOrder);
    const rightOrderSignature = await signatureUtils.ecSignOrderHashAsync(
        providerEngine,
        rightOrderHashHex,
        rightMaker,
        SignerType.Default,
    );
    const rightSignedOrder = { ...rightOrder, signature: rightOrderSignature };

    // Print out the Balances and Allowances
    await printUtils.fetchAndPrintContractAllowancesAsync();
    await printUtils.fetchAndPrintContractBalancesAsync();
    // Match the orders via 0x Exchange
    txHash = await contractWrappers.exchange.matchOrdersAsync(leftSignedOrder, rightSignedOrder, matcherAccount, {
        gasLimit: TX_DEFAULTS.gas,
    });

    txReceipt = await printUtils.awaitTransactionMinedSpinnerAsync('matchOrders', txHash);
    printUtils.printTransaction('matchOrders', txReceipt, [
        ['left orderHash', leftOrderHashHex],
        ['right orderHash', rightOrderHashHex],
    ]);

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
