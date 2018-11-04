import {
    Button,
    Card,
    CardContent,
    CardFooter,
    CardFooterItem,
    CardHeader,
    CardHeaderTitle,
    CardImage,
    Image,
    Media,
    MediaContent,
    Subtitle,
    TextArea,
    Title,
} from 'bloomer';
import * as React from 'react';

import { KittyData } from '../services/kitty_service';

export interface KittyItemProps extends KittyData {
    onBuyKitty: () => void;
}

export class KittyItem extends React.Component<KittyItemProps, {}> {
    constructor(props: KittyItemProps) {
        super(props);
        this.state = { showDetails: false };
    }
    public render(): React.ReactNode {
        return (
            <Card>
                <CardImage style={{ backgroundColor: this.props.background }}>
                    <Image src={this.props.image} />
                </CardImage>
                <CardContent>
                    <Media>
                        <MediaContent>
                            <Title isSize={6}>Kitty {this.props.id}</Title>
                            <Subtitle isSize={6}>
                                Gen {this.props.gen} - Plodding -{' '}
                                <a href="#" onClick={this._printDetails}>
                                    {' '}
                                    Details{' '}
                                </a>
                            </Subtitle>
                        </MediaContent>
                    </Media>
                </CardContent>
                <CardFooter>
                    <CardFooterItem>
                        <Button
                            isFullWidth={false}
                            isOutlined={false}
                            isColor="#0FB900"
                            onClick={this.props.onBuyKitty}
                        >
                            Buy for {this.props.price} ETH
                        </Button>
                    </CardFooterItem>
                </CardFooter>
            </Card>
        );
    }
    private readonly _printDetails = () => {
        console.log(JSON.stringify(this.props.order, null, 4));
    };
}
