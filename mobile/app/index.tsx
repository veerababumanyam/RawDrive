/**
 * Initial loading screen / splash screen
 * Redirects to auth or main app based on authentication state
 */

import React, { useEffect } from 'react';
import { View, StyleSheet, ActivityIndicator, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '../src/providers/ThemeProvider';
import { TYPOGRAPHY } from '../src/constants';

export default function IndexScreen() {
  const { colors } = useTheme();
  const router = useRouter();

  // The AuthContext handles the actual routing logic
  // This screen just shows a loading state while auth is being determined

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.logoPlaceholder, { backgroundColor: colors.primary }]}>
        <Text style={styles.logoText}>R</Text>
      </View>
      <Text style={[styles.appName, { color: colors.textPrimary }]}>RawDrive</Text>
      <ActivityIndicator
        size="large"
        color={colors.primary}
        style={styles.loader}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  logoText: {
    fontSize: 36,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  appName: {
    fontSize: TYPOGRAPHY.fontSize['2xl'],
    fontWeight: TYPOGRAPHY.fontWeight.bold,
    marginBottom: 32,
  },
  loader: {
    marginTop: 16,
  },
});
