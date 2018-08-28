import { BigNumber } from '0x.js';

// tslint:disable-next-line:custom-no-magic-numbers
export const ONE_MINUTE = 60 * 1000;
// tslint:disable-next-line:custom-no-magic-numbers
export const TEN_MINUTES = ONE_MINUTE * 10;
// tslint:disable-next-line:custom-no-magic-numbers
export const UNLIMITED_ALLOWANCE_IN_BASE_UNITS = new BigNumber(2).pow(256).minus(1);
export const TX_DEFAULTS = { gas: 400000 };
export const MNEMONIC = 'concert load couple harbor equip island argue ramp clarify fence smart topic';
export const BASE_DERIVATION_PATH = `44'/60'/0'/0`;
export const NULL_ADDRESS = '0x0000000000000000000000000000000000000000';
export const ZERO = new BigNumber(0);

export const GANACHE_NETWORK_ID = 50;
const GANACHE_RPC = 'http://127.0.0.1:8545';
const GANACHE_FORWARDER_ADDRESS = '0xb69e673309512a9d726f87304c6984054f87a93b';

const KOVAN_NETWORK_ID = 42;
const KOVAN_RPC = 'https://kovan.infura.io/';
const KOVAN_FORWARDER_ADDRESS = '0xfad19ab745664fc581b4e2c20906914454e86da3';

// Ganache
export const RPC_URL = GANACHE_RPC;
export const NETWORK_ID: number = GANACHE_NETWORK_ID;
export const FORWARDER_ADDRESS = GANACHE_FORWARDER_ADDRESS;
// Kovan
// export const RPC_URL = KOVAN_RPC;
// export const NETWORK_ID: number = KOVAN_NETWORK_ID;
// export const FORWARDER_ADDRESS = KOVAN_FORWARDER_ADDRESS;
