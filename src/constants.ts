import { BigNumber } from '0x.js';

// tslint:disable-next-line:custom-no-magic-numbers
export const ONE_MINUTE_MS = 60 * 1000;
// tslint:disable-next-line:custom-no-magic-numbers
export const TEN_MINUTES_MS = ONE_MINUTE_MS * 10;
// tslint:disable-next-line:custom-no-magic-numbers
export const UNLIMITED_ALLOWANCE_IN_BASE_UNITS = new BigNumber(2).pow(256).minus(1);
export const NULL_ADDRESS = '0x0000000000000000000000000000000000000000';
export const ZERO = new BigNumber(0);
export const GANACHE_NETWORK_ID = 50;
export const KOVAN_NETWORK_ID = 42;
