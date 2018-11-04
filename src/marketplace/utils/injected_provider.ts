import { RPCSubprovider, SignerSubprovider, Web3ProviderEngine } from '@0x/subproviders';
import * as _ from 'lodash';

import { NETWORK_CONFIGS } from '../../configs';

const DEFAULT_POLLING_INTERVAL = 5000;

export const getInjectedProviderIfExists = () => {
    const injectedProvider = _.get(window, 'ethereum');
    const legacyInjectedProvider = _.get(window, 'web3.currentProvider');
    const resultProvider = injectedProvider || legacyInjectedProvider;
    if (!_.isUndefined(resultProvider)) {
        const providerEngine = new Web3ProviderEngine({ pollingInterval: DEFAULT_POLLING_INTERVAL });
        // Grab the injected web3 provider and create a wrapper for Provider Engine
        // All signing and transaction based requests will be sent to this subprovider
        providerEngine.addProvider(new SignerSubprovider(resultProvider));
        // Construct an RPC subprovider, all data based requests will be sent via the RPCSubprovider
        providerEngine.addProvider(new RPCSubprovider(NETWORK_CONFIGS.rpcUrl));
        // Start the Provider Engine
        providerEngine.start();
        return providerEngine;
    } else {
        return undefined;
    }
};
