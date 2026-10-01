import React, { useEffect, useMemo, useState } from 'react';
import {
  Image,
  ImageResizeMode,
  ImageStyle,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { Hospital } from 'lucide-react-native';
import { useTheme } from '../../hooks/useTheme';

const DEFAULT_CLINIC_IMAGE_URL =
  'https://images.unsplash.com/photo-1586773860418-d37222d8fce3?auto=format&fit=crop&q=85&w=1200';

// These records previously pointed at dead official-site URLs. Keeping the
// corrected real photos in the client also fixes persisted/offline query data
// immediately, before a database migration has refreshed the cached rows.
const VERIFIED_CLINIC_IMAGE_URLS: Record<string, string> = {
  '521f1349-05c4-4417-9fa5-5289963af7db':
    'https://www.thenews.com.pk/assets/uploads/akhbar/2024-05-27/1193657_3628890_kfj_akhbar.jpg',
  'd2c1a3df-bb89-4fde-b73d-5bb9ec763481':
    'https://a.storyblok.com/f/286308248262721/1750937/d1ad698925/52f28790-7e5e-4edc-b5fa-13a0292fabbc.jpg',
};

type ClinicImageProps = {
  centerId?: string | null;
  imageUrl?: string | null;
  style?: StyleProp<ImageStyle | ViewStyle>;
  resizeMode?: ImageResizeMode;
  iconSize?: number;
};

const ClinicImage = ({
  centerId,
  imageUrl,
  style,
  resizeMode = 'cover',
  iconSize = 36,
}: ClinicImageProps) => {
  const { colors } = useTheme();
  const preferredUrl = useMemo(
    () =>
      (centerId ? VERIFIED_CLINIC_IMAGE_URLS[centerId] : undefined) ||
      imageUrl?.trim() ||
      DEFAULT_CLINIC_IMAGE_URL,
    [centerId, imageUrl],
  );
  const [activeUrl, setActiveUrl] = useState(preferredUrl);
  const [fallbackFailed, setFallbackFailed] = useState(false);

  useEffect(() => {
    setActiveUrl(preferredUrl);
    setFallbackFailed(false);
  }, [preferredUrl]);

  if (fallbackFailed) {
    return (
      <View
        style={[
          styles.placeholder,
          { backgroundColor: colors.primary + '10' },
          style,
        ]}
      >
        <Hospital size={iconSize} color={colors.primary} />
      </View>
    );
  }

  return (
    <Image
      source={{ uri: activeUrl, cache: 'force-cache' }}
      style={style as StyleProp<ImageStyle>}
      resizeMode={resizeMode}
      resizeMethod="resize"
      fadeDuration={120}
      onError={() => {
        if (activeUrl !== DEFAULT_CLINIC_IMAGE_URL) {
          setActiveUrl(DEFAULT_CLINIC_IMAGE_URL);
          return;
        }

        setFallbackFailed(true);
      }}
    />
  );
};

const styles = StyleSheet.create({
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default React.memo(ClinicImage);
