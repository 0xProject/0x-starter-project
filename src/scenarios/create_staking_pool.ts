import { ERC20TokenContract, StakingContract } from '@0x/abi-gen-wrappers';
import { ContractWrappers } from '@0x/contract-wrappers';
import { BigNumber } from '@0x/utils';
import { Web3Wrapper } from '@0x/web3-wrapper';

import { NETWORK_CONFIGS } from '../configs';
import { UNLIMITED_ALLOWANCE_IN_BASE_UNITS } from '../constants';
import { contractAddresses } from '../contracts';
import { PrintUtils } from '../print_utils';
import { providerEngine } from '../provider_engine';
import { runMigrationsOnceIfRequiredAsync } from '../utils';

enum StakeStatus {
    Undelegated,
    Delegated,
}
const NIL_POOL_ID = '0x0000000000000000000000000000000000000000000000000000000000000000';

/**
 * In this scenario, the maker creates a staking pool and joins it with
 * multiple addresses.
 */
export async function scenarioAsync(): Promise<void> {
    await runMigrationsOnceIfRequiredAsync();
    let txHash;
    PrintUtils.printScenario('Create Staking Pool');
    // account information, balances, general contract logs
    const web3Wrapper = new Web3Wrapper(providerEngine);
    const [maker, otherMaker] = await web3Wrapper.getAvailableAddressesAsync();
    const zrxTokenAddress = contractAddresses.zrxToken;
    const contractWrappers = new ContractWrappers(providerEngine, { chainId: NETWORK_CONFIGS.chainId });
    const printUtils = new PrintUtils(web3Wrapper, contractWrappers, { maker }, { ZRX: zrxTokenAddress });

    // Staking Proxy is a delegate contract. We initialize a Staking Contract (ABI) pointing to the delegate proxy
    // at stakingProxyContractAddress
    const stakingContract = new StakingContract(contractAddresses.stakingProxy, providerEngine, { from: maker });

    // A small share is kept for the operator, note 1,000,000 represents all rebates
    // going to the operator
    const operatorSharePpm = new BigNumber(900000); // 90 %
    const stakingPoolReceipt = await stakingContract.createStakingPool.awaitTransactionSuccessAsync(
        operatorSharePpm,
        true,
        {
            from: maker,
        },
    );
    const createStakingPoolLog = stakingPoolReceipt.logs[0];
    const poolId = (createStakingPoolLog as any).args.poolId;
    await printUtils.awaitTransactionMinedSpinnerAsync(`Create Pool ${poolId}`, stakingPoolReceipt.transactionHash);

    // Approve the ZRX token for Staking using the ERC20Proxy
    const zrxTokenContract = new ERC20TokenContract(zrxTokenAddress, providerEngine, { from: maker });
    await zrxTokenContract.approve.awaitTransactionSuccessAsync(
        contractAddresses.erc20Proxy,
        UNLIMITED_ALLOWANCE_IN_BASE_UNITS,
    );

    // Stake 1000 ZRX
    const stakeAmount = Web3Wrapper.toBaseUnitAmount(new BigNumber(100), 18);
    // Transfer the ZRX to the Staking Contract
    txHash = await stakingContract.stake.sendTransactionAsync(stakeAmount, { from: maker });
    await printUtils.awaitTransactionMinedSpinnerAsync('Stake ZRX', txHash);
    // Move the staked ZRX to delegate the Staking Pool
    txHash = await stakingContract.moveStake.sendTransactionAsync(
        { status: StakeStatus.Undelegated, poolId: NIL_POOL_ID },
        { status: StakeStatus.Delegated, poolId },
        stakeAmount,
        { from: maker },
    );
    await printUtils.awaitTransactionMinedSpinnerAsync('Move Stake To Pool', txHash);

    // Join the Pool with another maker address
    // This is useful if you wish to Market Make from different addresses
    txHash = await stakingContract.joinStakingPoolAsMaker.sendTransactionAsync(poolId, { from: otherMaker });
    await printUtils.awaitTransactionMinedSpinnerAsync('Other Maker Joins Pool', txHash);

    // Decreases the Share of rebates for the Operator to 80%
    // This will give more rebate share to third party stakers and less to the operator
    txHash = await stakingContract.decreaseStakingPoolOperatorShare.sendTransactionAsync(poolId, new BigNumber(80000), {
        from: maker,
    });
    await printUtils.awaitTransactionMinedSpinnerAsync('Decrease Operator Share', txHash);

    // At the end of the Epoch, finalize the pool to withdraw operator rewards
    txHash = await stakingContract.finalizePool.sendTransactionAsync(poolId, { from: maker });
    await printUtils.awaitTransactionMinedSpinnerAsync(`Finalize Pool ${poolId}`, txHash);

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
