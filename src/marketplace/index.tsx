import { ContractWrappers, ContractWrappersConfig } from '@0x/contract-wrappers';
import { Web3Wrapper } from '@0x/web3-wrapper';
import { Container } from 'bloomer';
import { Provider } from 'ethereum-types';
import * as _ from 'lodash';
import * as React from 'react';
import * as ReactDOM from 'react-dom';

import { NETWORK_CONFIGS } from '../configs';
import { GANACHE_CONTRACT_ADDRESSES } from '../contracts';

import { Marketplace } from './components/Marketplace';
import { Nav } from './components/Nav';
import { Web3Error } from './components/Web3Error';
import { KittyData, KittyService, testKittyService } from './services/kitty_service';
import { BlockchainTransaction } from './types';
import { getInjectedProviderIfExists } from './utils/injected_provider';

const DEFAULT_POLLING_INTERVAL = 5000;

interface AppProps {
    provider: Provider;
    kittyService: KittyService;
}

interface AppState {
    kittyDatas: KittyData[];
    transactions: BlockchainTransaction[];
}

class App extends React.Component<AppProps, AppState> {
    private readonly _contractWrappers: ContractWrappers;
    private readonly _web3Wrapper: Web3Wrapper;
    constructor(props: AppProps) {
        super(props);
        const { provider } = props;
        const contractWrappersConfig: ContractWrappersConfig = {
            networkId: NETWORK_CONFIGS.networkId,
            contractAddresses: GANACHE_CONTRACT_ADDRESSES,
        };
        this._contractWrappers = new ContractWrappers(provider, contractWrappersConfig);
        this._web3Wrapper = new Web3Wrapper(provider);
        this.state = {
            kittyDatas: [],
            transactions: [],
        };
    }
    public componentDidMount(): void {
        this._initializeAsync();
        this._checkOrderStatusIntervalAsync();
    }
    public render(): React.ReactNode {
        return (
            <div>
                <Nav transactions={this.state.transactions} />
                <Container>
                    <Marketplace kittyDatas={this.state.kittyDatas} onBuyKitty={this._onBuyKitty} />
                </Container>
            </div>
        );
    }
    /**
     * Fetch kitty data from some async kitty source. This information includes orders and metadata
     */
    private readonly _initializeAsync = async (): Promise<void> => {
        const { kittyService } = this.props;
        const kittyDatas = await kittyService.getKittyDatasAsync();
        this.setState({
            kittyDatas,
        });
    };
    /**
     * Here we buy the kitty via the forwarding contract.
     */
    private readonly _onBuyKitty = async (kitty: KittyData): Promise<void> => {
        // Taker is the first address in the available addresses
        const [takerAddress] = await this._web3Wrapper.getAvailableAddressesAsync();
        // Grab the order from the input data
        const order = kitty.order;
        // Submit the order via the forwarder contract
        // Allowing the taker to buy the ERC721 token with ETH
        const txHash = await this._contractWrappers.forwarder.marketBuyOrdersWithEthAsync(
            [order], // The forwarding contract supports an array of orders, we use one here
            order.makerAssetAmount,
            takerAddress,
            order.takerAssetAmount,
            [],
            undefined,
            undefined,
            {
                gasLimit: 400000,
            },
        );
        const transaction = { txHash, status: undefined };
        this._onTransactionSubmittedAsync(transaction);
    };
    /**
     * Periodically check all of the kitty data, removing any kitties which are no longer FILLABLE.
     * This could due to a fill, cancel or order expiry
     */
    private readonly _checkOrderStatusIntervalAsync = async (): Promise<void> => {
        setInterval(async () => {
            const { kittyDatas } = this.state;
            for (const kittyData of kittyDatas) {
                // Request the state of the order from the Exchange contract
                const orderInfo = await this._contractWrappers.exchange.getOrderInfoAsync(kittyData.order);
                // Order Status 3 is FILLABLE, there are other states such as FILLED, CANCELLED, EXPIRED
                if (orderInfo.orderStatus !== 3) {
                    // This order is no longer FILLABLE, remove it from the Marketplace listing
                    const remainingKitties = kittyDatas.filter(k => k !== kittyData);
                    this.setState(prevState => {
                        return { ...prevState, kittyDatas: [...remainingKitties] };
                    });
                }
            }
        }, DEFAULT_POLLING_INTERVAL);
    };
    /**
     * Handle new transactions made from the client
     */
    private readonly _onTransactionSubmittedAsync = async (tx: BlockchainTransaction) => {
        const { transactions } = this.state;
        // Add the pending transaction to the transactions list
        this.setState(prevState => {
            return { ...prevState, transactions: [tx, ...prevState.transactions] };
        });
        // Await the transaction being mined
        const txReceipt = await this._web3Wrapper.awaitTransactionMinedAsync(tx.txHash);
        tx.status = txReceipt.status;
        const remainingTx = transactions.filter(t => t.txHash !== tx.txHash);
        // Update the transaction list with the status of the mined transaction
        this.setState(prevState => {
            return { ...prevState, transactions: [tx, ...remainingTx] };
        });
    };
}

// main
const main = document.getElementById('js-main');
if (main) {
    const provider = getInjectedProviderIfExists();
    if (!_.isUndefined(provider)) {
        ReactDOM.render(React.createElement(App, { provider, kittyService: testKittyService }), main);
    } else {
        ReactDOM.render(React.createElement(Web3Error), main);
    }
}
