/**
 * Dashboard / Home screen
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTheme } from '../../src/providers/ThemeProvider';
import { useAuth } from '../../src/contexts/AuthContext';
import { useWorkspace } from '../../src/contexts/WorkspaceContext';
import { AppCard, AppButton } from '../../src/components/ui';
import { SPACING, TYPOGRAPHY, RADIUS } from '../../src/constants';

// Quick action data
const QUICK_ACTIONS = [
  { id: 'gallery', icon: 'add-circle-outline' as const, label: 'Create Gallery', route: '/galleries/create' },
  { id: 'upload', icon: 'cloud-upload-outline' as const, label: 'Upload Photos', route: '/upload' },
  { id: 'share', icon: 'share-outline' as const, label: 'Share Link', route: '/share' },
];

export default function DashboardScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const { workspace } = useWorkspace();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    // TODO: Refresh dashboard data
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setRefreshing(false);
  }, []);

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.textSecondary}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={[styles.greeting, { color: colors.textSecondary }]}>
              {greeting()},
            </Text>
            <Text style={[styles.userName, { color: colors.textPrimary }]}>
              {user?.displayName || 'Photographer'}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.workspaceBadge, { backgroundColor: colors.backgroundSecondary }]}
            onPress={() => router.push('/(auth)/workspace-select')}
          >
            <Text style={[styles.workspaceText, { color: colors.textSecondary }]}>
              {workspace?.name || 'Select Workspace'}
            </Text>
            <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Quick Actions */}
        <View style={styles.quickActions}>
          {QUICK_ACTIONS.map((action) => (
            <TouchableOpacity
              key={action.id}
              style={[styles.quickAction, { backgroundColor: colors.backgroundSecondary }]}
              onPress={() => {}}
            >
              <Ionicons name={action.icon} size={24} color={colors.primary} />
              <Text style={[styles.quickActionLabel, { color: colors.textPrimary }]}>
                {action.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Today's Overview */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
            Today's Overview
          </Text>

          <AppCard variant="outlined" style={styles.overviewCard}>
            <View style={styles.overviewRow}>
              <View style={styles.overviewItem}>
                <Text style={[styles.overviewValue, { color: colors.textPrimary }]}>0</Text>
                <Text style={[styles.overviewLabel, { color: colors.textSecondary }]}>
                  Scheduled
                </Text>
              </View>
              <View style={[styles.overviewDivider, { backgroundColor: colors.border }]} />
              <View style={styles.overviewItem}>
                <Text style={[styles.overviewValue, { color: colors.textPrimary }]}>0</Text>
                <Text style={[styles.overviewLabel, { color: colors.textSecondary }]}>
                  Pending
                </Text>
              </View>
              <View style={[styles.overviewDivider, { backgroundColor: colors.border }]} />
              <View style={styles.overviewItem}>
                <Text style={[styles.overviewValue, { color: colors.textPrimary }]}>0</Text>
                <Text style={[styles.overviewLabel, { color: colors.textSecondary }]}>
                  Views Today
                </Text>
              </View>
            </View>
          </AppCard>
        </View>

        {/* Active Galleries */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
              Active Galleries
            </Text>
            <TouchableOpacity onPress={() => router.push('/(tabs)/galleries')}>
              <Text style={[styles.seeAll, { color: colors.accent }]}>See all</Text>
            </TouchableOpacity>
          </View>

          <AppCard variant="default" style={styles.emptyCard}>
            <Ionicons name="images-outline" size={48} color={colors.textMuted} />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              No active galleries
            </Text>
            <AppButton
              variant="outline"
              size="sm"
              onPress={() => {}}
              style={styles.emptyButton}
            >
              Create Gallery
            </AppButton>
          </AppCard>
        </View>

        {/* Recent Activity */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
            Recent Activity
          </Text>

          <AppCard variant="default" style={styles.emptyCard}>
            <Ionicons name="pulse-outline" size={48} color={colors.textMuted} />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              No recent activity
            </Text>
            <Text style={[styles.emptyHint, { color: colors.textMuted }]}>
              Activity from clients will appear here
            </Text>
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
  scrollContent: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.xl,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingTop: SPACING.md,
    marginBottom: SPACING.lg,
  },
  greeting: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    marginBottom: 2,
  },
  userName: {
    fontSize: TYPOGRAPHY.fontSize['2xl'],
    fontWeight: TYPOGRAPHY.fontWeight.bold,
  },
  workspaceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.full,
  },
  workspaceText: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    marginRight: SPACING.xs,
  },
  quickActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: SPACING.lg,
  },
  quickAction: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: SPACING.md,
    marginHorizontal: SPACING.xs,
    borderRadius: RADIUS.md,
  },
  quickActionLabel: {
    fontSize: TYPOGRAPHY.fontSize.xs,
    marginTop: SPACING.xs,
    fontWeight: TYPOGRAPHY.fontWeight.medium,
  },
  section: {
    marginBottom: SPACING.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  sectionTitle: {
    fontSize: TYPOGRAPHY.fontSize.lg,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
    marginBottom: SPACING.sm,
  },
  seeAll: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    fontWeight: TYPOGRAPHY.fontWeight.medium,
  },
  overviewCard: {
    padding: SPACING.md,
  },
  overviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  overviewItem: {
    flex: 1,
    alignItems: 'center',
  },
  overviewValue: {
    fontSize: TYPOGRAPHY.fontSize['2xl'],
    fontWeight: TYPOGRAPHY.fontWeight.bold,
    marginBottom: 2,
  },
  overviewLabel: {
    fontSize: TYPOGRAPHY.fontSize.xs,
  },
  overviewDivider: {
    width: 1,
    height: 40,
    marginHorizontal: SPACING.md,
  },
  emptyCard: {
    alignItems: 'center',
    paddingVertical: SPACING.xl,
  },
  emptyText: {
    fontSize: TYPOGRAPHY.fontSize.base,
    fontWeight: TYPOGRAPHY.fontWeight.medium,
    marginTop: SPACING.md,
  },
  emptyHint: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    marginTop: SPACING.xs,
  },
  emptyButton: {
    marginTop: SPACING.md,
  },
});
