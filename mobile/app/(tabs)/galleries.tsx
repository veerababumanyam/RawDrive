/**
 * Galleries list screen
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
import { useRouter } from 'expo-router';
import { useTheme } from '../../src/providers/ThemeProvider';
import { AppCard, AppButton } from '../../src/components/ui';
import { SPACING, TYPOGRAPHY, RADIUS } from '../../src/constants';
import type { Gallery } from '../../src/types';

// Mock data for now
const MOCK_GALLERIES: Gallery[] = [];

export default function GalleriesScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [galleries, setGalleries] = useState<Gallery[]>(MOCK_GALLERIES);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    // TODO: Fetch galleries from API
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setRefreshing(false);
  }, []);

  const renderGallery = ({ item }: { item: Gallery }) => (
    <AppCard
      variant="outlined"
      padding="none"
      style={styles.galleryCard}
      onPress={() => {}}
    >
      {item.coverImageUrl ? (
        <Image source={{ uri: item.coverImageUrl }} style={styles.coverImage} />
      ) : (
        <View style={[styles.coverPlaceholder, { backgroundColor: colors.backgroundSecondary }]}>
          <Ionicons name="images-outline" size={32} color={colors.textMuted} />
        </View>
      )}

      <View style={styles.galleryInfo}>
        <Text style={[styles.galleryName, { color: colors.textPrimary }]} numberOfLines={1}>
          {item.name}
        </Text>
        <View style={styles.galleryMeta}>
          <Text style={[styles.galleryMetaText, { color: colors.textSecondary }]}>
            {item.assetCount} photos
          </Text>
          <View style={[styles.dot, { backgroundColor: colors.textMuted }]} />
          <Text style={[styles.galleryMetaText, { color: colors.textSecondary }]}>
            {item.viewCount} views
          </Text>
        </View>
        <View
          style={[
            styles.statusBadge,
            {
              backgroundColor:
                item.status === 'published'
                  ? colors.success + '20'
                  : item.status === 'draft'
                  ? colors.warning + '20'
                  : colors.textMuted + '20',
            },
          ]}
        >
          <Text
            style={[
              styles.statusText,
              {
                color:
                  item.status === 'published'
                    ? colors.success
                    : item.status === 'draft'
                    ? colors.warning
                    : colors.textMuted,
              },
            ]}
          >
            {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
          </Text>
        </View>
      </View>
    </AppCard>
  );

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="images-outline" size={64} color={colors.textMuted} />
      <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
        No galleries yet
      </Text>
      <Text style={[styles.emptyDescription, { color: colors.textSecondary }]}>
        Create your first gallery to start sharing photos with clients
      </Text>
      <AppButton onPress={() => {}} style={styles.createButton}>
        Create Gallery
      </AppButton>
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Galleries</Text>
        <TouchableOpacity
          style={[styles.addButton, { backgroundColor: colors.primary }]}
          onPress={() => {}}
        >
          <Ionicons name="add" size={24} color={colors.primaryForeground} />
        </TouchableOpacity>
      </View>

      {/* Search & Filters */}
      <TouchableOpacity
        style={[styles.searchBar, { backgroundColor: colors.backgroundSecondary }]}
        onPress={() => {}}
      >
        <Ionicons name="search-outline" size={20} color={colors.textMuted} />
        <Text style={[styles.searchPlaceholder, { color: colors.textMuted }]}>
          Search galleries...
        </Text>
      </TouchableOpacity>

      {/* Galleries List */}
      <FlatList
        data={galleries}
        renderItem={renderGallery}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[
          styles.listContent,
          galleries.length === 0 && styles.emptyListContent,
        ]}
        numColumns={2}
        columnWrapperStyle={galleries.length > 0 ? styles.columnWrapper : undefined}
        ListEmptyComponent={renderEmptyState}
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
  addButton: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
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
  columnWrapper: {
    justifyContent: 'space-between',
  },
  galleryCard: {
    width: '48%',
    marginBottom: SPACING.md,
    overflow: 'hidden',
  },
  coverImage: {
    width: '100%',
    height: 120,
    backgroundColor: '#f0f0f0',
  },
  coverPlaceholder: {
    width: '100%',
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  galleryInfo: {
    padding: SPACING.sm,
  },
  galleryName: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
    marginBottom: 4,
  },
  galleryMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  galleryMetaText: {
    fontSize: TYPOGRAPHY.fontSize.xs,
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    marginHorizontal: SPACING.xs,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: RADIUS.sm,
  },
  statusText: {
    fontSize: TYPOGRAPHY.fontSize.xs,
    fontWeight: TYPOGRAPHY.fontWeight.medium,
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
    marginBottom: SPACING.lg,
  },
  createButton: {
    minWidth: 160,
  },
});
