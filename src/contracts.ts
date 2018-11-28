import { DummyERC721TokenContract } from '@0x/abi-gen-wrappers';
import { getContractAddressesForNetworkOrThrow } from '@0x/contract-addresses';
import { DummyERC721Token } from '@0x/contract-artifacts';

import { NETWORK_CONFIGS } from './configs';
import { GANACHE_NETWORK_ID, KOVAN_NETWORK_ID, RINKEBY_NETWORK_ID, ROPSTEN_NETWORK_ID } from './constants';
import { providerEngine } from './provider_engine';

const ERC721_TOKENS_BY_NETWORK_ID: { [networkId: number]: string[] } = {
    [RINKEBY_NETWORK_ID]: ['0xffce3807ac47060e900ce3fb9cdad3597c25425d'],
    [GANACHE_NETWORK_ID]: ['0x131855dda0aaff096f6854854c55a4debf61077a'],
    [KOVAN_NETWORK_ID]: ['0x84580f1ea9d989c71c13492d5d157712f08795d8'],
    [ROPSTEN_NETWORK_ID]: [],
};

export const dummyERC721TokenContracts: DummyERC721TokenContract[] = [];

for (const tokenAddress of ERC721_TOKENS_BY_NETWORK_ID[NETWORK_CONFIGS.networkId]) {
    dummyERC721TokenContracts.push(
        new DummyERC721TokenContract((DummyERC721Token as any).compilerOutput.abi, tokenAddress, providerEngine),
    );
}

export const contractAddresses = getContractAddressesForNetworkOrThrow(NETWORK_CONFIGS.networkId);
