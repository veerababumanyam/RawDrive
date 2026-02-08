/**
 * Login screen
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Image,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTheme } from '../../src/providers/ThemeProvider';
import { useAuth } from '../../src/contexts/AuthContext';
import { AppButton, AppInput } from '../../src/components/ui';
import { SPACING, TYPOGRAPHY, RADIUS } from '../../src/constants';
import { getBiometricName } from '../../src/services/biometricAuth';

export default function LoginScreen() {
  const { colors, isDark } = useTheme();
  const { login, loginWithBiometrics, biometricStatus, isLoading } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Attempt biometric login on mount if available
  useEffect(() => {
    if (biometricStatus?.isEnabled && biometricStatus?.isEnrolled) {
      handleBiometricLogin();
    }
  }, [biometricStatus]);

  const handleBiometricLogin = async () => {
    setError('');
    const result = await loginWithBiometrics();
    if (!result.success && result.error !== 'Authentication cancelled') {
      setError(result.error || 'Biometric login failed');
    }
  };

  const handleLogin = async () => {
    if (!email.trim()) {
      setError('Please enter your email');
      return;
    }
    if (!password.trim()) {
      setError('Please enter your password');
      return;
    }

    setError('');
    setIsSubmitting(true);

    try {
      const result = await login({
        email: email.trim(),
        password,
        rememberMe,
      });

      if (!result.success) {
        setError(result.error || 'Login failed');
      }
    } catch (err) {
      setError('An unexpected error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  const biometricType = biometricStatus?.biometricTypes[0];
  const biometricName = biometricType ? getBiometricName(biometricType) : 'Biometric';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Logo */}
          <View style={styles.logoContainer}>
            <View style={[styles.logoPlaceholder, { backgroundColor: colors.primary }]}>
              <Text style={styles.logoText}>R</Text>
            </View>
            <Text style={[styles.appName, { color: colors.textPrimary }]}>
              RawDrive
            </Text>
            <Text style={[styles.tagline, { color: colors.textSecondary }]}>
              Professional Photography Platform
            </Text>
          </View>

          {/* Login Form */}
          <View style={styles.formContainer}>
            {error ? (
              <View style={[styles.errorContainer, { backgroundColor: colors.error + '15' }]}>
                <Ionicons name="alert-circle" size={20} color={colors.error} />
                <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
              </View>
            ) : null}

            <AppInput
              label="Email"
              placeholder="Enter your email"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              leftIcon="mail-outline"
              value={email}
              onChangeText={setEmail}
              editable={!isSubmitting}
            />

            <AppInput
              label="Password"
              placeholder="Enter your password"
              secureTextEntry
              autoCapitalize="none"
              autoComplete="password"
              leftIcon="lock-closed-outline"
              value={password}
              onChangeText={setPassword}
              editable={!isSubmitting}
            />

            {/* Remember Me */}
            <TouchableOpacity
              style={styles.rememberMe}
              onPress={() => setRememberMe(!rememberMe)}
              disabled={isSubmitting}
            >
              <View
                style={[
                  styles.checkbox,
                  {
                    backgroundColor: rememberMe ? colors.primary : 'transparent',
                    borderColor: rememberMe ? colors.primary : colors.border,
                  },
                ]}
              >
                {rememberMe && (
                  <Ionicons name="checkmark" size={14} color={colors.primaryForeground} />
                )}
              </View>
              <Text style={[styles.rememberMeText, { color: colors.textSecondary }]}>
                Remember me
              </Text>
            </TouchableOpacity>

            {/* Login Button */}
            <AppButton
              onPress={handleLogin}
              loading={isSubmitting}
              disabled={isLoading}
              fullWidth
              style={styles.loginButton}
            >
              Sign In
            </AppButton>

            {/* Biometric Login */}
            {biometricStatus?.isAvailable && biometricStatus?.isEnrolled && (
              <TouchableOpacity
                style={styles.biometricButton}
                onPress={handleBiometricLogin}
                disabled={isSubmitting || isLoading}
              >
                <Ionicons
                  name={biometricType === 'facial' ? 'scan' : 'finger-print'}
                  size={24}
                  color={colors.textSecondary}
                />
                <Text style={[styles.biometricText, { color: colors.textSecondary }]}>
                  Sign in with {biometricName}
                </Text>
              </TouchableOpacity>
            )}

            {/* Forgot Password */}
            <TouchableOpacity style={styles.forgotPassword}>
              <Text style={[styles.forgotPasswordText, { color: colors.accent }]}>
                Forgot password?
              </Text>
            </TouchableOpacity>
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={[styles.footerText, { color: colors.textMuted }]}>
              Don't have an account?{' '}
            </Text>
            <TouchableOpacity>
              <Text style={[styles.signupLink, { color: colors.accent }]}>
                Sign up on web
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.xl,
  },
  logoContainer: {
    alignItems: 'center',
    marginTop: SPACING.xl,
    marginBottom: SPACING['2xl'],
  },
  logoPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: RADIUS.xl,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.md,
  },
  logoText: {
    fontSize: 36,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  appName: {
    fontSize: TYPOGRAPHY.fontSize['2xl'],
    fontWeight: TYPOGRAPHY.fontWeight.bold,
    marginBottom: SPACING.xs,
  },
  tagline: {
    fontSize: TYPOGRAPHY.fontSize.base,
  },
  formContainer: {
    flex: 1,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    marginBottom: SPACING.md,
  },
  errorText: {
    flex: 1,
    marginLeft: SPACING.sm,
    fontSize: TYPOGRAPHY.fontSize.sm,
  },
  rememberMe: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: RADIUS.sm,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.sm,
  },
  rememberMeText: {
    fontSize: TYPOGRAPHY.fontSize.sm,
  },
  loginButton: {
    marginBottom: SPACING.md,
  },
  biometricButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  biometricText: {
    marginLeft: SPACING.sm,
    fontSize: TYPOGRAPHY.fontSize.base,
  },
  forgotPassword: {
    alignItems: 'center',
    padding: SPACING.sm,
  },
  forgotPasswordText: {
    fontSize: TYPOGRAPHY.fontSize.sm,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: SPACING.lg,
  },
  footerText: {
    fontSize: TYPOGRAPHY.fontSize.sm,
  },
  signupLink: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    fontWeight: TYPOGRAPHY.fontWeight.medium,
  },
});
