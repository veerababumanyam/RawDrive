/**
 * React hooks for webhook management.
 * Provides state management and API integration for webhooks UI.
 */

import { useState, useEffect, useCallback } from 'react';
import { webhooksService } from '../services/webhooksService';
import type {
  WebhookSubscription,
  WebhookSubscriptionWithSecret,
  CreateWebhookSubscription,
  UpdateWebhookSubscription,
  WebhookEvent,
  WebhookDelivery,
  WebhookEventType,
  WebhookSubscriptionStats,
  PaginatedResponse,
  WebhookEventFilters,
} from '../types/webhooks';

// =============================================================================
// useWebhookSubscriptions Hook
// =============================================================================

interface UseWebhookSubscriptionsResult {
  subscriptions: WebhookSubscription[];
  loading: boolean;
  error: Error | null;
  total: number;
  page: number;
  pageSize: number;
  hasNext: boolean;
  hasPrev: boolean;
  setPage: (page: number) => void;
  refresh: () => Promise<void>;
  create: (data: CreateWebhookSubscription) => Promise<WebhookSubscriptionWithSecret>;
  update: (id: string, data: UpdateWebhookSubscription) => Promise<WebhookSubscription>;
  remove: (id: string) => Promise<void>;
  test: (id: string, eventType?: string) => Promise<{ success: boolean; message: string }>;
  rotateSecret: (id: string) => Promise<{ secret_key: string; secret_version: number }>;
}

