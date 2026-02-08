/**
 * React Query provider with mobile-optimized configuration
 */

import React, { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppState, AppStateStatus, Platform } from 'react-native';
import { focusManager, onlineManager } from '@tanstack/react-query';
import * as Network from 'expo-network';

// Configure focus manager for React Native
focusManager.setEventListener((handleFocus) => {
  const subscription = AppState.addEventListener('change', (state: AppStateStatus) => {
    handleFocus(state === 'active');
  });

  return () => {
    subscription.remove();
  };
});

// Configure online manager for React Native
onlineManager.setEventListener((setOnline) => {
  // Check initial network state
  Network.getNetworkStateAsync().then((state) => {
    setOnline(state.isConnected ?? false);
  });

  // Note: For continuous monitoring, you'd need to poll or use a native module
  // Expo doesn't provide a network change listener out of the box
  // For production, consider using react-native-netinfo instead

  return () => {};
});

// Create query client with mobile-optimized settings
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Retry configuration
      retry: 2,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),

      // Stale time - how long data is considered fresh
      staleTime: 1000 * 60 * 2, // 2 minutes

      // Cache time - how long to keep data in cache after becoming unused
      gcTime: 1000 * 60 * 30, // 30 minutes

      // Refetch behavior
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      refetchOnMount: true,

      // Network mode - fetch even when offline (for cached data)
      networkMode: 'offlineFirst',
    },
    mutations: {
      retry: 1,
      retryDelay: 1000,
      networkMode: 'offlineFirst',
    },
  },
});

interface QueryProviderProps {
  children: ReactNode;
}

export function QueryProvider({ children }: QueryProviderProps) {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}

export { queryClient };
export default QueryProvider;
