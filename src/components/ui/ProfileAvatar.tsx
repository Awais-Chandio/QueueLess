import React from "react";
import { Image, StyleSheet, View } from "react-native";
import { User } from "lucide-react-native";
import { useTheme } from "../../hooks/useTheme";
import { scaleFont } from "../../utils/responsive";

type ProfileAvatarProps = {
  uri?: string | null;
  size?: number;
  iconSize?: number;
};

const ProfileAvatar = ({ uri, size = 48, iconSize }: ProfileAvatarProps) => {
  const { colors } = useTheme();
  const dimension = scaleFont(size);
  const radius = dimension / 2;

  return (
    <View
      style={[
        styles.container,
        {
          width: dimension,
          height: dimension,
          borderRadius: radius,
          backgroundColor: colors.surface,
          borderColor: colors.border,
        },
      ]}
    >
      {uri ? (
        <Image
          source={{ uri }}
          style={{ width: dimension, height: dimension, borderRadius: radius }}
          resizeMode="cover"
        />
      ) : (
        <User size={scaleFont(iconSize ?? size / 2)} color={colors.textSecondary} />
      )}
    </View>
  );
};

export default ProfileAvatar;

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    borderWidth: 1,
    justifyContent: "center",
    overflow: "hidden",
  },
});
