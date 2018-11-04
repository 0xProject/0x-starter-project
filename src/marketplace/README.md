# 0x Marketplace

A simple marketplace selling ERC721 Tokens for ETH.

<img width="1412" alt="0x Marketplace" src="https://user-images.githubusercontent.com/27389/43031912-cf2b5da6-8cee-11e8-82c0-47557ca01d21.png">

## Architecture

This assumes the 0x dev environment. We have a Ganache snapshot with deployed 0x contracts and a few ERC20 and ERC721 tokens. The owner of these contracts is the
account in the 0x dev mnemonic.

Orders are generated from the dev mnemonic and any minting operation is performed via the Dev mnenonic account.

The user is able to buy from the marketplace using Metamask.

## Run the Marketplace

```
yarn install
yarn run build
```

In one terminal download and run the Ganache snapshot

```
yarn run download_snapshot
yarn run ganache-cli
```

In another terminal run the marketplace

```
yarn run marketplace
```
