import { Dimensions, PixelRatio } from 'react-native';

const BASE_WIDTH = 375;
const BASE_HEIGHT = 812;

const round = (size: number) => PixelRatio.roundToNearestPixel(size);
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export const wp = (percentage: number) => {
  const { width } = Dimensions.get('window');
  return round((width * percentage) / 100);
};

export const hp = (percentage: number) => {
  const { height } = Dimensions.get('window');
  return round((height * percentage) / 100);
};

export const scaleFont = (size: number) => {
  const { width, height } = Dimensions.get('window');
  const shortestSide = Math.min(width, height);
  const longestSide = Math.max(width, height);
  const widthScale = shortestSide / BASE_WIDTH;
  const heightScale = longestSide / BASE_HEIGHT;
  const scale = clamp((widthScale + heightScale) / 2, 0.88, 1.28);

  return round(size * scale);
};

