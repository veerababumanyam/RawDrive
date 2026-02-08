/**
 * Primary button component for mobile app
 */

import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
  TouchableOpacityProps,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../providers/ThemeProvider';
import { SPACING, RADIUS, TYPOGRAPHY } from '../../constants';

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

interface AppButtonProps extends Omit<TouchableOpacityProps, 'style'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  style?: ViewStyle;
  textStyle?: TextStyle;
  children: React.ReactNode;
}

export function AppButton({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  fullWidth = false,
  leftIcon,
  rightIcon,
  style,
  textStyle,
  children,
  onPress,
  ...rest
}: AppButtonProps) {
  const { colors, isDark } = useTheme();

  const handlePress = (e: any) => {
    if (disabled || loading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress?.(e);
  };

  const getBackgroundColor = (): string => {
    if (disabled) return colors.border;
    switch (variant) {
      case 'primary':
        return colors.primary;
      case 'secondary':
        return colors.backgroundSecondary;
      case 'outline':
      case 'ghost':
        return 'transparent';
      case 'danger':
        return colors.error;
      default:
        return colors.primary;
    }
  };

  const getTextColor = (): string => {
    if (disabled) return colors.textMuted;
    switch (variant) {
      case 'primary':
        return colors.primaryForeground;
      case 'secondary':
        return colors.textPrimary;
      case 'outline':
        return colors.textPrimary;
      case 'ghost':
        return colors.textSecondary;
      case 'danger':
        return '#FFFFFF';
      default:
        return colors.primaryForeground;
    }
  };

  const getBorderColor = (): string => {
    if (variant === 'outline') {
      return disabled ? colors.border : colors.textSecondary;
    }
    return 'transparent';
  };

  const getPadding = (): { paddingVertical: number; paddingHorizontal: number } => {
    switch (size) {
      case 'sm':
        return { paddingVertical: SPACING.sm, paddingHorizontal: SPACING.md };
      case 'lg':
        return { paddingVertical: SPACING.md, paddingHorizontal: SPACING.xl };
      default:
        return { paddingVertical: SPACING.sm + 4, paddingHorizontal: SPACING.lg };
    }
  };

  const getFontSize = (): number => {
    switch (size) {
      case 'sm':
        return TYPOGRAPHY.fontSize.sm;
      case 'lg':
        return TYPOGRAPHY.fontSize.lg;
      default:
        return TYPOGRAPHY.fontSize.base;
    }
  };

  const padding = getPadding();

  return (
    <TouchableOpacity
      onPress={handlePress}
      disabled={disabled || loading}
      activeOpacity={0.7}
      style={[
        styles.button,
        {
          backgroundColor: getBackgroundColor(),
          borderColor: getBorderColor(),
          ...padding,
        },
        fullWidth && styles.fullWidth,
        style,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={getTextColor()} size="small" />
      ) : (
        <>
          {leftIcon}
          <Text
            style={[
              styles.text,
              {
                color: getTextColor(),
                fontSize: getFontSize(),
                marginLeft: leftIcon ? SPACING.sm : 0,
                marginRight: rightIcon ? SPACING.sm : 0,
              },
              textStyle,
            ]}
          >
            {children}
          </Text>
          {rightIcon}
        </>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  fullWidth: {
    width: '100%',
  },
  text: {
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
  },
});

export default AppButton;
