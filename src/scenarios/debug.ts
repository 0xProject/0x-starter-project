import { ContractWrappers } from '0x.js';
import { Web3Wrapper } from '@0xproject/web3-wrapper';

import { NETWORK_CONFIGS } from '../configs';
import { providerEngine } from '../contracts';
import { PrintUtils } from '../print_utils';

void (async () => {
    const contractWrappers = new ContractWrappers(providerEngine, { networkId: NETWORK_CONFIGS.networkId });
    const web3Wrapper = new Web3Wrapper(providerEngine);
    const [maker, taker] = await web3Wrapper.getAvailableAddressesAsync();
    const zrxTokenAddress = contractWrappers.exchange.getZRXTokenAddress();
    const etherTokenAddress = contractWrappers.etherToken.getContractAddressIfExists();
    if (!etherTokenAddress) {
        throw new Error('Ether Token not found on this network');
    }
    const printUtils = new PrintUtils(
        web3Wrapper,
        contractWrappers,
        { maker, taker },
        { WETH: etherTokenAddress, ZRX: zrxTokenAddress },
    );
    printUtils.printAccounts();
    await printUtils.fetchAndPrintContractBalancesAsync();

    console.log('');
    const exchangeAddress = contractWrappers.exchange.getContractAddress();

    const erc20ProxyId = await contractWrappers.erc20Proxy.getProxyIdAsync();
    const erc721ProxyId = await contractWrappers.erc721Proxy.getProxyIdAsync();
    const erc20AssetProxyResult = await contractWrappers.exchange.getAssetProxyBySignatureAsync(erc20ProxyId);
    const erc721AssetProxyResult = await contractWrappers.exchange.getAssetProxyBySignatureAsync(erc721ProxyId);
    PrintUtils.printData('Exchange', [
        ['address', exchangeAddress],
        ['erc20Proxy', erc20AssetProxyResult],
        ['erc721Proxy', erc721AssetProxyResult],
    ]);

    const erc20ProxyAuthorisedAddresses = await contractWrappers.erc20Proxy.getAuthorizedAddressesAsync();
    const erc20ProxyAddress = contractWrappers.erc20Proxy.getContractAddress();
    const erc721ProxyAddress = contractWrappers.erc721Proxy.getContractAddress();
    const erc721ProxyAuthorisedAddresses = await contractWrappers.erc721Proxy.getAuthorizedAddressesAsync();
    PrintUtils.printData('ERC20 Proxy', [
        ['address', erc20ProxyAddress],
        ['authorised', erc20ProxyAuthorisedAddresses.join(',')],
    ]);
    PrintUtils.printData('ERC721 Proxy', [
        ['address', erc721ProxyAddress],
        ['authorised', erc721ProxyAuthorisedAddresses.join(',')],
    ]);

    providerEngine.stop();
})();
