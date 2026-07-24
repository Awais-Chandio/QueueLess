import {
  Linking,
  Platform,
} from 'react-native';

const googleMapsWebUrl = (latitude: number, longitude: number) =>
  `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;

export const openMapNavigation = async (
  latitude: number,
  longitude: number,
) => {
  const nativeUrl =
    Platform.OS === 'ios'
      ? `http://maps.apple.com/?daddr=${latitude},${longitude}&dirflg=d`
      : `google.navigation:q=${latitude},${longitude}&mode=d`;

  try {
    await Linking.openURL(nativeUrl);
  } catch {
    await Linking.openURL(googleMapsWebUrl(latitude, longitude));
  }
};

