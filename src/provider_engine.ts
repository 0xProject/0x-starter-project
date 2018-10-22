import { RPCSubprovider, Web3ProviderEngine } from '0x.js';
import { MnemonicWalletSubprovider } from '@0x/subproviders';

import { BASE_DERIVATION_PATH, MNEMONIC, NETWORK_CONFIGS } from './configs';

export const mnemonicWallet = new MnemonicWalletSubprovider({
    mnemonic: MNEMONIC,
    baseDerivationPath: BASE_DERIVATION_PATH,
});

export const pe = new Web3ProviderEngine();
pe.addProvider(mnemonicWallet);
pe.addProvider(new RPCSubprovider(NETWORK_CONFIGS.rpcUrl));
pe.start();

export const providerEngine = pe;
