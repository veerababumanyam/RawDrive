/**
 * Workspace selection screen
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTheme } from '../../src/providers/ThemeProvider';
import { useWorkspace } from '../../src/contexts/WorkspaceContext';
import { AppCard } from '../../src/components/ui';
import { SPACING, TYPOGRAPHY, RADIUS } from '../../src/constants';
import type { Workspace } from '../../src/types';

export default function WorkspaceSelectScreen() {
  const { colors } = useTheme();
  const { workspaces, workspace: currentWorkspace, switchWorkspace, isLoading } = useWorkspace();
  const router = useRouter();

  const handleSelectWorkspace = async (ws: Workspace) => {
    const success = await switchWorkspace(ws.workspace_id);
    if (success) {
      router.replace('/(tabs)');
    }
  };

  const renderWorkspace = ({ item }: { item: Workspace }) => {
    const isSelected = currentWorkspace?.workspace_id === item.workspace_id;

    return (
      <AppCard
        variant="outlined"
        style={[
          styles.workspaceCard,
          isSelected && { borderColor: colors.accent, borderWidth: 2 },
        ]}
        onPress={() => handleSelectWorkspace(item)}
      >
        <View style={styles.workspaceContent}>
          <View
            style={[
              styles.workspaceIcon,
              { backgroundColor: colors.backgroundSecondary },
            ]}
          >
            <Text style={[styles.workspaceInitial, { color: colors.textPrimary }]}>
              {item.name.charAt(0).toUpperCase()}
            </Text>
          </View>

          <View style={styles.workspaceInfo}>
            <Text style={[styles.workspaceName, { color: colors.textPrimary }]}>
              {item.name}
            </Text>
            <Text style={[styles.workspaceRole, { color: colors.textSecondary }]}>
              {item.role.charAt(0).toUpperCase() + item.role.slice(1)}
            </Text>
          </View>

          {isSelected && (
            <Ionicons name="checkmark-circle" size={24} color={colors.accent} />
          )}
        </View>
      </AppCard>
    );
  };

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
            Loading workspaces...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.textPrimary }]}>
          Select Workspace
        </Text>
        <View style={styles.placeholder} />
      </View>

      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        Choose a workspace to continue
      </Text>

      {workspaces.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="briefcase-outline" size={48} color={colors.textMuted} />
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            No workspaces available
          </Text>
          <Text style={[styles.emptyHint, { color: colors.textMuted }]}>
            Create a workspace on the web to get started
          </Text>
        </View>
      ) : (
        <FlatList
          data={workspaces}
          renderItem={renderWorkspace}
          keyExtractor={(item) => item.workspace_id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: SPACING.md,
    fontSize: TYPOGRAPHY.fontSize.base,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  backButton: {
    padding: SPACING.sm,
    marginLeft: -SPACING.sm,
  },
  title: {
    fontSize: TYPOGRAPHY.fontSize.xl,
    fontWeight: TYPOGRAPHY.fontWeight.bold,
  },
  placeholder: {
    width: 40,
  },
  subtitle: {
    fontSize: TYPOGRAPHY.fontSize.base,
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  listContent: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.lg,
  },
  workspaceCard: {
    padding: SPACING.md,
  },
  workspaceContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  workspaceIcon: {
    width: 48,
    height: 48,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  workspaceInitial: {
    fontSize: TYPOGRAPHY.fontSize.xl,
    fontWeight: TYPOGRAPHY.fontWeight.bold,
  },
  workspaceInfo: {
    flex: 1,
  },
  workspaceName: {
    fontSize: TYPOGRAPHY.fontSize.base,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
    marginBottom: 2,
  },
  workspaceRole: {
    fontSize: TYPOGRAPHY.fontSize.sm,
  },
  separator: {
    height: SPACING.sm,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.xl,
  },
  emptyText: {
    fontSize: TYPOGRAPHY.fontSize.lg,
    fontWeight: TYPOGRAPHY.fontWeight.medium,
    marginTop: SPACING.md,
  },
  emptyHint: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    textAlign: 'center',
    marginTop: SPACING.xs,
  },
});