export function useWebhookSubscriptions(options?: {
  pageSize?: number;
  isActive?: boolean;
}): UseWebhookSubscriptionsResult {
  const [subscriptions, setSubscriptions] = useState<WebhookSubscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [pagination, setPagination] = useState({
    total: 0,
    page: 1,
    pageSize: options?.pageSize || 10,
    hasNext: false,
    hasPrev: false,
  });

  const fetchSubscriptions = useCallback(async (page = 1) => {
    try {
      setLoading(true);
      setError(null);
      const response = await webhooksService.getSubscriptions({
        page,
        page_size: pagination.pageSize,
        is_active: options?.isActive,
      });
      setSubscriptions(response.items);
      setPagination({
        total: response.total,
        page: response.page,
        pageSize: response.page_size,
        hasNext: response.has_next,
        hasPrev: response.has_prev,
      });
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [pagination.pageSize, options?.isActive]);

  useEffect(() => {
    fetchSubscriptions(pagination.page);
  }, [fetchSubscriptions, pagination.page]);

  const setPage = (page: number) => {
    setPagination((prev) => ({ ...prev, page }));
  };

  const create = async (data: CreateWebhookSubscription) => {
    const subscription = await webhooksService.createSubscription(data);
    await fetchSubscriptions(pagination.page);
    return subscription;
  };

  const update = async (id: string, data: UpdateWebhookSubscription) => {
    const subscription = await webhooksService.updateSubscription(id, data);
    setSubscriptions((prev) =>
      prev.map((s) => (s.subscription_id === id ? subscription : s))
    );
    return subscription;
  };

  const remove = async (id: string) => {
    await webhooksService.deleteSubscription(id);
    await fetchSubscriptions(pagination.page);
  };

  const test = async (id: string, eventType?: string) => {
    return webhooksService.testSubscription(id, eventType);
  };

  const rotateSecret = async (id: string) => {
    return webhooksService.rotateSecret(id);
  };

  return {
    subscriptions,
    loading,
    error,
    total: pagination.total,
    page: pagination.page,
    pageSize: pagination.pageSize,
    hasNext: pagination.hasNext,
    hasPrev: pagination.hasPrev,
    setPage,
    refresh: () => fetchSubscriptions(pagination.page),
    create,
    update,
    remove,
    test,
    rotateSecret,
  };
}

// =============================================================================
// useWebhookSubscription Hook (Single Subscription)
// =============================================================================

interface UseWebhookSubscriptionResult {
  subscription: WebhookSubscription | null;
  stats: WebhookSubscriptionStats | null;
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
  update: (data: UpdateWebhookSubscription) => Promise<WebhookSubscription>;
}

export function useWebhookSubscription(subscriptionId: string): UseWebhookSubscriptionResult {
  const [subscription, setSubscription] = useState<WebhookSubscription | null>(null);
  const [stats, setStats] = useState<WebhookSubscriptionStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    if (!subscriptionId) return;
    try {
      setLoading(true);
      setError(null);
      const [subData, statsData] = await Promise.all([
        webhooksService.getSubscription(subscriptionId),
        webhooksService.getSubscriptionStats(subscriptionId),
      ]);
      setSubscription(subData);
      setStats(statsData);
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [subscriptionId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const update = async (data: UpdateWebhookSubscription) => {
    const updated = await webhooksService.updateSubscription(subscriptionId, data);
    setSubscription(updated);
    return updated;
  };

  return {
    subscription,
    stats,
    loading,
    error,
    refresh: fetchData,
    update,
  };
}

// =============================================================================
// useWebhookEvents Hook
// =============================================================================

interface UseWebhookEventsResult {
  events: WebhookEvent[];
  loading: boolean;
  error: Error | null;
  total: number;
  page: number;
  pageSize: number;
  hasNext: boolean;
  hasPrev: boolean;
  filters: WebhookEventFilters;
  setPage: (page: number) => void;
  setFilters: (filters: WebhookEventFilters) => void;
  refresh: () => Promise<void>;
}

export function useWebhookEvents(options?: {
  pageSize?: number;
  initialFilters?: WebhookEventFilters;
}): UseWebhookEventsResult {
  const [events, setEvents] = useState<WebhookEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [filters, setFilters] = useState<WebhookEventFilters>(options?.initialFilters || {});
  const [pagination, setPagination] = useState({
    total: 0,
    page: 1,
    pageSize: options?.pageSize || 20,
    hasNext: false,
    hasPrev: false,
  });

  const fetchEvents = useCallback(async (page = 1) => {
    try {
      setLoading(true);
      setError(null);
      const response = await webhooksService.getEvents({
        page,
        page_size: pagination.pageSize,
        filters,
      });
      setEvents(response.items);
      setPagination({
        total: response.total,
        page: response.page,
        pageSize: response.page_size,
        hasNext: response.has_next,
        hasPrev: response.has_prev,
      });
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [pagination.pageSize, filters]);

  useEffect(() => {
    fetchEvents(pagination.page);
  }, [fetchEvents, pagination.page]);

  const setPage = (page: number) => {
    setPagination((prev) => ({ ...prev, page }));
  };

  const updateFilters = (newFilters: WebhookEventFilters) => {
    setFilters(newFilters);
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  return {
    events,
    loading,
    error,
    total: pagination.total,
    page: pagination.page,
    pageSize: pagination.pageSize,
    hasNext: pagination.hasNext,
    hasPrev: pagination.hasPrev,
    filters,
    setPage,
    setFilters: updateFilters,
    refresh: () => fetchEvents(pagination.page),
  };
}

// =============================================================================
// useWebhookDeliveries Hook
// =============================================================================

interface UseWebhookDeliveriesResult {
  deliveries: WebhookDelivery[];
  loading: boolean;
  error: Error | null;
  total: number;
  page: number;
  hasNext: boolean;
  hasPrev: boolean;
  setPage: (page: number) => void;
  refresh: () => Promise<void>;
  retry: (deliveryId: string) => Promise<{ success: boolean; message: string }>;
}

export function useWebhookDeliveries(
  eventId: string,
  options?: { pageSize?: number }
): UseWebhookDeliveriesResult {
  const [deliveries, setDeliveries] = useState<WebhookDelivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [pagination, setPagination] = useState({
    total: 0,
    page: 1,
    pageSize: options?.pageSize || 10,
    hasNext: false,
    hasPrev: false,
  });

  const fetchDeliveries = useCallback(async (page = 1) => {
    if (!eventId) return;
    try {
      setLoading(true);
      setError(null);
      const response = await webhooksService.getEventDeliveries(eventId, {
        page,
        page_size: pagination.pageSize,
      });
      setDeliveries(response.items);
      setPagination({
        total: response.total,
        page: response.page,
        pageSize: response.page_size,
        hasNext: response.has_next,
        hasPrev: response.has_prev,
      });
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [eventId, pagination.pageSize]);

  useEffect(() => {
    fetchDeliveries(pagination.page);
  }, [fetchDeliveries, pagination.page]);

  const setPage = (page: number) => {
    setPagination((prev) => ({ ...prev, page }));
  };

  const retry = async (deliveryId: string) => {
    const result = await webhooksService.retryDelivery(deliveryId);
    await fetchDeliveries(pagination.page);
    return { success: result.status === 'queued', message: result.message };
  };

  return {
    deliveries,
    loading,
    error,
    total: pagination.total,
    page: pagination.page,
    hasNext: pagination.hasNext,
    hasPrev: pagination.hasPrev,
    setPage,
    refresh: () => fetchDeliveries(pagination.page),
    retry,
  };
}

// =============================================================================
// useWebhookEventTypes Hook
// =============================================================================

interface UseWebhookEventTypesResult {
  eventTypes: WebhookEventType[];
  categories: string[];
  loading: boolean;
  error: Error | null;
  getByCategory: (category: string) => WebhookEventType[];
  refresh: () => Promise<void>;
}

export function useWebhookEventTypes(): UseWebhookEventTypesResult {
  const [eventTypes, setEventTypes] = useState<WebhookEventType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchEventTypes = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const types = await webhooksService.getEventTypes();
      setEventTypes(types);
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEventTypes();
  }, [fetchEventTypes]);

  const categories = [...new Set(eventTypes.map((t) => t.category))];

  const getByCategory = (category: string) =>
    eventTypes.filter((t) => t.category === category);

  return {
    eventTypes,
    categories,
    loading,
    error,
    getByCategory,
    refresh: fetchEventTypes,
  };
}
