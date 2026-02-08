/**
 * Card component for mobile app
 */

import React from 'react';
import {
  View,
  StyleSheet,
  ViewStyle,
  TouchableOpacity,
  TouchableOpacityProps,
} from 'react-native';
import { useTheme } from '../../providers/ThemeProvider';
import { SPACING, RADIUS } from '../../constants';

interface AppCardProps extends Omit<TouchableOpacityProps, 'style'> {
  children: React.ReactNode;
  variant?: 'default' | 'outlined' | 'elevated';
  padding?: 'none' | 'sm' | 'md' | 'lg';
  style?: ViewStyle;
  onPress?: () => void;
}

export function AppCard({
  children,
  variant = 'default',
  padding = 'md',
  style,
  onPress,
  ...rest
}: AppCardProps) {
  const { colors, isDark } = useTheme();

  const getBackgroundColor = (): string => {
    switch (variant) {
      case 'outlined':
        return 'transparent';
      case 'elevated':
        return isDark ? colors.backgroundSecondary : colors.background;
      default:
        return colors.backgroundSecondary;
    }
  };

  const getBorderColor = (): string => {
    switch (variant) {
      case 'outlined':
        return colors.border;
      default:
        return 'transparent';
    }
  };

  const getPadding = (): number => {
    switch (padding) {
      case 'none':
        return 0;
      case 'sm':
        return SPACING.sm;
      case 'lg':
        return SPACING.lg;
      default:
        return SPACING.md;
    }
  };

  const cardStyle: ViewStyle = {
    backgroundColor: getBackgroundColor(),
    borderColor: getBorderColor(),
    borderWidth: variant === 'outlined' ? 1 : 0,
    padding: getPadding(),
    ...(variant === 'elevated' && {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0.3 : 0.1,
      shadowRadius: 4,
      elevation: 3,
    }),
  };

  if (onPress) {
    return (
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.7}
        style={[styles.card, cardStyle, style]}
        {...rest}
      >
        {children}
      </TouchableOpacity>
    );
  }

  return (
    <View style={[styles.card, cardStyle, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: RADIUS.lg,
  },
});

export default AppCard;
