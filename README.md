<img src="https://github.com/0xProject/branding/blob/master/0x_Black_CMYK.png" width="200px" >

# 0x Starter Project

![cli](https://user-images.githubusercontent.com/27389/42074402-6dcc5ccc-7baf-11e8-84f1-9a27f1a96b08.png)

This project will take you through a number of scenarios using the 0x v2 protocol.
The previous v1 starter project has been moved to a branch [located here](https://github.com/0xProject/0x-starter-project/tree/v1).

## Scenarios

-   Fill Order (ERC20)
-   Fill Order Fees
-   Fill Order (ERC721)
-   Cancel Orders Up To
-   Match Orders
-   Execute Transaction
-   Forwarder Buy Orders (ERC20)
-   Forwarder Buy Orders (ERC721)
-   Standard Relayer Api Example with Fill Order

## Getting Started

By default this project uses the 0x development mnemonic running against Ganache. This project can be configured to use a different mnenonic and also run
against Kovan testnet.

You may choose to update the mnemonic in `src/constants.ts` or use the one provided (note if many people use this mnemonic on Kovan then the funds may be drained). When changing the mnemonic ensure that the account has available funds (ETH and ZRX) on the respective network. You can request ZRX and ETH from the 0x Faucet located in the [0x Portal](https://0xproject.com/portal/account).

Install dependencies:

```
yarn install
```

Build this package:

```
yarn run build
```

Download and start the ganache instance:

```
yarn run download_snapshot
yarn run ganache-cli
```

Run this example in another terminal:

```
yarn run scenario:fill_order
```

To run all scenarios:

```
yarn run scenario:all
```

### Switching to Kovan

To switch between Kovan/ganache uncomment the appropriate lines in `src/constants.ts` and re-build. Ganache is enabled by default.

For Ganache:

```
// Ganache
export const RPC_URL = GANACHE_RPC;
export const NETWORK_ID = GANACHE_NETWORK_ID;
export const TX_DEFAULTS = GANACHE_TX_DEFAULTS;
```

For Kovan:

```
// Kovan
export const RPC_URL = KOVAN_RPC;
export const NETWORK_ID = KOVAN_NETWORK_ID;
export const TX_DEFAULTS = KOVAN_TX_DEFAULTS;
```

### Fill Order SRA Example

To run the Fill Order SRA Example you must first start up a server in another terminal:

```
yarn run sra
```

Then in another terminal run:

```
yarn run fill_order_sra
```

### Windows Development Setup

If you're setting up Node.js for the first time on Windows, you may find the following [StackOverflow guide](https://stackoverflow.com/questions/15126050/running-python-on-windows-for-node-js-dependencies/39648550#39648550) useful. There are a few build tools required for Node.js on Windows which are not installed by default (such as Python). Please follow that guide before running through the tutorials.
