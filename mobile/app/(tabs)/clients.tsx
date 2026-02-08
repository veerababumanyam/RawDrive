/**
 * Clients list screen
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/providers/ThemeProvider';
import { AppCard, AppButton } from '../../src/components/ui';
import { SPACING, TYPOGRAPHY, RADIUS } from '../../src/constants';
import type { Client } from '../../src/types';

// Mock data
const MOCK_CLIENTS: Client[] = [];

export default function ClientsScreen() {
  const { colors } = useTheme();
  const [refreshing, setRefreshing] = useState(false);
  const [clients, setClients] = useState<Client[]>(MOCK_CLIENTS);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    // TODO: Fetch clients from API
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setRefreshing(false);
  }, []);

  const renderClient = ({ item }: { item: Client }) => (
    <AppCard variant="outlined" style={styles.clientCard} onPress={() => {}}>
      <View style={styles.clientRow}>
        {item.avatarUrl ? (
          <Image source={{ uri: item.avatarUrl }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatarPlaceholder, { backgroundColor: colors.backgroundSecondary }]}>
            <Text style={[styles.avatarInitial, { color: colors.textPrimary }]}>
              {item.name.charAt(0).toUpperCase()}
            </Text>
          </View>
        )}

        <View style={styles.clientInfo}>
          <Text style={[styles.clientName, { color: colors.textPrimary }]} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={[styles.clientEmail, { color: colors.textSecondary }]} numberOfLines={1}>
            {item.email}
          </Text>
          <View style={styles.clientMeta}>
            <Ionicons name="images-outline" size={14} color={colors.textMuted} />
            <Text style={[styles.clientMetaText, { color: colors.textMuted }]}>
              {item.galleriesCount} galleries
            </Text>
          </View>
        </View>

        <TouchableOpacity style={styles.actionButton}>
          <Ionicons name="chatbubble-outline" size={20} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>
    </AppCard>
  );

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="people-outline" size={64} color={colors.textMuted} />
      <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
        No clients yet
      </Text>
      <Text style={[styles.emptyDescription, { color: colors.textSecondary }]}>
        Clients will appear here when they interact with your galleries
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Clients</Text>
      </View>

      {/* Search */}
      <TouchableOpacity
        style={[styles.searchBar, { backgroundColor: colors.backgroundSecondary }]}
        onPress={() => {}}
      >
        <Ionicons name="search-outline" size={20} color={colors.textMuted} />
        <Text style={[styles.searchPlaceholder, { color: colors.textMuted }]}>
          Search clients...
        </Text>
      </TouchableOpacity>

      {/* Clients List */}
      <FlatList
        data={clients}
        renderItem={renderClient}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[
          styles.listContent,
          clients.length === 0 && styles.emptyListContent,
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
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    marginBottom: SPACING.md,
  },
  title: {
    fontSize: TYPOGRAPHY.fontSize['2xl'],
    fontWeight: TYPOGRAPHY.fontWeight.bold,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 4,
    borderRadius: RADIUS.md,
  },
  searchPlaceholder: {
    marginLeft: SPACING.sm,
    fontSize: TYPOGRAPHY.fontSize.base,
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
  clientCard: {
    padding: SPACING.md,
  },
  clientRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: RADIUS.full,
  },
  avatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: TYPOGRAPHY.fontSize.lg,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
  },
  clientInfo: {
    flex: 1,
    marginLeft: SPACING.md,
  },
  clientName: {
    fontSize: TYPOGRAPHY.fontSize.base,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
  },
  clientEmail: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    marginTop: 2,
  },
  clientMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  clientMetaText: {
    fontSize: TYPOGRAPHY.fontSize.xs,
    marginLeft: 4,
  },
  actionButton: {
    padding: SPACING.sm,
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
