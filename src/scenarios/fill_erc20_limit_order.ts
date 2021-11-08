import { ContractWrappers, ERC20TokenContract } from '@0x/contract-wrappers';
import { LimitOrder, OrderStatus, SignatureType } from '@0x/protocol-utils';
import { BigNumber, hexUtils } from '@0x/utils';
import { Web3Wrapper } from '@0x/web3-wrapper';

import { NETWORK_CONFIGS, TX_DEFAULTS } from '../configs';
import { DECIMALS, NULL_ADDRESS, UNLIMITED_ALLOWANCE_IN_BASE_UNITS, ZERO } from '../constants';
import { PrintUtils } from '../print_utils';
import { providerEngine } from '../provider_engine';
import { calculateProtocolFee, getRandomFutureDateInSeconds, runMigrationsOnceIfRequiredAsync } from '../utils';

/**
 * In this scenario, the maker creates and signs an order for selling ZRX for WETH.
 * The taker takes this order and fills it via the 0x Exchange contract.
 */
export async function scenarioAsync(): Promise<void> {
    await runMigrationsOnceIfRequiredAsync();
    PrintUtils.printScenario('Fill ERC20 Limit Order');
    // Initialize the ContractWrappers, this provides helper functions around calling
    // 0x contracts as well as ERC20/ERC721 token contracts on the blockchain
    const contractWrappers = new ContractWrappers(providerEngine, { chainId: NETWORK_CONFIGS.chainId });
    // Initialize the Web3Wrapper, this provides helper functions around fetching
    // account information, balances, general contract logs
    const web3Wrapper = new Web3Wrapper(providerEngine);
    const [maker, taker] = await web3Wrapper.getAvailableAddressesAsync();
    const zrxTokenAddress = contractWrappers.contractAddresses.zrxToken;
    const etherTokenAddress = contractWrappers.contractAddresses.etherToken;
    const printUtils = new PrintUtils(
        web3Wrapper,
        contractWrappers,
        { maker, taker },
        { WETH: etherTokenAddress, ZRX: zrxTokenAddress },
    );
    printUtils.printAccounts();

    // the amount the maker is selling of maker asset
    const makerAssetAmount = Web3Wrapper.toBaseUnitAmount(new BigNumber(5), DECIMALS);
    // the amount the maker wants of taker asset
    const takerAssetAmount = Web3Wrapper.toBaseUnitAmount(new BigNumber(0.1), DECIMALS);
    let txHash;
    let txReceipt;

    // Allow the 0x ERC20 Proxy to move ZRX on behalf of makerAccount
    const erc20Token = new ERC20TokenContract(zrxTokenAddress, providerEngine);
    const makerZRXApprovalTxHash = await erc20Token
        .approve(contractWrappers.contractAddresses.exchangeProxy, UNLIMITED_ALLOWANCE_IN_BASE_UNITS)
        .sendTransactionAsync({ from: maker });
    await printUtils.awaitTransactionMinedSpinnerAsync('Maker ZRX Approval', makerZRXApprovalTxHash);

    // Allow the 0x ERC20 Proxy to move WETH on behalf of takerAccount
    const etherToken = contractWrappers.weth9;
    const takerWETHApprovalTxHash = await etherToken
        .approve(contractWrappers.contractAddresses.exchangeProxy, UNLIMITED_ALLOWANCE_IN_BASE_UNITS)
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
        ['Taker WETH Approval', takerWETHApprovalTxHash],
        ['Taker WETH Deposit', takerWETHDepositTxHash],
    ]);

    // Set up the Order and fill it
    const randomExpiration = getRandomFutureDateInSeconds();
    const pool = hexUtils.leftPad(1);

    // Create the order
    const limitOrder: LimitOrder = new LimitOrder({
        // TODO: fix chain ID--ganache contract appears to be using chain ID 1
        // to hash the order
        // chainId: NETWORK_CONFIGS.chainId,
        chainId: 1,
        verifyingContract: contractWrappers.contractAddresses.exchangeProxy,
        maker,
        taker,
        makerToken: zrxTokenAddress,
        takerToken: etherTokenAddress,
        makerAmount: makerAssetAmount,
        takerAmount: takerAssetAmount,
        takerTokenFeeAmount: ZERO,
        sender: NULL_ADDRESS,
        feeRecipient: NULL_ADDRESS,
        expiry: randomExpiration,
        pool,
        salt: new BigNumber(Date.now()),
    });

    // TODO: print order

    // Print out the Balances and Allowances
    await printUtils.fetchAndPrintContractAllowancesAsync();
    await printUtils.fetchAndPrintContractBalancesAsync();

    // Generate the order hash and sign it
    const signature = await limitOrder.getSignatureWithProviderAsync(web3Wrapper.getProvider(), SignatureType.EIP712, maker);

    const [
        { orderHash, status },
        remainingFillableAmount,
        isValidSignature,
    ] = await contractWrappers.exchangeProxy.getLimitOrderRelevantState(limitOrder, signature).callAsync();
    if (status === OrderStatus.Fillable && remainingFillableAmount.isGreaterThan(0) && isValidSignature) {
        // Order is fillable
    }

    // Fill the Order via 0x Exchange Proxy contract
    txHash = await contractWrappers.exchangeProxy
        .fillLimitOrder(limitOrder, signature, takerAssetAmount)
        .sendTransactionAsync({
            from: taker,
            ...TX_DEFAULTS,
            value: calculateProtocolFee(1),
        });
    txReceipt = await printUtils.awaitTransactionMinedSpinnerAsync('fillLimitOrder', txHash);
    printUtils.printTransaction('fillLimitOrder', txReceipt, [['orderHash', orderHash]]);

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
