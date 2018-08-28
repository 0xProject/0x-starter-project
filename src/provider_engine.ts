import { RPCSubprovider, Web3ProviderEngine } from '0x.js';
import { MnemonicWalletSubprovider } from '@0xproject/subproviders';

import { BASE_DERIVATION_PATH, MNEMONIC, NETWORK_CONFIGS } from './configs';

export const mnemonicWallet = new MnemonicWalletSubprovider({
    mnemonic: MNEMONIC,
    baseDerivationPath: BASE_DERIVATION_PATH,
});

export const providerEng = new Web3ProviderEngine();
providerEng.addProvider(mnemonicWallet);
providerEng.addProvider(new RPCSubprovider(NETWORK_CONFIGS.rpcUrl));
providerEng.start();

export const providerEngine = providerEng;
