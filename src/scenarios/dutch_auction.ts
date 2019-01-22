import {
    assetDataUtils,
    BigNumber,
    ContractWrappers,
    DutchAuctionWrapper,
    generatePseudoRandomSalt,
    Order,
    orderHashUtils,
    signatureUtils,
} from '0x.js';
import { Web3Wrapper } from '@0x/web3-wrapper';

import { NETWORK_CONFIGS, TX_DEFAULTS } from '../configs';
import { DECIMALS, NULL_ADDRESS, ONE_SECOND_MS, TEN_MINUTES_MS, ZERO } from '../constants';
import { contractAddresses } from '../contracts';
import { PrintUtils } from '../print_utils';
import { providerEngine } from '../provider_engine';
import { getRandomFutureDateInSeconds } from '../utils';

/**
 * In this scenario, the Seller is creating an order for use via the Dutch Auction contract.
 * Over time the price for this asset will decrease until it reaches the auction end time.
 * The Seller signs an order for the price at the end of the auction. The Dutch Auction
 * contract ensures the order is filled at the correct amount given the current block.
 * The Seller's order can only be filled via the Dutch Auction contract as takerAddress
 * is specified.
 *
 * The Buyer creates a matching order and calls matchOrders on the Dutch Auction contract.
 * The amount for the Buyer is calculated given the current block, if the Buyer's order
 * has any excess amount it is returned to the buyer.
 */
