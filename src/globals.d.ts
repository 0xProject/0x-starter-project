declare module 'chai-bignumber';
declare module 'dirty-chai';
declare module 'web3-provider-engine/subproviders/hooked-wallet';
declare module 'web3-provider-engine/subproviders/rpc';

// HACK: In order to merge the bignumber declaration added by chai-bignumber to the chai Assertion
// interface we must use `namespace` as the Chai definitelyTyped definition does. Since we otherwise
// disallow `namespace`, we disable tslint for the following.
/* tslint:disable */
declare namespace Chai {
    interface Assertion {
        bignumber: Assertion;
        // HACK: In order to comply with chai-as-promised we make eventually a `PromisedAssertion` not an `Assertion`
        eventually: PromisedAssertion;
    }
}
/* tslint:enable */

// Ethereumjs-tx declarations
declare module 'ethereumjs-tx' {
    class EthereumTx {
        public raw: Buffer[];
        public r: Buffer;
        public s: Buffer;
        public v: Buffer;
        public serialize(): Buffer;
        public sign(buffer: Buffer): void;
        constructor(txParams: any);
    }
    export = EthereumTx;
}

/* tslint:disable */
declare module 'web3-provider-engine' {
    class Web3ProviderEngine {
        public on(event: string, handler: () => void): void;
        public send(payload: any): void;
        public sendAsync(payload: any, callback: (error: any, response: any) => void): void;
        public addProvider(provider: any): void;
        public start(): void;
        public stop(): void;
    }
    export = Web3ProviderEngine;
}
/* tslint:enable */