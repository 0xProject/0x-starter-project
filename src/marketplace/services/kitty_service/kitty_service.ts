import { DummyERC721TokenContract } from '@0x/abi-gen-wrappers';
import { ContractWrappers } from '@0x/contract-wrappers';
import { assetDataUtils, generatePseudoRandomSalt, orderHashUtils, signatureUtils } from '@0x/order-utils';
import { Order, SignedOrder } from '@0x/types';
import { BigNumber } from '@0x/utils';
import { Web3Wrapper } from '@0x/web3-wrapper';
import { Provider } from 'ethereum-types';
import * as _ from 'lodash';

import { NETWORK_CONFIGS, TX_DEFAULTS } from '../../../configs';
import { NULL_ADDRESS, ZERO } from '../../../constants';
import { dummyERC721TokenContracts, getContractWrappersConfig } from '../../../contracts';
import { providerEngine } from '../../../provider_engine';

import { getKittyBackground, getKittyGen, getKittyImage } from './kitty_data';

const tenMinutes = 10 * 60 * 1000;
const WETH_DECIMALS = 18;
const KITTIES_PER_REQUEST = 8;

export interface KittyService {
    getKittyDatasAsync: () => Promise<KittyData[]>;
}

export interface KittyData {
    background: string;
    image: string;
    price: string;
    gen: string;
    id: string;
    order: SignedOrder;
    orderHash: string;
}

class TestKittyService implements KittyService {
    private readonly _ownerProvider: Provider;
    private readonly _contractWrappers: ContractWrappers;
    private readonly _web3Wrapper: Web3Wrapper;
    private readonly _erc721TokenContract: DummyERC721TokenContract;
    constructor() {
        this._ownerProvider = providerEngine;
        const contractWrappersConfig = getContractWrappersConfig(NETWORK_CONFIGS.networkId);
        this._contractWrappers = new ContractWrappers(this._ownerProvider, contractWrappersConfig);
        this._web3Wrapper = new Web3Wrapper(this._ownerProvider);
        this._erc721TokenContract = dummyERC721TokenContracts[0];
    }
    public async getKittyDatasAsync(): Promise<KittyData[]> {
        await this._setKittyMakerApprovalIfRequiredAsync();
        const result = [] as KittyData[];
        for (const _index in _.range(0, KITTIES_PER_REQUEST)) {
            const kittyData = await this._mintKittyAsync();
            result.push(kittyData);
        }
        return result;
    }
    private _getERC721TokenContractAddress(): string {
        return this._erc721TokenContract.address;
    }
    private async _createKittyOrderAsync(tokenId: BigNumber): Promise<SignedOrder> {
        const ownerAddress = await this._getOwnerAddressAsync();
        const randomExpiration = new BigNumber(Date.now() + tenMinutes);
        // ERC721 tokens are always single, they are non-divisable
        const makerAssetAmount = new BigNumber(1);
        const price = (Math.round((Math.random() * 0.05 + 0.01) * 100) / 100).toString();
        // Set the cost in ETH for the ERC721 token
        const takerAssetAmount = Web3Wrapper.toBaseUnitAmount(new BigNumber(price), WETH_DECIMALS);
        // Encode in the order the ERC721 address and token id
        const tokenAddress = this._getERC721TokenContractAddress();
        const makerAssetData = assetDataUtils.encodeERC721AssetData(tokenAddress, tokenId);
        // Encode in the order the ERC20 (WETH) address
        const etherTokenAddress = this._contractWrappers.forwarder.etherTokenAddress;
        const takerAssetData = assetDataUtils.encodeERC20AssetData(etherTokenAddress);
        // Create the order
        const exchangeAddress = this._contractWrappers.exchange.address;
        const order: Order = {
            exchangeAddress,
            makerAddress: ownerAddress,
            takerAddress: NULL_ADDRESS, // This allows for ANY address to be the taker
            senderAddress: NULL_ADDRESS,
            feeRecipientAddress: NULL_ADDRESS, // No Fee Recipients on this order
            expirationTimeSeconds: randomExpiration,
            salt: generatePseudoRandomSalt(),
            makerAssetAmount,
            takerAssetAmount,
            makerAssetData,
            takerAssetData,
            makerFee: ZERO, // No fees on this order
            takerFee: ZERO,
        };
        // The maker signs this order hash as a proof
        const signedOrder = await signatureUtils.ecSignOrderAsync(this._ownerProvider, order, ownerAddress);
        return signedOrder;
    }
    private async _mintKittyAsync(): Promise<KittyData> {
        const id = new BigNumber(Math.floor(Math.random() * 9999999) + 1);
        // Mint this new kitty via the ERC721 token contract. This must be minted by owner
        const ownerAddress = await this._getOwnerAddressAsync();
        await this._erc721TokenContract.mint.sendTransactionAsync(ownerAddress, id, {
            ...TX_DEFAULTS,
            from: ownerAddress,
        });
        const order = await this._createKittyOrderAsync(new BigNumber(id));
        // Price of the Kitty is represented in WEI (18 Decimals)
        const price = Web3Wrapper.toUnitAmount(order.takerAssetAmount, WETH_DECIMALS).toString();
        const orderHash = orderHashUtils.getOrderHashHex(order);
        return {
            background: getKittyBackground(id),
            image: getKittyImage(id),
            gen: getKittyGen(id).toString(),
            id: id.toString(),
            price,
            order,
            orderHash,
        };
    }
    /**
     * The owner of the token must set the approval to the 0x Exchange Proxy to enable exchange.
     */
    private async _setKittyMakerApprovalIfRequiredAsync(): Promise<string | undefined> {
        const tokenAddress = this._getERC721TokenContractAddress();
        const ownerAddress = await this._getOwnerAddressAsync();
        const isApproved = await this._contractWrappers.erc721Token.isProxyApprovedForAllAsync(
            tokenAddress,
            ownerAddress,
        );
        if (!isApproved) {
            const txHash = await this._contractWrappers.erc721Token.setProxyApprovalForAllAsync(
                tokenAddress,
                ownerAddress,
                true,
            );
            return txHash;
        }
        return undefined;
    }
    private async _getOwnerAddressAsync(): Promise<string> {
        const availableAddresses = await this._web3Wrapper.getAvailableAddressesAsync();
        if (!_.isEmpty(availableAddresses)) {
            return availableAddresses[0];
        } else {
            throw new Error('No addresses available');
        }
    }
}

export const testKittyService = new TestKittyService();
