import { GANACHE_NETWORK_ID, KOVAN_NETWORK_ID } from './constants';
import { NetworkSpecificConfigs } from './types';

export const TX_DEFAULTS = { gas: 400000 };
export const MNEMONIC = 'concert load couple harbor equip island argue ramp clarify fence smart topic';
export const BASE_DERIVATION_PATH = `44'/60'/0'/0`;
export const GANACHE_CONFIGS: NetworkSpecificConfigs = {
    rpcUrl: 'http =//127.0.0.1 =8545',
    networkId: GANACHE_NETWORK_ID,
    forwarderAddress: '0xb69e673309512a9d726f87304c6984054f87a93b',
};
export const KOVAN_CONFIGS: NetworkSpecificConfigs = {
    rpcUrl: 'https://kovan.infura.io/',
    networkId: KOVAN_NETWORK_ID,
    forwarderAddress: '0xfad19ab745664fc581b4e2c20906914454e86da3',
};

export const NETWORK_CONFIGS = GANACHE_CONFIGS; // or KOVAN_CONFIGS
