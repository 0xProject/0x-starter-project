import { BigNumber, ContractWrappers, Order, OrderInfo, OrderStatus, SignedOrder } from '0x.js';
import { Web3Wrapper } from '@0x/web3-wrapper';
import { DecodedLogArgs, LogWithDecodedArgs, TransactionReceiptWithDecodedLogs } from 'ethereum-types';
import * as _ from 'lodash';
import ora = require('ora');

import { DECIMALS, UNLIMITED_ALLOWANCE_IN_BASE_UNITS } from './constants';

// tslint:disable-next-line:no-var-requires
const Table = require('cli-table');

type TableCol = string[] | BigNumber[];
type TableData = string[][] | BigNumber[][];

interface Table {
    push(data: TableCol): void;
    toString(): string;
}
const EMPTY_DATA: TableData = [];
const DEFAULT_EVENTS = ['Fill', 'Transfer', 'CancelUpTo', 'Cancel'];

const erc721IconRaw = [
    '    ____  ',
    '  .X +.    .',
    '.Xx + -.     .',
    'XXx++ -..      ',
    'XXxx++--..    ',
    ` XXXxx+++--  `,
    "  XXXxxx'     ",
    '     ""     ',
];
const erc721Icon = erc721IconRaw.join('\n');

const defaultSchema = {
    style: {
        head: ['green'],
    },
};

const borderlessSchema = {
    ...defaultSchema,
    chars: {
        top: '',
        'top-mid': '',
        'top-left': '',
        'top-right': '',
        bottom: '',
        'bottom-mid': '',
        'bottom-left': '',
        'bottom-right': '',
        left: '',
        'left-mid': '',
        mid: '',
        'mid-mid': '',
        right: '',
        'right-mid': '',
        middle: ' ',
    },
    style: { 'padding-left': 1, 'padding-right': 0, head: ['blue'] },
};

const dataSchema = {
    ...borderlessSchema,
    style: { 'padding-left': 1, 'padding-right': 0, head: ['yellow'] },
};

