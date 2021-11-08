import { providerEngine } from '../provider_engine';

import { scenarioAsync as fillERC20LimitOrder } from './fill_erc20_limit_order';

void (async () => {
    try {
        await fillERC20LimitOrder();
    } catch (e) {
        console.log(e);
        providerEngine.stop();
        process.exit(1);
    }
})();
