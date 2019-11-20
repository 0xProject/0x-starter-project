import { ContractWrappers, ERC721TokenContract } from '@0x/contract-wrappers';
import { assetDataUtils, generatePseudoRandomSalt, Order, signatureUtils } from '@0x/order-utils';
import { BigNumber } from '@0x/utils';
import { Web3Wrapper } from '@0x/web3-wrapper';

import { NETWORK_CONFIGS, TX_DEFAULTS } from '../configs';
import { DECIMALS, NULL_ADDRESS, NULL_BYTES, UNLIMITED_ALLOWANCE_IN_BASE_UNITS, ZERO } from '../constants';
import { dummyERC721TokenContracts } from '../contracts';
import { PrintUtils } from '../print_utils';
import { providerEngine } from '../provider_engine';
import { calculateProtocolFee, getRandomFutureDateInSeconds, runMigrationsOnceIfRequiredAsync } from '../utils';

/**
 * In this scenario, the maker creates and signs an order for selling an ERC721 token for WETH.
 * The taker fills it via the 0x Exchange contract.
 */
export async function scenarioAsync(): Promise<void> {
    await runMigrationsOnceIfRequiredAsync();
    PrintUtils.printScenario('Fill Order ERC721');
    // Initialize the ContractWrappers, this provides helper functions around calling
    // 0x contracts as well as ERC20/ERC721 token contracts on the blockchain
    const contractWrappers = new ContractWrappers(providerEngine, { chainId: NETWORK_CONFIGS.chainId });
    const etherTokenAddress = contractWrappers.contractAddresses.etherToken;
    const dummyERC721TokenContract = dummyERC721TokenContracts[0];
    if (!dummyERC721TokenContract) {
        console.log('No Dummy ERC721 Tokens deployed on this network');
        return;
    }
    // Initialize the Web3Wrapper, this provides helper functions around fetching
    // account information, balances, general contract logs
    const web3Wrapper = new Web3Wrapper(providerEngine);
    const [maker, taker] = await web3Wrapper.getAvailableAddressesAsync();

    const printUtils = new PrintUtils(web3Wrapper, contractWrappers, { maker, taker }, { WETH: etherTokenAddress });
    printUtils.printAccounts();

    // the amount the maker is selling of maker asset (1 ERC721 Token)
    const makerAssetAmount = new BigNumber(1);
    // the amount the maker wants of taker asset
    const takerAssetAmount = Web3Wrapper.toBaseUnitAmount(new BigNumber(0.1), DECIMALS);
    // Generate a random token id
    const tokenId = generatePseudoRandomSalt();
    // 0x v2 uses hex encoded asset data strings to encode all the information needed to identify an asset
    const makerAssetData = assetDataUtils.encodeERC721AssetData(dummyERC721TokenContract.address, tokenId);
    const takerAssetData = await contractWrappers.devUtils.encodeERC20AssetData(etherTokenAddress).callAsync();
    let txHash;

    // Mint a new ERC721 token for the maker
    const mintTxHash = await dummyERC721TokenContract.mint(maker, tokenId).sendTransactionAsync({ from: maker });
    await printUtils.awaitTransactionMinedSpinnerAsync('Mint ERC721 Token', mintTxHash);

    // Allow the 0x ERC721 Proxy to move ERC721 tokens on behalf of maker
    const erc721Token = new ERC721TokenContract(dummyERC721TokenContract.address, providerEngine);
    const makerERC721ApprovalTxHash = await erc721Token
        .setApprovalForAll(contractWrappers.contractAddresses.erc721Proxy, true)
        .sendTransactionAsync({ from: maker });
    await printUtils.awaitTransactionMinedSpinnerAsync('Maker ERC721 Approval', makerERC721ApprovalTxHash);

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
        ['Mint ERC721', mintTxHash],
        ['Maker ERC721 Approval', makerERC721ApprovalTxHash],
        ['Taker WETH Approval', takerWETHApprovalTxHash],
        ['Taker WETH Deposit', takerWETHDepositTxHash],
    ]);

    // Set up the Order and fill it
    const randomExpiration = getRandomFutureDateInSeconds();
    const exchangeAddress = contractWrappers.contractAddresses.exchange;

    // Create the order
    const order: Order = {
        chainId: NETWORK_CONFIGS.networkId,
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
        makerFeeAssetData: NULL_BYTES,
        takerFeeAssetData: NULL_BYTES,
        makerFee: ZERO,
        takerFee: ZERO,
    };

    printUtils.printOrder(order);

    // Print out the Balances and Allowances
    await printUtils.fetchAndPrintContractAllowancesAsync();
    await printUtils.fetchAndPrintContractBalancesAsync();
    await printUtils.fetchAndPrintERC721OwnerAsync(dummyERC721TokenContract.address, tokenId);

    // Generate the order hash and sign it
    const signedOrder = await signatureUtils.ecSignOrderAsync(providerEngine, order, maker);
    const { orderHash } = await contractWrappers.exchange.getOrderInfo(signedOrder).callAsync();
    // Fill the Order via 0x.js Exchange contract
    txHash = await contractWrappers.exchange
        .fillOrder(signedOrder, takerAssetAmount, signedOrder.signature)
        .sendTransactionAsync({ from: taker, ...TX_DEFAULTS, value: calculateProtocolFee([signedOrder]) });
    const txReceipt = await printUtils.awaitTransactionMinedSpinnerAsync('fillOrder', txHash);
    printUtils.printTransaction('fillOrder', txReceipt, [['orderHash', orderHash]]);

    // Print the Balances
    await printUtils.fetchAndPrintContractBalancesAsync();
    await printUtils.fetchAndPrintERC721OwnerAsync(dummyERC721TokenContract.address, tokenId);

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
