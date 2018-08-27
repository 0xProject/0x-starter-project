import { BigNumber } from '0x.js';

// tslint:disable-next-line:custom-no-magic-numbers
export const ONE_MINUTE = 60 * 1000;
// tslint:disable-next-line:custom-no-magic-numbers
export const TEN_MINUTES = ONE_MINUTE * 10;
// tslint:disable-next-line:custom-no-magic-numbers
export const UNLIMITED_ALLOWANCE_IN_BASE_UNITS = new BigNumber(2).pow(256).minus(1);
export const GANACHE_NETWORK_ID = 50;
export const GANACHE_RPC = 'http://127.0.0.1:8545';
export const GANACHE_TX_DEFAULTS = { gas: 400000 };
export const KOVAN_NETWORK_ID = 42;
export const KOVAN_RPC = 'https://kovan.infura.io/';
export const KOVAN_TX_DEFAULTS = { gas: 400000 };
export const MNEMONIC = 'concert load couple harbor equip island argue ramp clarify fence smart topic';
export const BASE_DERIVATION_PATH = `44'/60'/0'/0`;
export const NULL_ADDRESS = '0x0000000000000000000000000000000000000000';
export const ZERO = new BigNumber(0);
// Ganache
export const RPC_URL = GANACHE_RPC;
export const NETWORK_ID: number = GANACHE_NETWORK_ID;
export const TX_DEFAULTS = GANACHE_TX_DEFAULTS;
// Kovan
// export const RPC_URL = KOVAN_RPC;
// export const NETWORK_ID: number = KOVAN_NETWORK_ID;
// export const TX_DEFAULTS = KOVAN_TX_DEFAULTS;
