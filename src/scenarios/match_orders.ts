import {
    assetDataUtils,
    BigNumber,
    ContractWrappers,
    generatePseudoRandomSalt,
    Order,
    orderHashUtils,
    signatureUtils,
} from '0x.js';
import { Web3Wrapper } from '@0x/web3-wrapper';

import { NETWORK_CONFIGS, TX_DEFAULTS } from '../configs';
import { DECIMALS, NULL_ADDRESS, ZERO } from '../constants';
import { getContractAddressesForNetwork, getContractWrappersConfig } from '../contracts';
import { PrintUtils } from '../print_utils';
import { providerEngine } from '../provider_engine';
import { getRandomFutureDateInSeconds } from '../utils';

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
    // 0x contracts as well as ERC20/ERC721 token contracts on the blockchain
    const contractWrappers = new ContractWrappers(providerEngine, getContractWrappersConfig(NETWORK_CONFIGS.networkId));
    // Initialize the Web3Wrapper, this provides helper functions around fetching
    // account information, balances, general contract logs
    const web3Wrapper = new Web3Wrapper(providerEngine);
    const [leftMaker, rightMaker, matcherAccount] = await web3Wrapper.getAvailableAddressesAsync();
    const contractAddresses = getContractAddressesForNetwork(NETWORK_CONFIGS.networkId);
    const zrxTokenAddress = contractAddresses.zrxToken;
    const etherTokenAddress = contractAddresses.etherToken;
    const printUtils = new PrintUtils(
        web3Wrapper,
        contractWrappers,
        { leftMaker, rightMaker, matcherAccount },
        { WETH: etherTokenAddress, ZRX: zrxTokenAddress },
    );
    printUtils.printAccounts();

    // the amount the maker is selling of maker asset
    const makerAssetAmount = Web3Wrapper.toBaseUnitAmount(new BigNumber(10), DECIMALS);
    // the amount the maker wants of taker asset
    const takerAssetAmount = Web3Wrapper.toBaseUnitAmount(new BigNumber(0.4), DECIMALS);
    // 0x v2 uses hex encoded asset data strings to encode all the information needed to identify an asset
    const makerAssetData = assetDataUtils.encodeERC20AssetData(zrxTokenAddress);
    const takerAssetData = assetDataUtils.encodeERC20AssetData(etherTokenAddress);
    let txHash;
    let txReceipt;

    // Allow the 0x ERC20 Proxy to move ZRX on behalf of makerAccount
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

    // Convert ETH into WETH for taker by depositing ETH into the WETH contract
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
    const randomExpiration = getRandomFutureDateInSeconds();
    const exchangeAddress = contractAddresses.exchange;

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
    const rightOrderTakerAssetAmount = Web3Wrapper.toBaseUnitAmount(new BigNumber(0.2), DECIMALS);
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

    // Generate the order hash and sign it
    const leftOrderHashHex = orderHashUtils.getOrderHashHex(leftOrder);
    const leftOrderSignature = await signatureUtils.ecSignHashAsync(providerEngine, leftOrderHashHex, leftMaker);
    const leftSignedOrder = { ...leftOrder, signature: leftOrderSignature };

    // Generate the order hash and sign it
    const rightOrderHashHex = orderHashUtils.getOrderHashHex(rightOrder);
    const rightOrderSignature = await signatureUtils.ecSignHashAsync(providerEngine, rightOrderHashHex, rightMaker);
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
        process.exit(1);
    }
})();
