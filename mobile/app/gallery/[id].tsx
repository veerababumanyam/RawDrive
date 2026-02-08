/**
 * Gallery Detail Screen
 * Shows gallery assets with grid view and action options
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  RefreshControl,
  Share,
  Alert,
  Dimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../src/providers/ThemeProvider';
import { useGallery, useGalleryAssets, usePublishGallery, useStarAsset, useUnstarAsset } from '../../src/hooks';
import { pickImages, addToUploadQueue } from '../../src/services/uploadService';
import { generateShareLink } from '../../src/services/galleryService';
import type { Asset } from '../../src/types';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const NUM_COLUMNS = 3;
const GAP = 2;
const ITEM_SIZE = (SCREEN_WIDTH - GAP * (NUM_COLUMNS + 1)) / NUM_COLUMNS;

export default function GalleryDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors, isDark } = useTheme();

  const [selectedAssets, setSelectedAssets] = useState<Set<string>>(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);

  const { data: galleryData, isLoading: isLoadingGallery, refetch: refetchGallery } = useGallery(id!);
  const { data: assetsData, isLoading: isLoadingAssets, refetch: refetchAssets } = useGalleryAssets(id!);
  const publishMutation = usePublishGallery();
  const starMutation = useStarAsset();
  const unstarMutation = useUnstarAsset();

  const gallery = galleryData?.gallery;
  const assets = assetsData?.assets || [];

  const handleRefresh = useCallback(() => {
    refetchGallery();
    refetchAssets();
  }, [refetchGallery, refetchAssets]);

  const handleUpload = async () => {
    try {
      const pickedAssets = await pickImages({ allowsMultipleSelection: true });
      if (pickedAssets.length > 0) {
        await addToUploadQueue(id!, pickedAssets);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert('Upload Started', `${pickedAssets.length} file(s) queued for upload`);
      }
    } catch (error: any) {
      Alert.alert('Upload Error', error.message);
    }
  };

  const handleShare = async () => {
    try {
      const result = await generateShareLink(id!);
      if (result.data?.shareUrl) {
        await Share.share({
          message: `View my gallery: ${result.data.shareUrl}`,
          url: result.data.shareUrl,
        });
      }
    } catch (error: any) {
      Alert.alert('Share Error', error.message);
    }
  };

  const handlePublish = async () => {
    Alert.alert(
      'Publish Gallery',
      'Are you sure you want to publish this gallery? It will be visible to clients.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Publish',
          onPress: async () => {
            try {
              await publishMutation.mutateAsync(id!);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            } catch (error: any) {
              Alert.alert('Error', error.message);
            }
          },
        },
      ]
    );
  };

  const handleAssetPress = (asset: Asset) => {
    if (isSelectionMode) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setSelectedAssets((prev) => {
        const next = new Set(prev);
        if (next.has(asset.id)) {
          next.delete(asset.id);
        } else {
          next.add(asset.id);
        }
        if (next.size === 0) {
          setIsSelectionMode(false);
        }
        return next;
      });
    } else {
      // Navigate to asset viewer
      router.push(`/gallery/${id}/asset/${asset.id}`);
    }
  };

  const handleAssetLongPress = (asset: Asset) => {
    if (!isSelectionMode) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setIsSelectionMode(true);
      setSelectedAssets(new Set([asset.id]));
    }
  };

  const handleStarSelected = async () => {
    const assetIds = Array.from(selectedAssets);
    for (const assetId of assetIds) {
      await starMutation.mutateAsync({ galleryId: id!, assetId });
    }
    setSelectedAssets(new Set());
    setIsSelectionMode(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const cancelSelection = () => {
    setSelectedAssets(new Set());
    setIsSelectionMode(false);
  };

  const renderAsset = ({ item }: { item: Asset }) => {
    const isSelected = selectedAssets.has(item.id);

    return (
      <Pressable
        onPress={() => handleAssetPress(item)}
        onLongPress={() => handleAssetLongPress(item)}
        style={[
          styles.assetContainer,
          isSelected && { borderColor: colors.primary, borderWidth: 3 },
        ]}
      >
        <Image
          source={{ uri: item.thumbnailUrl }}
          style={styles.assetImage}
          contentFit="cover"
          transition={200}
        />
        {item.isStarred && (
          <View style={[styles.starBadge, { backgroundColor: colors.warning }]}>
            <Ionicons name="star" size={12} color="#fff" />
          </View>
        )}
        {isSelectionMode && (
          <View
            style={[
              styles.selectionIndicator,
              {
                backgroundColor: isSelected ? colors.primary : 'rgba(0,0,0,0.3)',
                borderColor: isSelected ? colors.primary : '#fff',
              },
            ]}
          >
            {isSelected && <Ionicons name="checkmark" size={14} color="#fff" />}
          </View>
        )}
      </Pressable>
    );
  };

  const isLoading = isLoadingGallery || isLoadingAssets;

  return (
    <>
      <Stack.Screen
        options={{
          title: gallery?.name || 'Gallery',
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.textPrimary,
          headerRight: () =>
            isSelectionMode ? (
              <View style={styles.headerButtons}>
                <Pressable onPress={handleStarSelected} style={styles.headerButton}>
                  <Ionicons name="star" size={24} color={colors.warning} />
                </Pressable>
                <Pressable onPress={cancelSelection} style={styles.headerButton}>
                  <Text style={{ color: colors.primary }}>Cancel</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.headerButtons}>
                <Pressable onPress={handleUpload} style={styles.headerButton}>
                  <Ionicons name="cloud-upload" size={24} color={colors.primary} />
                </Pressable>
                <Pressable onPress={handleShare} style={styles.headerButton}>
                  <Ionicons name="share-outline" size={24} color={colors.primary} />
                </Pressable>
              </View>
            ),
        }}
      />

      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {/* Gallery Info Header */}
        <View style={[styles.infoHeader, { borderBottomColor: colors.border }]}>
          <View style={styles.infoRow}>
            <View>
              <Text style={[styles.galleryName, { color: colors.textPrimary }]}>
                {gallery?.name}
              </Text>
              {gallery?.clientName && (
                <Text style={[styles.clientName, { color: colors.textSecondary }]}>
                  {gallery.clientName}
                </Text>
              )}
            </View>
            <View
              style={[
                styles.statusBadge,
                {
                  backgroundColor:
                    gallery?.status === 'published'
                      ? colors.success + '20'
                      : gallery?.status === 'archived'
                      ? colors.textMuted + '20'
                      : colors.warning + '20',
                },
              ]}
            >
              <Text
                style={[
                  styles.statusText,
                  {
                    color:
                      gallery?.status === 'published'
                        ? colors.success
                        : gallery?.status === 'archived'
                        ? colors.textMuted
                        : colors.warning,
                  },
                ]}
              >
                {gallery?.status}
              </Text>
            </View>
          </View>

          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text style={[styles.statValue, { color: colors.textPrimary }]}>
                {gallery?.assetCount || 0}
              </Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Photos</Text>
            </View>
            <View style={styles.stat}>
              <Text style={[styles.statValue, { color: colors.textPrimary }]}>
                {gallery?.viewCount || 0}
              </Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Views</Text>
            </View>
          </View>

          {gallery?.status === 'draft' && (
            <Pressable
              onPress={handlePublish}
              style={[styles.publishButton, { backgroundColor: colors.primary }]}
            >
              <Text style={[styles.publishButtonText, { color: colors.primaryForeground }]}>
                Publish Gallery
              </Text>
            </Pressable>
          )}
        </View>

        {/* Selection Mode Header */}
        {isSelectionMode && (
          <View style={[styles.selectionHeader, { backgroundColor: colors.backgroundSecondary }]}>
            <Text style={[styles.selectionText, { color: colors.textPrimary }]}>
              {selectedAssets.size} selected
            </Text>
          </View>
        )}

        {/* Assets Grid */}
        <FlatList
          data={assets}
          renderItem={renderAsset}
          keyExtractor={(item) => item.id}
          numColumns={NUM_COLUMNS}
          contentContainerStyle={styles.gridContainer}
          refreshControl={
            <RefreshControl refreshing={isLoading} onRefresh={handleRefresh} tintColor={colors.primary} />
          }
          ListEmptyComponent={
            !isLoading ? (
              <View style={styles.emptyState}>
                <Ionicons name="images-outline" size={64} color={colors.textMuted} />
                <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No photos yet</Text>
                <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
                  Upload photos to get started
                </Text>
                <Pressable
                  onPress={handleUpload}
                  style={[styles.uploadButton, { backgroundColor: colors.primary }]}
                >
                  <Ionicons name="cloud-upload" size={20} color={colors.primaryForeground} />
                  <Text style={[styles.uploadButtonText, { color: colors.primaryForeground }]}>
                    Upload Photos
                  </Text>
                </Pressable>
              </View>
            ) : null
          }
        />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerButtons: {
    flexDirection: 'row',
    gap: 16,
  },
  headerButton: {
    padding: 4,
  },
  infoHeader: {
    padding: 16,
    borderBottomWidth: 1,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  galleryName: {
    fontSize: 20,
    fontWeight: '700',
  },
  clientName: {
    fontSize: 14,
    marginTop: 4,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 24,
  },
  stat: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
  },
  statLabel: {
    fontSize: 12,
  },
  publishButton: {
    marginTop: 12,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  publishButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  selectionHeader: {
    padding: 12,
    alignItems: 'center',
  },
  selectionText: {
    fontSize: 14,
    fontWeight: '600',
  },
  gridContainer: {
    padding: GAP,
  },
  assetContainer: {
    width: ITEM_SIZE,
    height: ITEM_SIZE,
    margin: GAP / 2,
  },
  assetImage: {
    width: '100%',
    height: '100%',
  },
  starBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectionIndicator: {
    position: 'absolute',
    top: 4,
    left: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    marginTop: 60,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 24,
  },
  uploadButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
