import { artifacts } from './artifacts';
import { GANACHE_CONFIGS, NETWORK_CONFIGS } from './configs';
import { DummyERC20TokenContract } from './generated_contract_wrappers/dummy_erc20_token';
import { DummyERC721TokenContract } from './generated_contract_wrappers/dummy_erc721_token';
import { providerEngine } from './provider_engine';

// These are only deployed on Ganache
export const dummyERC20TokenContracts: DummyERC20TokenContract[] = [];
export const dummyERC721TokenContracts: DummyERC721TokenContract[] = [];
const GANACHE_ERC20_TOKENS = [
    '0x6dfff22588be9b3ef8cf0ad6dc9b84796f9fb45f',
    '0xcfc18cec799fbd1793b5c43e773c98d4d61cc2db',
    '0xf22469f31527adc53284441bae1665a7b9214dba',
    '0x10add991de718a69dec2117cb6aa28098836511b',
    '0x8d61158a366019ac78db4149d75fff9dda51160d',
];
const GANACHE_ERC721_TOKENS = ['0x131855dda0aaff096f6854854c55a4debf61077a'];
if (NETWORK_CONFIGS.networkId === GANACHE_CONFIGS.networkId) {
    for (const tokenAddress of GANACHE_ERC20_TOKENS) {
        dummyERC20TokenContracts.push(
            new DummyERC20TokenContract(artifacts.DummyERC20Token.compilerOutput.abi, tokenAddress, providerEngine),
        );
    }
    for (const tokenAddress of GANACHE_ERC721_TOKENS) {
        dummyERC721TokenContracts.push(
            new DummyERC721TokenContract(artifacts.DummyERC721Token.compilerOutput.abi, tokenAddress, providerEngine),
        );
    }
}
