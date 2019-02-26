<img src="https://github.com/0xProject/branding/blob/master/0x%20Logo/PNG/0x-Logo-Black.png" width="150px" >

# 0x Starter Project

[![CircleCI](https://circleci.com/gh/0xProject/0x-starter-project.svg?style=svg)](https://circleci.com/gh/0xProject/0x-starter-project)

![cli](https://user-images.githubusercontent.com/27389/42074402-6dcc5ccc-7baf-11e8-84f1-9a27f1a96b08.png)

This project will take you through a number of scenarios using the 0x v2 protocol.
The previous v1 starter project has been moved to the ['v1' branch](https://github.com/0xProject/0x-starter-project/tree/v1).

## Scenarios

This repository contains a bunch of scenarios that you can run from the command-line:

-   Fill order (ERC20)
-   Fill order Fees
-   Fill order (ERC721)
-   Fill order (Multiple assets)
-   Cancel orders up to
-   Match orders
-   Execute transaction
-   Forwarder buy orders (ERC20)
-   Forwarder buy orders (ERC721)
-   Standard Relayer API fill order example
-   Dutch Auction (decreasing price auction)

## Getting Started

By default this project uses the 0x development mnemonic running against Ganache. This project can be configured to use a different mnenonic and also run against Kovan testnet.

You may choose to update the mnemonic in `src/configs.ts` or use the one provided (note if many people use this mnemonic on Kovan then the funds may be drained). When changing the mnemonic ensure that the account has available funds (ETH and ZRX) on the respective network. You can request ZRX and ETH from the 0x Faucet located in [0x Portal](https://0xproject.com/portal/account).

Install dependencies:

```
yarn install
```

Build this package:

```
yarn build
```

Download the Ganache snapshot and load it on to a Ganache node:

```
yarn download_snapshot
yarn ganache-cli
```

Run a scenario in another terminal:

```
yarn scenario:fill_order_erc20
```

To run all scenarios:

```
yarn scenario:all
```

All the scenarios commands can be found in the `package.json`'s `scripts` section and begin with `scenario:`.

### Switching to Kovan

To switch between Kovan/ganache, change the last line in `src/configs.ts` and re-build. Ganache is enabled by default.

For Ganache:

```
export const NETWORK_CONFIGS = GANACHE_CONFIGS;
```

For Kovan:

```
export const NETWORK_CONFIGS = KOVAN_CONFIGS;
```

### Fill Order SRA Example

To run the Fill Order SRA Example you must first start up a server in another terminal:

```
yarn fake_sra_server
```

Then in another terminal run:

```
yarn scenario:fill_order_sra
```

### Windows Development Setup

If you're setting up Node.js for the first time on Windows, you may find the following [StackOverflow guide](https://stackoverflow.com/questions/15126050/running-python-on-windows-for-node-js-dependencies/39648550#39648550) useful. There are a few build tools required for Node.js on Windows which are not installed by default (such as Python). Please follow that guide before running through the tutorials.
