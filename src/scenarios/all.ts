import { providerEngine } from '../contracts';

import { scenario as cancelOrdersUpTo } from './cancel_orders_up_to';
import { scenario as executeTransaction } from './execute_transaction';
import { scenario as fillOrder } from './fill_order';
import { scenario as fillOrderERC721 } from './fill_order_erc721';
import { scenario as fillOrderFees } from './fill_order_fees';
import { scenario as forwarder_buy_erc20_tokens } from './forwarder_buy_erc20_tokens';
import { scenario as forwarder_buy_erc721_tokens } from './forwarder_buy_erc721_tokens';
import { scenario as matchOrders } from './match_orders';

void (async () => {
    try {
        await fillOrder();
        await fillOrderFees();
        await fillOrderERC721();
        await matchOrders();
        await executeTransaction();
        await cancelOrdersUpTo();
        await forwarder_buy_erc20_tokens();
        await forwarder_buy_erc721_tokens();
    } catch (e) {
        console.log(e);
        providerEngine.stop();
    }
})();