export async function scenarioAsync(): Promise<void> {
    PrintUtils.printScenario('Dutch Auction');
    // Initialize the ContractWrappers, this provides helper functions around calling
    // 0x contracts as well as ERC20/ERC721 token contracts on the blockchain
    const contractWrappers = new ContractWrappers(providerEngine, { networkId: NETWORK_CONFIGS.networkId });
    // Initialize the Web3Wrapper, this provides helper functions around fetching
    // account information, balances, general contract logs
    const web3Wrapper = new Web3Wrapper(providerEngine);
    const [sellMaker, buyMaker] = await web3Wrapper.getAvailableAddressesAsync();
    const zrxTokenAddress = contractAddresses.zrxToken;
    const etherTokenAddress = contractAddresses.etherToken;
    const printUtils = new PrintUtils(
        web3Wrapper,
        contractWrappers,
        { sellMaker, buyMaker },
        { WETH: etherTokenAddress, ZRX: zrxTokenAddress },
    );
    printUtils.printAccounts();

    // the amount the maker is selling of maker asset
    const makerAssetAmount = Web3Wrapper.toBaseUnitAmount(new BigNumber(10), DECIMALS);
    // the initial opening price of the auction
    const auctionBeginAmount = Web3Wrapper.toBaseUnitAmount(new BigNumber(1), DECIMALS);
    // the final amount at the end of the auction
    const auctionEndAmount = Web3Wrapper.toBaseUnitAmount(new BigNumber(0.1), DECIMALS);
    // 0x v2 uses hex encoded asset data strings to encode all the information needed to identify an asset
    const makerAssetData = assetDataUtils.encodeERC20AssetData(zrxTokenAddress);
    const takerAssetData = assetDataUtils.encodeERC20AssetData(etherTokenAddress);
    // Begin the auction ten minutes ago
    const auctionBeginTimeSeconds = new BigNumber(Date.now() - TEN_MINUTES_MS).div(ONE_SECOND_MS).ceil();
    // Additional data is encoded in the maker asset data, this includes the begin time and begin amount
    // for the auction
    const dutchAuctionEncodedAssetData = DutchAuctionWrapper.encodeDutchAuctionAssetData(
        makerAssetData,
        auctionBeginTimeSeconds,
        auctionBeginAmount,
    );
    let txHash;
    let txReceipt;

    // Allow the 0x ERC20 Proxy to move ZRX on behalf of makerAccount
    const sellMakerZRXApprovalTxHash = await contractWrappers.erc20Token.setUnlimitedProxyAllowanceAsync(
        zrxTokenAddress,
        sellMaker,
    );
    await printUtils.awaitTransactionMinedSpinnerAsync('Sell Maker ZRX Approval', sellMakerZRXApprovalTxHash);

    // Approve the ERC20 Proxy to move WETH for rightMaker
    const buyMakerWETHApprovalTxHash = await contractWrappers.erc20Token.setUnlimitedProxyAllowanceAsync(
        etherTokenAddress,
        buyMaker,
    );
    await printUtils.awaitTransactionMinedSpinnerAsync('Buy Maker WETH Approval', buyMakerWETHApprovalTxHash);

    // Convert ETH into WETH for taker by depositing ETH into the WETH contract
    const buyMakerWETHDepositTxHash = await contractWrappers.etherToken.depositAsync(
        etherTokenAddress,
        auctionBeginAmount,
        buyMaker,
    );
    await printUtils.awaitTransactionMinedSpinnerAsync('Buy Maker WETH Deposit', buyMakerWETHDepositTxHash);

    PrintUtils.printData('Setup', [
        ['Sell Maker ZRX Approval', sellMakerZRXApprovalTxHash],
        ['Buy Maker WETH Approval', buyMakerWETHApprovalTxHash],
        ['Buy Maker WETH Deposit', buyMakerWETHDepositTxHash],
    ]);

    // Set up the Order and fill it
    const randomExpiration = getRandomFutureDateInSeconds();
    const exchangeAddress = contractAddresses.exchange;

    // Create the order
    const sellOrder: Order = {
        exchangeAddress,
        makerAddress: sellMaker,
        // taker address is specified to ensure ONLY the dutch auction contract
        // can fill this order (ensuring the price given the block time)
        takerAddress: contractWrappers.dutchAuction.address,
        senderAddress: NULL_ADDRESS,
        feeRecipientAddress: NULL_ADDRESS,
        expirationTimeSeconds: randomExpiration,
        salt: generatePseudoRandomSalt(),
        makerAssetAmount,
        // taker asset amount is the auction end price. The Dutch Auction
        // contract ensures this is filled at the correct amount
        takerAssetAmount: auctionEndAmount,
        // maker asset data is encoded with additional data used by
        // the Dutch Auction contract
        makerAssetData: dutchAuctionEncodedAssetData,
        takerAssetData,
        makerFee: ZERO,
        takerFee: ZERO,
    };
    PrintUtils.printData('Sell Order', Object.entries(sellOrder));
    // Generate the order hash and sign it
    const sellOrderHashHex = orderHashUtils.getOrderHashHex(sellOrder);
    const sellOrderSignature = await signatureUtils.ecSignHashAsync(providerEngine, sellOrderHashHex, sellMaker);
    const sellSignedOrder = { ...sellOrder, signature: sellOrderSignature };

    // Create the buy order
    const auctionDetails = await contractWrappers.dutchAuction.getAuctionDetailsAsync(sellSignedOrder);
    const currentAuctionAmount = auctionDetails.currentAmount;
    // The buyer creates a matching order, specifying the current auction amount
    const buyOrder: Order = {
        ...sellOrder,
        makerAddress: buyMaker,
        makerAssetData: sellOrder.takerAssetData,
        takerAssetData: sellOrder.makerAssetData,
        makerAssetAmount: currentAuctionAmount,
        takerAssetAmount: sellOrder.makerAssetAmount,
    };
    PrintUtils.printData('Buy Order', Object.entries(buyOrder));

    // Generate the order hash and sign it
    const buyOrderHashHex = orderHashUtils.getOrderHashHex(buyOrder);
    const buyOrderSignature = await signatureUtils.ecSignHashAsync(providerEngine, buyOrderHashHex, buyMaker);
    const buySignedOrder = { ...buyOrder, signature: buyOrderSignature };

    // Print out the Balances and Allowances
    await printUtils.fetchAndPrintContractAllowancesAsync();
    await printUtils.fetchAndPrintContractBalancesAsync();
    // Match the orders via the Dutch Auction contract
    txHash = await contractWrappers.dutchAuction.matchOrdersAsync(buySignedOrder, sellSignedOrder, buyMaker, {
        gasLimit: TX_DEFAULTS.gas,
    });

    txReceipt = await printUtils.awaitTransactionMinedSpinnerAsync('DutchAuction', txHash);
    printUtils.printTransaction('DutchAuction', txReceipt, [
        ['sell orderHash', sellOrderHashHex],
        ['buy orderHash', buyOrderHashHex],
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
