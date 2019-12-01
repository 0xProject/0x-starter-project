import { DummyERC721TokenContract } from '@0x/abi-gen-wrappers';

import { GANACHE_CONFIGS, KOVAN_CONFIGS, NETWORK_CONFIGS, RINKEBY_CONFIGS } from './configs';
import { ROPSTEN_NETWORK_ID } from './constants';
import { providerEngine } from './provider_engine';

const ERC721_TOKENS_BY_CHAIN_ID: { [chainId: number]: string[] } = {
    [RINKEBY_CONFIGS.chainId]: ['0xffce3807ac47060e900ce3fb9cdad3597c25425d'],
    [GANACHE_CONFIGS.chainId]: ['0x07f96aa816c1f244cbc6ef114bb2b023ba54a2eb'],
    [KOVAN_CONFIGS.chainId]: ['0x84580f1ea9d989c71c13492d5d157712f08795d8'],
    [ROPSTEN_NETWORK_ID]: [],
};

export const dummyERC721TokenContracts: DummyERC721TokenContract[] = [];

for (const tokenAddress of ERC721_TOKENS_BY_CHAIN_ID[NETWORK_CONFIGS.chainId]) {
    dummyERC721TokenContracts.push(new DummyERC721TokenContract(tokenAddress, providerEngine));
}
