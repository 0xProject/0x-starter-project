import { BigNumber } from '@0x/utils';
const kittyImages = [
    'https://storage.googleapis.com/ck-kitty-image/0x06012c8cf97bead5deae237070f9587f8e7a266d/839521.svg',
    'https://storage.googleapis.com/ck-kitty-image/0x06012c8cf97bead5deae237070f9587f8e7a266d/1827.png',
    'https://storage.googleapis.com/ck-kitty-image/0x06012c8cf97bead5deae237070f9587f8e7a266d/150.png',
    'https://storage.googleapis.com/ck-kitty-image/0x06012c8cf97bead5deae237070f9587f8e7a266d/110.png',
    'https://storage.googleapis.com/ck-kitty-image/0x06012c8cf97bead5deae237070f9587f8e7a266d/110.png',
    'https://storage.googleapis.com/ck-kitty-image/0x06012c8cf97bead5deae237070f9587f8e7a266d/534581.png',
    'https://storage.googleapis.com/ck-kitty-image/0x06012c8cf97bead5deae237070f9587f8e7a266d/336947.png',
    'https://storage.googleapis.com/ck-kitty-image/0x06012c8cf97bead5deae237070f9587f8e7a266d/627729.png',
    'https://storage.googleapis.com/ck-kitty-image/0x06012c8cf97bead5deae237070f9587f8e7a266d/627639.png',
    'https://storage.googleapis.com/ck-kitty-image/0x06012c8cf97bead5deae237070f9587f8e7a266d/546748.png',
    'https://storage.googleapis.com/ck-kitty-image/0x06012c8cf97bead5deae237070f9587f8e7a266d/470434.png',
    'https://storage.googleapis.com/ck-kitty-image/0x06012c8cf97bead5deae237070f9587f8e7a266d/823619.png',
    'https://storage.googleapis.com/ck-kitty-image/0x06012c8cf97bead5deae237070f9587f8e7a266d/703886.png',
    'https://storage.googleapis.com/ck-kitty-image/0x06012c8cf97bead5deae237070f9587f8e7a266d/616604.png',
];
const kittyBackgrounds = ['#d1eeeb', '#dfdffa', '#ffe0e5', '#cdf5d4'];
export const getKittyBackground = (id: BigNumber) => {
    return kittyBackgrounds[id.modulo(kittyBackgrounds.length).toNumber()];
};
export const getKittyImage = (id: BigNumber) => {
    return kittyImages[id.modulo(kittyImages.length).toNumber()];
};
export const getKittyGen = (id: BigNumber) => {
    return id.modulo(10);
};
