import { runMigrationsOnceAsync } from '@0x/migrations';
import { BigNumber } from '@0x/utils';
import { Web3Wrapper } from '@0x/web3-wrapper';

import { GANACHE_CONFIGS, NETWORK_CONFIGS } from './configs';
import { ONE_SECOND_MS, TEN_MINUTES_MS } from './constants';
import { PrintUtils } from './print_utils';
import { providerEngine } from './provider_engine';

/**
 * Returns an amount of seconds that is greater than the amount of seconds since epoch.
 */
export const getRandomFutureDateInSeconds = (): BigNumber => {
    return new BigNumber(Date.now() + TEN_MINUTES_MS).div(ONE_SECOND_MS).integerValue(BigNumber.ROUND_CEIL);
};

export const runMigrationsOnceIfRequiredAsync = async (): Promise<void> => {
    if (NETWORK_CONFIGS === GANACHE_CONFIGS) {
        PrintUtils.printScenario('Deploying Contracts');
        const web3Wrapper = new Web3Wrapper(providerEngine);
        const [owner] = await web3Wrapper.getAvailableAddressesAsync();
        await runMigrationsOnceAsync(providerEngine, { from: owner });
    }
};
