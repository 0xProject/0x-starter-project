import { providerEngine } from '../provider_engine';

import { scenarioAsync as cancelOrdersUpTo } from './cancel_orders_up_to';
import { scenarioAsync as executeTransaction } from './execute_transaction';
import { scenarioAsync as executeTransactionCancelOrder } from './execute_transaction_cancel_order';
import { scenarioAsync as fillOrderERC20 } from './fill_order_erc20';
import { scenarioAsync as fillOrderERC721 } from './fill_order_erc721';
import { scenarioAsync as fillOrderFees } from './fill_order_fees';
import { scenarioAsync as forwarder_buy_erc20_tokens } from './forwarder_buy_erc20_tokens';
import { scenarioAsync as forwarder_buy_erc721_tokens } from './forwarder_buy_erc721_tokens';
import { scenarioAsync as matchOrders } from './match_orders';

void (async () => {
    try {
        await fillOrderERC20();
        await fillOrderFees();
        await fillOrderERC721();
        await matchOrders();
        await executeTransaction();
        await executeTransactionCancelOrder();
        await cancelOrdersUpTo();
        await forwarder_buy_erc20_tokens();
        await forwarder_buy_erc721_tokens();
    } catch (e) {
        console.log(e);
        providerEngine.stop();
        process.exit(1);
    }
})();
