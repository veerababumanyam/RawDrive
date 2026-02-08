/**
 * Services index
 * Re-exports all services for easier importing
 */

// API client
export { apiClient, setCurrentWorkspaceId, getCurrentWorkspaceId } from './api';

// Authentication
export {
  login,
  logout,
  getCurrentUser,
  getWorkspace,
  refreshTokens,
} from './auth';

// Secure storage
export {
  getStoredTokens,
  setStoredTokens,
  clearStoredTokens,
  getStoredUser,
  setStoredUser,
  clearStoredUser,
  getStoredWorkspace,
  setStoredWorkspace,
  clearStoredWorkspace,
  getThemePreference,
  setThemePreference,
  clearAllSecureData,
} from './secureStorage';

// Biometric authentication
export {
  checkBiometricAvailability,
  isBiometricEnabled,
  enableBiometricAuth,
  disableBiometricAuth,
  authenticateWithBiometrics,
  getBiometricType,
} from './biometricAuth';

// Gallery service
export {
  listGalleries,
  getGallery,
  createGallery,
  updateGallery,
  deleteGallery,
  publishGallery,
  archiveGallery,
  listAssets,
  starAsset,
  unstarAsset,
  rejectAsset,
  unrejectAsset,
  generateShareLink,
  getGalleryStats,
} from './galleryService';

// Upload service
export {
  requestMediaLibraryPermissions,
  requestCameraPermissions,
  pickImages,
  takePhoto,
  addToUploadQueue,
  retryUpload,
  cancelUpload,
  getUploadQueue,
  clearCompleted,
  onUploadProgress,
  onUploadComplete,
  onUploadError,
} from './uploadService';

// Dashboard service
export {
  getDashboardOverview,
  getTodaySchedule,
  getSchedule,
  getActivityFeed,
  getQuickStats,
} from './dashboardService';

// Notification service
export {
  requestNotificationPermissions,
  getExpoPushToken,
  registerPushToken,
  unregisterPushToken,
  initializePushNotifications,
  getNotifications,
  markAsRead,
  markAllAsRead,
  getUnreadCount,
  addNotificationReceivedListener,
  addNotificationResponseListener,
  getLastNotificationResponse,
  scheduleLocalNotification,
  cancelAllScheduledNotifications,
  setBadgeCount,
  clearBadge,
} from './notificationService';

// Client service
export {
  listClients,
  getClient,
  createClient,
  updateClient,
  deleteClient,
  getClientGalleries,
  searchClients,
  getClientTags,
} from './clientService';