export class PrintUtils {
    private readonly _contractWrappers: ContractWrappers;
    private readonly _web3Wrapper: Web3Wrapper;
    private readonly _accounts: { [name: string]: string };
    private readonly _tokens: { [name: string]: string };
    public static printScenario(header: string): void {
        const table = new Table({
            ...defaultSchema,
            head: [header],
        });
        PrintUtils.pushAndPrint(table, EMPTY_DATA);
    }
    public static printData(header: string, tableData: TableData): void {
        const table = new Table({
            ...dataSchema,
            head: [header, ''],
        });
        PrintUtils.pushAndPrint(table, tableData);
    }
    public static printHeader(header: string): void {
        const table = new Table({
            ...borderlessSchema,
            style: { 'padding-left': 0, 'padding-right': 0, head: ['blue'] },
            head: [header],
        });
        console.log('');
        PrintUtils.pushAndPrint(table, EMPTY_DATA);
    }
    public static pushAndPrint(table: Table, tableData: TableData): void {
        for (const col of tableData) {
            for (const i in col) {
                if (col[i] === UNLIMITED_ALLOWANCE_IN_BASE_UNITS.toString()) {
                    col[i] = 'MAX_UINT';
                }
            }
            table.push(col);
        }
        console.log(table.toString());
    }
    constructor(
        web3Wrapper: Web3Wrapper,
        contractWrappers: ContractWrappers,
        accounts: { [name: string]: string },
        tokens: { [name: string]: string },
    ) {
        this._contractWrappers = contractWrappers;
        this._web3Wrapper = web3Wrapper;
        this._accounts = accounts;
        this._tokens = tokens;
        this._web3Wrapper.abiDecoder.addABI(contractWrappers.exchange.abi);
        this._web3Wrapper.abiDecoder.addABI(contractWrappers.erc20Token.abi);
        this._web3Wrapper.abiDecoder.addABI(contractWrappers.erc721Token.abi);
    }
    public printAccounts(): void {
        const data: string[][] = [];
        _.forOwn(this._accounts, (address, name) => {
            const accountName = name.charAt(0).toUpperCase() + name.slice(1);
            data.push([accountName, address]);
        });
        PrintUtils.printData('Accounts', data);
    }
    public async fetchAndPrintContractBalancesAsync(): Promise<void> {
        const flattenedBalances = [];
        const flattenedAccounts = Object.keys(this._accounts).map(
            account => account.charAt(0).toUpperCase() + account.slice(1),
        );
        for (const tokenSymbol in this._tokens) {
            const balances = [tokenSymbol];
            const tokenAddress = this._tokens[tokenSymbol];
            for (const account in this._accounts) {
                const address = this._accounts[account];
                const balanceBaseUnits = await this._contractWrappers.erc20Token.getBalanceAsync(tokenAddress, address);
                const balance = Web3Wrapper.toUnitAmount(balanceBaseUnits, DECIMALS);
                balances.push(balance.toString());
            }
            flattenedBalances.push(balances);
        }
        const table = new Table({
            ...dataSchema,
            head: ['Token', ...flattenedAccounts],
        });
        PrintUtils.printHeader('Balances');
        PrintUtils.pushAndPrint(table, flattenedBalances);
    }
    public async fetchAndPrintContractAllowancesAsync(): Promise<void> {
        const erc20ProxyAddress = this._contractWrappers.erc20Proxy.address;
        const flattenedAllowances = [];
        const flattenedAccounts = Object.keys(this._accounts).map(
            account => account.charAt(0).toUpperCase() + account.slice(1),
        );
        for (const tokenSymbol in this._tokens) {
            const allowances = [tokenSymbol];
            const tokenAddress = this._tokens[tokenSymbol];
            for (const account in this._accounts) {
                const address = this._accounts[account];
                const balance = await this._contractWrappers.erc20Token.getAllowanceAsync(
                    tokenAddress,
                    address,
                    erc20ProxyAddress,
                );
                allowances.push(balance.toString());
            }
            flattenedAllowances.push(allowances);
        }
        const table = new Table({
            ...dataSchema,
            head: ['Token', ...flattenedAccounts],
        });
        PrintUtils.printHeader('Allowances');
        PrintUtils.pushAndPrint(table, flattenedAllowances);
    }
    public async awaitTransactionMinedSpinnerAsync(
        message: string,
        txHash: string,
    ): Promise<TransactionReceiptWithDecodedLogs> {
        const spinner = ora(`${message}: ${txHash}`).start();
        if (!spinner.isSpinning) {
            console.log(message, txHash);
        }
        try {
            const receipt = await this._web3Wrapper.awaitTransactionMinedAsync(txHash);
            receipt.status === 1 ? spinner.stop() : spinner.fail(message);
            return receipt;
        } catch (e) {
            spinner.fail(message);
            throw e;
        }
    }
    public printTransaction(
        header: string,
        txReceipt: TransactionReceiptWithDecodedLogs,
        data: string[][] = [],
        eventNames: string[] = DEFAULT_EVENTS,
    ): void {
        PrintUtils.printHeader('Transaction');
        const headerColor = txReceipt.status === 1 ? 'green' : 'red';
        const table = new Table({
            ...defaultSchema,
            head: [header, txReceipt.transactionHash],
            style: { ...defaultSchema.style, head: [headerColor] },
        });
        // HACK gasUsed is actually a hex string sometimes
        // tslint:disable:custom-no-magic-numbers
        const gasUsed = txReceipt.gasUsed.toString().startsWith('0x')
            ? parseInt(txReceipt.gasUsed.toString(), 16).toString()
            : txReceipt.gasUsed;
        // tslint:enable:custom-no-magic-numbers
        const status = txReceipt.status === 1 ? 'Success' : 'Failure';
        const tableData = [...data, ['gasUsed', gasUsed.toString()], ['status', status]];
        PrintUtils.pushAndPrint(table, tableData);

        if (txReceipt.logs.length > 0) {
            PrintUtils.printHeader('Logs');
            for (const log of txReceipt.logs) {
                const decodedLog = this._web3Wrapper.abiDecoder.tryToDecodeLogOrNoop(log);
                // tslint:disable:no-unnecessary-type-assertion
                const event = (log as LogWithDecodedArgs<DecodedLogArgs>).event;
                if (event && eventNames.includes(event)) {
                    // tslint:disable:no-unnecessary-type-assertion
                    const args = (decodedLog as LogWithDecodedArgs<DecodedLogArgs>).args;
                    const logData = [['contract', log.address], ...Object.entries(args)];
                    PrintUtils.printData(`${event}`, logData as any);
                }
            }
        }
    }
    // tslint:disable-next-line:prefer-function-over-method
    public printOrderInfos(orderInfos: { [orderName: string]: OrderInfo }): void {
        const data: string[][] = [];
        _.forOwn(orderInfos, (value, key) => data.push([key, OrderStatus[value.orderStatus]]));
        PrintUtils.printData('Order Info', data);
    }
    // tslint:disable-next-line:prefer-function-over-method
    public printOrder(order: Order | SignedOrder): void {
        PrintUtils.printData('Order', Object.entries(order));
    }
    public async fetchAndPrintERC721OwnerAsync(erc721TokenAddress: string, tokenId: BigNumber): Promise<void> {
        const flattenedBalances = [];
        const flattenedAccounts = Object.keys(this._accounts).map(
            account => account.charAt(0).toUpperCase() + account.slice(1),
        );
        const tokenSymbol = 'ERC721';
        const balances = [tokenSymbol];
        const owner = await this._contractWrappers.erc721Token.getOwnerOfAsync(erc721TokenAddress, tokenId);
        for (const account in this._accounts) {
            const address = this._accounts[account];
            const balance = owner === address ? erc721Icon : '';
            balances.push(balance);
        }
        flattenedBalances.push(balances);
        const table = new Table({
            ...dataSchema,
            head: ['Token', ...flattenedAccounts],
        });
        PrintUtils.printHeader('ERC721 Owner');
        PrintUtils.pushAndPrint(table, flattenedBalances);
    }
}
