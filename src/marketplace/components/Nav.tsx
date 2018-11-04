import {
    Button,
    Icon,
    Image,
    Navbar,
    NavbarBrand,
    NavbarDropdown,
    NavbarEnd,
    NavbarItem,
    NavbarLink,
    NavbarMenu,
} from 'bloomer';
import * as React from 'react';

import { BlockchainTransaction } from '../types';

export interface NavProps {
    transactions: BlockchainTransaction[];
}

export interface NavState {
    isActive: boolean;
}

export class Nav extends React.Component<NavProps, NavState> {
    constructor(props: NavProps) {
        super(props);
        this.state = { isActive: false };
    }
    public render(): React.ReactNode {
        const { transactions } = this.props;
        let isLoading = false;
        if (transactions) {
            isLoading = transactions.some(tx => tx.status === undefined);
        }
        const transactionsButton = isLoading ? (
            <Button isLoading={isLoading} isColor="white" />
        ) : (
            <Button isColor="white">
                <Icon style={{ paddingTop: '5px' }} className="fa fa-info-circle" />
            </Button>
        );

        const transactionsListRender = (
            <NavbarDropdown className="is-right">
                {transactions.map(tx => {
                    const isTxPending = tx.status === undefined;
                    const transactionRender = isTxPending ? (
                        <NavbarItem key={tx.txHash} href="#/">
                            <Button isLoading={isLoading} isColor="white" /> {tx.txHash}
                        </NavbarItem>
                    ) : (
                        <NavbarItem key={tx.txHash} href="#/">
                            {tx.txHash}
                        </NavbarItem>
                    );
                    return transactionRender;
                })}
            </NavbarDropdown>
        );
        const transactionsMenu = (
            <NavbarItem hasDropdown={true} isHoverable={true}>
                <NavbarLink href="#">{transactionsButton}</NavbarLink>
                {transactionsListRender}
            </NavbarItem>
        );
        return (
            <Navbar style={{ margin: '0', marginBottom: '20px', marginTop: '20px' }}>
                <NavbarBrand>
                    <NavbarItem>
                        <img src="https://raw.githubusercontent.com/0xProject/branding/master/0x_Black_CMYK.png" />
                    </NavbarItem>
                </NavbarBrand>
                <NavbarMenu isActive={this.state.isActive}>
                    <NavbarEnd>{transactionsMenu}</NavbarEnd>
                </NavbarMenu>
            </Navbar>
        );
    }
}
