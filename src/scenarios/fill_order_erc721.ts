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
import { dummyERC721TokenContracts, providerEngine } from '../contracts';
import { PrintUtils } from '../print_utils';

/**
 * In this scenario, the maker creates and signs an order for selling an ERC721 token for WETH.
 * The taker fills it via the 0x Exchange contract.
 */
export async function scenarioAsync(): Promise<void> {
    PrintUtils.printScenario('Fill Order ERC721');
    // Initialize the ContractWrappers, this provides helper functions around calling
    // contracts on the blockchain
    const contractWrappers = new ContractWrappers(providerEngine, { networkId: NETWORK_CONFIGS.networkId });
    const dummyERC721TokenContract = dummyERC721TokenContracts[0];
    if (!dummyERC721TokenContract) {
        console.log('No Dummy ERC721 Tokens deployed on this network');
        return;
    }
    const etherTokenAddress = contractWrappers.etherToken.getContractAddressIfExists();
    if (!etherTokenAddress) {
        throw new Error('Ether Token not found on this network');
    }
    // Initialize the Web3Wraper, this provides helper functions around calling
    // account information, balances, general contract logs
    const web3Wrapper = new Web3Wrapper(providerEngine);
    const [maker, taker] = await web3Wrapper.getAvailableAddressesAsync();
    const printUtils = new PrintUtils(web3Wrapper, contractWrappers, { maker, taker }, { WETH: etherTokenAddress });
    printUtils.printAccounts();

    // the amount the maker is selling in maker asset (1 ERC721 Token)
    const makerAssetAmount = new BigNumber(1);
    // the amount the maker is wanting in taker asset
    const takerAssetAmount = new BigNumber(10);
    // Generate a random token id
    const tokenId = generatePseudoRandomSalt();
    // 0x v2 uses asset data to encode the correct proxy type and additional parameters
    const makerAssetData = assetDataUtils.encodeERC721AssetData(dummyERC721TokenContract.address, tokenId);
    const takerAssetData = assetDataUtils.encodeERC20AssetData(etherTokenAddress);
    let txHash;

    // Mint a new ERC721 token for the maker
    const mintTxHash = await dummyERC721TokenContract.mint.sendTransactionAsync(maker, tokenId, { from: maker });
    await printUtils.awaitTransactionMinedSpinnerAsync('Mint ERC721 Token', mintTxHash);

    // Approve the ERC721 Proxy to move the ERC721 tokens for maker
    const makerERC721ApprovalTxHash = await contractWrappers.erc721Token.setProxyApprovalForAllAsync(
        dummyERC721TokenContract.address,
        maker,
        true,
    );
    await printUtils.awaitTransactionMinedSpinnerAsync('Maker ERC721 Approval', makerERC721ApprovalTxHash);

    // Approve the ERC20 Proxy to move WETH for takerAccount
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
        ['Mint ERC721', mintTxHash],
        ['Maker ERC721 Approval', makerERC721ApprovalTxHash],
        ['Taker WETH Approval', takerWETHApprovalTxHash],
        ['Taker WETH Deposit', takerWETHDepositTxHash],
    ]);

    // Set up the Order and fill it
    const randomExpiration = new BigNumber(Date.now() + TEN_MINUTES);
    const exchangeAddress = contractWrappers.exchange.getContractAddress();

    // Create the order
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

    printUtils.printOrder(order);

    // Print out the Balances and Allowances
    await printUtils.fetchAndPrintContractAllowancesAsync();
    await printUtils.fetchAndPrintContractBalancesAsync();
    await printUtils.fetchAndPrintERC721OwnerAsync(dummyERC721TokenContract.address, tokenId);

    // Generate the order hash and sign the order
    const orderHashHex = orderHashUtils.getOrderHashHex(order);
    const signature = await signatureUtils.ecSignOrderHashAsync(
        providerEngine,
        orderHashHex,
        maker,
        SignerType.Default,
    );
    const signedOrder = { ...order, signature };
    // Fill the Order via 0x.js Exchange contract
    txHash = await contractWrappers.exchange.fillOrderAsync(signedOrder, takerAssetAmount, taker, {
        gasLimit: TX_DEFAULTS.gas,
    });
    const txReceipt = await printUtils.awaitTransactionMinedSpinnerAsync('fillOrder', txHash);
    printUtils.printTransaction('fillOrder', txReceipt, [['orderHash', orderHashHex]]);

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
    }
})();
