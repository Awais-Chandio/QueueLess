import { Dimensions, PixelRatio, Platform } from 'react-native';

const BASE_WIDTH = 375;
const BASE_HEIGHT = 812;
const TABLET_MIN_WIDTH = 768;

const round = (size: number) => PixelRatio.roundToNearestPixel(size);
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export const isIOS = Platform.OS === 'ios';
export const isAndroid = Platform.OS === 'android';

export const isTablet = () => {
  const { width, height } = Dimensions.get('window');
  return Math.min(width, height) >= TABLET_MIN_WIDTH;
};

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
  const tabletScale = isTablet() ? 1.08 : 1;
  const scale = clamp(((widthScale + heightScale) / 2) * tabletScale, 0.88, 1.28);

  return round(size * scale);
};

