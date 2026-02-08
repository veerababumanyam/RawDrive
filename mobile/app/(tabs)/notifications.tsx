/**
 * Notifications screen
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/providers/ThemeProvider';
import { AppCard } from '../../src/components/ui';
import { SPACING, TYPOGRAPHY, RADIUS } from '../../src/constants';
import type { PushNotification } from '../../src/types';

// Mock data
const MOCK_NOTIFICATIONS: PushNotification[] = [];

const getNotificationIcon = (
  type: PushNotification['type']
): keyof typeof Ionicons.glyphMap => {
  switch (type) {
    case 'payment':
      return 'card-outline';
    case 'favorite':
      return 'heart-outline';
    case 'comment':
      return 'chatbubble-outline';
    case 'inquiry':
      return 'mail-outline';
    case 'booking':
      return 'calendar-outline';
    case 'system':
    default:
      return 'notifications-outline';
  }
};

export default function NotificationsScreen() {
  const { colors } = useTheme();
  const [refreshing, setRefreshing] = useState(false);
  const [notifications, setNotifications] = useState<PushNotification[]>(MOCK_NOTIFICATIONS);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    // TODO: Fetch notifications from API
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setRefreshing(false);
  }, []);

  const formatTime = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();

    const minutes = Math.floor(diff / 60000);
    if (minutes < 60) return `${minutes}m ago`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;

    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;

    return date.toLocaleDateString();
  };

  const renderNotification = ({ item }: { item: PushNotification }) => (
    <AppCard
      variant={item.read ? 'default' : 'outlined'}
      style={[
        styles.notificationCard,
        !item.read && { borderLeftWidth: 3, borderLeftColor: colors.accent },
      ]}
      onPress={() => {}}
    >
      <View style={styles.notificationRow}>
        <View
          style={[
            styles.iconContainer,
            { backgroundColor: colors.backgroundSecondary },
          ]}
        >
          <Ionicons
            name={getNotificationIcon(item.type)}
            size={20}
            color={colors.textSecondary}
          />
        </View>

        <View style={styles.notificationContent}>
          <Text
            style={[
              styles.notificationTitle,
              { color: colors.textPrimary },
              !item.read && { fontWeight: TYPOGRAPHY.fontWeight.semibold },
            ]}
            numberOfLines={1}
          >
            {item.title}
          </Text>
          <Text
            style={[styles.notificationBody, { color: colors.textSecondary }]}
            numberOfLines={2}
          >
            {item.body}
          </Text>
          <Text style={[styles.notificationTime, { color: colors.textMuted }]}>
            {formatTime(item.createdAt)}
          </Text>
        </View>

        {!item.read && (
          <View style={[styles.unreadDot, { backgroundColor: colors.accent }]} />
        )}
      </View>
    </AppCard>
  );

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="notifications-outline" size={64} color={colors.textMuted} />
      <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
        No notifications
      </Text>
      <Text style={[styles.emptyDescription, { color: colors.textSecondary }]}>
        You'll receive notifications about payments, client activity, and more
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Notifications</Text>
        {notifications.length > 0 && (
          <TouchableOpacity onPress={() => {}}>
            <Text style={[styles.markAllRead, { color: colors.accent }]}>
              Mark all read
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Notifications List */}
      <FlatList
        data={notifications}
        renderItem={renderNotification}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[
          styles.listContent,
          notifications.length === 0 && styles.emptyListContent,
        ]}
        ListEmptyComponent={renderEmptyState}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.textSecondary}
          />
        }
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    marginBottom: SPACING.md,
  },
  title: {
    fontSize: TYPOGRAPHY.fontSize['2xl'],
    fontWeight: TYPOGRAPHY.fontWeight.bold,
  },
  markAllRead: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    fontWeight: TYPOGRAPHY.fontWeight.medium,
  },
  listContent: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.xl,
  },
  emptyListContent: {
    flex: 1,
  },
  separator: {
    height: SPACING.sm,
  },
  notificationCard: {
    padding: SPACING.md,
  },
  notificationRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  notificationContent: {
    flex: 1,
  },
  notificationTitle: {
    fontSize: TYPOGRAPHY.fontSize.base,
    marginBottom: 2,
  },
  notificationBody: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    lineHeight: 20,
  },
  notificationTime: {
    fontSize: TYPOGRAPHY.fontSize.xs,
    marginTop: SPACING.xs,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginLeft: SPACING.sm,
    marginTop: 4,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.xl,
  },
  emptyTitle: {
    fontSize: TYPOGRAPHY.fontSize.xl,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
    marginTop: SPACING.lg,
    marginBottom: SPACING.sm,
  },
  emptyDescription: {
    fontSize: TYPOGRAPHY.fontSize.base,
    textAlign: 'center',
  },
});
