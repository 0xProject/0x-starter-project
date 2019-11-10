import { ContractWrappers, Order } from '@0x/contract-wrappers';
import { assetDataUtils, generatePseudoRandomSalt, orderHashUtils, signatureUtils } from '@0x/order-utils';
import { BigNumber } from '@0x/utils';
import { Web3Wrapper } from '@0x/web3-wrapper';

import { NETWORK_CONFIGS, TX_DEFAULTS } from '../configs';
import { DECIMALS, NULL_ADDRESS, NULL_BYTES, ZERO } from '../constants';
import { contractAddresses, dummyERC721TokenContracts } from '../contracts';
import { PrintUtils } from '../print_utils';
import { providerEngine } from '../provider_engine';
import { calculateProtocolFee, getRandomFutureDateInSeconds, runMigrationsOnceIfRequiredAsync } from '../utils';

/**
 * In this scenario, the maker creates and signs an order for selling an ERC721 token for WETH.
 * The taker uses the forwarding contract and buys these tokens. When using the Forwarding
 * contract the taker does not require any additional setup.
 */
export async function scenarioAsync(): Promise<void> {
    await runMigrationsOnceIfRequiredAsync();
    PrintUtils.printScenario('Forwarder Buy ERC721 token');
    // Initialize the ContractWrappers, this provides helper functions around calling
    // 0x contracts as well as ERC20/ERC721 token contracts on the blockchain
    const contractWrappers = new ContractWrappers(providerEngine, { chainId: NETWORK_CONFIGS.chainId });
    const etherTokenAddress = contractAddresses.etherToken;
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

    // the amount the maker is selling of maker asset: 1 ERC721 Token
    const makerAssetAmount = new BigNumber(1);
    // the amount the maker is selling of maker asset
    const takerAssetAmount = Web3Wrapper.toBaseUnitAmount(new BigNumber(0.1), DECIMALS);
    const tokenId = generatePseudoRandomSalt();
    // 0x v2 uses hex encoded asset data strings to encode all the information needed to identify an asset
    const makerAssetData = assetDataUtils.encodeERC721AssetData(dummyERC721TokenContract.address, tokenId);
    const takerAssetData = await contractWrappers.devUtils.encodeERC20AssetData.callAsync(etherTokenAddress);
    let txHash;

    // Mint a new ERC721 token for the maker
    const mintTxHash = await dummyERC721TokenContract.mint.sendTransactionAsync(maker, tokenId, { from: maker });
    await printUtils.awaitTransactionMinedSpinnerAsync('Mint ERC721 Token', mintTxHash);
    // Allow the 0x ERC721 Proxy to move ERC721 tokens on behalf of maker
    const isApproved = true;
    const makerERC721ApprovalTxHash = await dummyERC721TokenContract.setApprovalForAll.sendTransactionAsync(
        contractAddresses.erc721Proxy,
        isApproved,
        { from: maker },
    );
    await printUtils.awaitTransactionMinedSpinnerAsync('Maker ERC721 Approval', makerERC721ApprovalTxHash);

    // With the Forwarding contract, the taker requires 0 additional set up
    PrintUtils.printData('Setup', [
        ['Mint ERC721 Token', mintTxHash],
        ['Maker ERC721 Token Approval', makerERC721ApprovalTxHash],
    ]);

    // Set up the Order and fill it
    const randomExpiration = getRandomFutureDateInSeconds();
    const exchangeAddress = contractAddresses.exchange;

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

    // Maker signs the order
    const signedOrder = await signatureUtils.ecSignOrderAsync(providerEngine, order, maker);
    const affiliateFeeRecipient = NULL_ADDRESS;
    const affiliateFee = ZERO;

    // Use the Forwarder to market buy the ERC721 orders using Eth. When using the Forwarder
    // the taker does not need to set any allowances or deposit any ETH into WETH
    txHash = await contractWrappers.forwarder.marketBuyOrdersWithEth.sendTransactionAsync(
        [signedOrder],
        order.makerAssetAmount,
        [signedOrder.signature],
        affiliateFee,
        affiliateFeeRecipient,
        {
            from: taker,
            ...TX_DEFAULTS,
            value: order.takerAssetAmount.plus(calculateProtocolFee([signedOrder])),
        },
    );
    const txReceipt = await printUtils.awaitTransactionMinedSpinnerAsync('marketBuyTokensWithEth', txHash);
    printUtils.printTransaction('marketBuyTokensWithEth', txReceipt, [
        ['orderHash', orderHashUtils.getOrderHashHex(order)],
    ]);

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
