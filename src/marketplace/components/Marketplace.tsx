import { Column, Columns, Container } from 'bloomer';
import * as React from 'react';

import { KittyData } from '../services/kitty_service';

import { KittyItem } from './KittyItem';

export interface MarketplaceProps {
    kittyDatas: KittyData[];
    onBuyKitty: (kitty: KittyData) => void;
}
export const Marketplace: React.StatelessComponent<MarketplaceProps> = props => {
    const grid = listToGrid(props.kittyDatas, 4);
    return (
        <Container>
            {grid.map(kitties => {
                const kittiesRender = kitties.map(kitty => {
                    return (
                        <Column key={kitty.id} isSize="1/4">
                            <KittyItem {...kitty} onBuyKitty={getBuyKittyHandler(kitty, props)} />
                        </Column>
                    );
                });
                return <Columns key={kitties.map(kitty => kitty.id).toString()}>{kittiesRender}</Columns>;
            })}
        </Container>
    );
};

const getBuyKittyHandler = (kitty: KittyData, props: MarketplaceProps) => {
    const result = () => props.onBuyKitty(kitty);
    return result;
};

const listToGrid = (list: KittyData[], elementsPerSubArray: number) => {
    const grid = [] as KittyData[][];
    let k = -1;
    for (let i = 0; i < list.length; i++) {
        if (i % elementsPerSubArray === 0) {
            k++;
            grid[k] = [];
        }
        grid[k].push(list[i]);
    }
    return grid;
};
