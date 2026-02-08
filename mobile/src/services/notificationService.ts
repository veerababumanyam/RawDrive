/**
 * Notification service for mobile app
 * Handles push notifications and in-app notifications
 */

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { apiClient } from './api';
import type { ApiResponse, PushNotification } from '../types';

// Configure notification behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// Response types
interface NotificationListResponse {
  notifications: Array<{
    id: string;
    title: string;
    body: string;
    type: PushNotification['type'];
    data?: Record<string, unknown>;
    read: boolean;
    created_at: string;
  }>;
  total: number;
  unread_count: number;
  page: number;
  page_size: number;
}

/**
 * Request notification permissions
 */
export async function requestNotificationPermissions(): Promise<boolean> {
  if (!Device.isDevice) {
    console.log('Must use physical device for Push Notifications');
    return false;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    return false;
  }

  // Android requires notification channel
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
    });

    // Create channels for different notification types
    await Notifications.setNotificationChannelAsync('payments', {
      name: 'Payment Notifications',
      importance: Notifications.AndroidImportance.HIGH,
      description: 'Notifications for payment events',
    });

    await Notifications.setNotificationChannelAsync('activity', {
      name: 'Activity Notifications',
      importance: Notifications.AndroidImportance.DEFAULT,
      description: 'Notifications for favorites, comments, and views',
    });

    await Notifications.setNotificationChannelAsync('bookings', {
      name: 'Booking Notifications',
      importance: Notifications.AndroidImportance.HIGH,
      description: 'Notifications for booking and inquiry events',
    });
  }

  return true;
}

/**
 * Get the Expo push token
 */
export async function getExpoPushToken(): Promise<string | null> {
  if (!Device.isDevice) {
    return null;
  }

  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;

    const { data: token } = await Notifications.getExpoPushTokenAsync({
      projectId,
    });

    return token;
  } catch (error) {
    console.error('Failed to get push token:', error);
    return null;
  }
}

/**
 * Register push token with backend
 */
export async function registerPushToken(token: string): Promise<ApiResponse<void>> {
  return apiClient.post<void>('/notifications/devices', {
    token,
    platform: Platform.OS,
    device_type: Device.modelName || 'unknown',
  });
}

/**
 * Unregister push token from backend
 */
export async function unregisterPushToken(token: string): Promise<ApiResponse<void>> {
  return apiClient.delete<void>('/notifications/devices', {
    token,
  });
}

/**
 * Initialize push notifications
 */
export async function initializePushNotifications(): Promise<boolean> {
  const hasPermission = await requestNotificationPermissions();

  if (!hasPermission) {
    return false;
  }

  const token = await getExpoPushToken();

  if (!token) {
    return false;
  }

  const result = await registerPushToken(token);

  return !result.error;
}

/**
 * Get notifications list
 */
export async function getNotifications(params?: {
  page?: number;
  pageSize?: number;
  unreadOnly?: boolean;
}): Promise<ApiResponse<{
  notifications: PushNotification[];
  total: number;
  unreadCount: number;
  page: number;
  pageSize: number;
}>> {
  const queryParams = new URLSearchParams();

  if (params?.page) queryParams.set('page', params.page.toString());
  if (params?.pageSize) queryParams.set('page_size', params.pageSize.toString());
  if (params?.unreadOnly) queryParams.set('unread_only', 'true');

  const queryString = queryParams.toString();
  const endpoint = `/notifications${queryString ? `?${queryString}` : ''}`;

  const response = await apiClient.get<NotificationListResponse>(endpoint);

  if (response.error) {
    return { error: response.error };
  }

  if (!response.data) {
    return { error: { code: 'NO_DATA', message: 'No data returned' } };
  }

  return {
    data: {
      notifications: response.data.notifications.map((n) => ({
        id: n.id,
        title: n.title,
        body: n.body,
        type: n.type,
        data: n.data,
        read: n.read,
        createdAt: n.created_at,
      })),
      total: response.data.total,
      unreadCount: response.data.unread_count,
      page: response.data.page,
      pageSize: response.data.page_size,
    },
  };
}

/**
 * Mark notification as read
 */
export async function markAsRead(notificationId: string): Promise<ApiResponse<void>> {
  return apiClient.post<void>(`/notifications/${notificationId}/read`);
}

/**
 * Mark all notifications as read
 */
export async function markAllAsRead(): Promise<ApiResponse<void>> {
  return apiClient.post<void>('/notifications/read-all');
}

/**
 * Get unread count
 */
export async function getUnreadCount(): Promise<ApiResponse<{ count: number }>> {
  const response = await apiClient.get<{ unread_count: number }>('/notifications/unread-count');

  if (response.error) {
    return { error: response.error };
  }

  if (!response.data) {
    return { error: { code: 'NO_DATA', message: 'No data returned' } };
  }

  return {
    data: { count: response.data.unread_count },
  };
}

/**
 * Add listener for received notifications (when app is in foreground)
 */
export function addNotificationReceivedListener(
  callback: (notification: Notifications.Notification) => void
): Notifications.EventSubscription {
  return Notifications.addNotificationReceivedListener(callback);
}

/**
 * Add listener for notification responses (when user taps notification)
 */
export function addNotificationResponseListener(
  callback: (response: Notifications.NotificationResponse) => void
): Notifications.EventSubscription {
  return Notifications.addNotificationResponseReceivedListener(callback);
}

/**
 * Get the last notification response (for deep linking on app launch)
 */
export async function getLastNotificationResponse(): Promise<Notifications.NotificationResponse | null> {
  return Notifications.getLastNotificationResponseAsync();
}

/**
 * Schedule a local notification
 */
export async function scheduleLocalNotification(
  title: string,
  body: string,
  data?: Record<string, unknown>,
  seconds: number = 1
): Promise<string> {
  return Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data,
    },
    trigger: { seconds },
  });
}

/**
 * Cancel all scheduled notifications
 */
export async function cancelAllScheduledNotifications(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

/**
 * Set badge count
 */
export async function setBadgeCount(count: number): Promise<void> {
  await Notifications.setBadgeCountAsync(count);
}

/**
 * Clear badge
 */
export async function clearBadge(): Promise<void> {
  await Notifications.setBadgeCountAsync(0);
}
