/**
 * Settings screen
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTheme } from '../../src/providers/ThemeProvider';
import { useAuth } from '../../src/contexts/AuthContext';
import { useWorkspace } from '../../src/contexts/WorkspaceContext';
import { AppCard } from '../../src/components/ui';
import { SPACING, TYPOGRAPHY, RADIUS } from '../../src/constants';
import { enableBiometricAuth, disableBiometricAuth, getBiometricName } from '../../src/services/biometricAuth';

interface SettingItemProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  onPress?: () => void;
  showArrow?: boolean;
  isSwitch?: boolean;
  switchValue?: boolean;
  onSwitchChange?: (value: boolean) => void;
  danger?: boolean;
}

function SettingItem({
  icon,
  label,
  value,
  onPress,
  showArrow = true,
  isSwitch,
  switchValue,
  onSwitchChange,
  danger,
}: SettingItemProps) {
  const { colors } = useTheme();

  return (
    <TouchableOpacity
      style={styles.settingItem}
      onPress={onPress}
      disabled={isSwitch}
    >
      <View style={styles.settingItemLeft}>
        <Ionicons
          name={icon}
          size={22}
          color={danger ? colors.error : colors.textSecondary}
        />
        <Text
          style={[
            styles.settingLabel,
            { color: danger ? colors.error : colors.textPrimary },
          ]}
        >
          {label}
        </Text>
      </View>

      <View style={styles.settingItemRight}>
        {value && (
          <Text style={[styles.settingValue, { color: colors.textMuted }]}>
            {value}
          </Text>
        )}
        {isSwitch ? (
          <Switch
            value={switchValue}
            onValueChange={onSwitchChange}
            trackColor={{ false: colors.border, true: colors.accent }}
          />
        ) : showArrow ? (
          <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

export default function SettingsScreen() {
  const { colors, themeMode, setThemeMode, isDark } = useTheme();
  const { user, logout, biometricStatus, checkBiometricStatus } = useAuth();
  const { workspace } = useWorkspace();
  const router = useRouter();

  const handleBiometricToggle = async (enabled: boolean) => {
    if (enabled) {
      const result = await enableBiometricAuth();
      if (!result.success) {
        Alert.alert('Error', result.error || 'Failed to enable biometric login');
      }
    } else {
      await disableBiometricAuth();
    }
    await checkBiometricStatus();
  };

  const handleLogout = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: logout,
        },
      ]
    );
  };

  const biometricType = biometricStatus?.biometricTypes[0];
  const biometricName = biometricType ? getBiometricName(biometricType) : 'Biometric';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Settings</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile Section */}
        <View style={styles.section}>
          <AppCard variant="outlined" style={styles.profileCard}>
            <View style={styles.profileRow}>
              <View
                style={[
                  styles.avatar,
                  { backgroundColor: colors.backgroundSecondary },
                ]}
              >
                <Text style={[styles.avatarInitial, { color: colors.textPrimary }]}>
                  {user?.displayName?.charAt(0).toUpperCase() || 'U'}
                </Text>
              </View>
              <View style={styles.profileInfo}>
                <Text style={[styles.profileName, { color: colors.textPrimary }]}>
                  {user?.displayName || 'User'}
                </Text>
                <Text style={[styles.profileEmail, { color: colors.textSecondary }]}>
                  {user?.email}
                </Text>
              </View>
            </View>
          </AppCard>
        </View>

        {/* Account Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
            Account
          </Text>
          <AppCard variant="outlined" padding="none">
            <SettingItem
              icon="briefcase-outline"
              label="Workspace"
              value={workspace?.name}
              onPress={() => router.push('/(auth)/workspace-select')}
            />
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <SettingItem
              icon="person-outline"
              label="Edit Profile"
              onPress={() => {}}
            />
          </AppCard>
        </View>

        {/* Security Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
            Security
          </Text>
          <AppCard variant="outlined" padding="none">
            {biometricStatus?.isAvailable && biometricStatus?.isEnrolled && (
              <>
                <SettingItem
                  icon={biometricType === 'facial' ? 'scan-outline' : 'finger-print-outline'}
                  label={`${biometricName} Login`}
                  isSwitch
                  switchValue={biometricStatus?.isEnabled}
                  onSwitchChange={handleBiometricToggle}
                />
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
              </>
            )}
            <SettingItem
              icon="lock-closed-outline"
              label="Change Password"
              onPress={() => {}}
            />
          </AppCard>
        </View>

        {/* Appearance Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
            Appearance
          </Text>
          <AppCard variant="outlined" padding="none">
            <SettingItem
              icon="moon-outline"
              label="Dark Mode"
              value={themeMode === 'system' ? 'System' : isDark ? 'On' : 'Off'}
              onPress={() => {
                const modes: ('light' | 'dark' | 'system')[] = ['light', 'dark', 'system'];
                const currentIndex = modes.indexOf(themeMode);
                const nextMode = modes[(currentIndex + 1) % modes.length];
                setThemeMode(nextMode);
              }}
            />
          </AppCard>
        </View>

        {/* Support Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
            Support
          </Text>
          <AppCard variant="outlined" padding="none">
            <SettingItem
              icon="help-circle-outline"
              label="Help Center"
              onPress={() => {}}
            />
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <SettingItem
              icon="mail-outline"
              label="Contact Support"
              onPress={() => {}}
            />
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <SettingItem
              icon="information-circle-outline"
              label="About"
              value="v0.1.0"
              onPress={() => {}}
            />
          </AppCard>
        </View>

        {/* Sign Out */}
        <View style={styles.section}>
          <AppCard variant="outlined" padding="none">
            <SettingItem
              icon="log-out-outline"
              label="Sign Out"
              onPress={handleLogout}
              showArrow={false}
              danger
            />
          </AppCard>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    marginBottom: SPACING.md,
  },
  title: {
    fontSize: TYPOGRAPHY.fontSize['2xl'],
    fontWeight: TYPOGRAPHY.fontWeight.bold,
  },
  scrollContent: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.xl,
  },
  section: {
    marginBottom: SPACING.lg,
  },
  sectionTitle: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    fontWeight: TYPOGRAPHY.fontWeight.medium,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: SPACING.sm,
  },
  profileCard: {
    padding: SPACING.md,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: TYPOGRAPHY.fontSize['2xl'],
    fontWeight: TYPOGRAPHY.fontWeight.bold,
  },
  profileInfo: {
    marginLeft: SPACING.md,
    flex: 1,
  },
  profileName: {
    fontSize: TYPOGRAPHY.fontSize.lg,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
  },
  profileEmail: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    marginTop: 2,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    minHeight: 52,
  },
  settingItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  settingLabel: {
    fontSize: TYPOGRAPHY.fontSize.base,
    marginLeft: SPACING.md,
  },
  settingItemRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  settingValue: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    marginRight: SPACING.xs,
  },
  divider: {
    height: 1,
    marginLeft: SPACING.md + 22 + SPACING.md,
  },
});
