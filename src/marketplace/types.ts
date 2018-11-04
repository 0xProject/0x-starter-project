import { TransactionReceiptStatus } from 'ethereum-types';

export interface BlockchainTransaction {
    txHash: string;
    status: TransactionReceiptStatus | undefined;
}
