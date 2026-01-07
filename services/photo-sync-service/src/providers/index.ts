/**
 * Provider Factory Module.
 *
 * Provides a factory for creating provider instances based on provider type.
 * Centralizes provider instantiation and configuration.
 *
 * @module providers/index
 */

import { Provider } from '../types.js';
import type { IPhotoProvider } from './provider.interface.js';
import type { BaseProviderOptions } from './base.provider.js';
import { GooglePhotosProvider, GOOGLE_PHOTOS_CONFIG } from './google.provider.js';

// Re-export types and classes
export * from './provider.interface.js';
export * from './base.provider.js';
export * from './google.provider.js';

// ============================================================================
// Provider Factory
// ============================================================================

/**
 * Provider factory class.
 *
 * Creates provider instances based on provider type.
 */
export class ProviderFactory {
  /**
   * Create a provider instance.
   *
   * @param provider - Provider type
   * @param options - Provider options
   * @returns Provider instance
   * @throws Error if provider is not supported
   */
  static create(provider: Provider, options: BaseProviderOptions): IPhotoProvider {
    switch (provider) {
      case Provider.GOOGLE_PHOTOS:
        return new GooglePhotosProvider(options);

      // Future providers will be added here
      // case Provider.DROPBOX:
      //   return new DropboxProvider(options);
      // case Provider.ONEDRIVE:
      //   return new OneDriveProvider(options);
      // case Provider.AMAZON_PHOTOS:
      //   return new AmazonPhotosProvider(options);
      // case Provider.ICLOUD:
      //   return new ICloudProvider(options);

      default:
        throw new Error(`Provider not supported: ${provider}`);
    }
  }

  /**
   * Check if a provider is supported.
   *
   * @param provider - Provider type
   * @returns True if provider is supported
   */
  static isSupported(provider: Provider): boolean {
    return [
      Provider.GOOGLE_PHOTOS,
      // Add other supported providers as they are implemented
    ].includes(provider);
  }

  /**
   * Get all supported providers.
   *
   * @returns Array of supported provider types
   */
  static getSupportedProviders(): Provider[] {
    return [
      Provider.GOOGLE_PHOTOS,
      // Add other supported providers as they are implemented
    ];
  }

  /**
   * Get provider configuration.
   *
   * @param provider - Provider type
   * @returns Provider configuration or undefined if not supported
   */
  static getConfig(provider: Provider) {
    switch (provider) {
      case Provider.GOOGLE_PHOTOS:
        return GOOGLE_PHOTOS_CONFIG;
      default:
        return undefined;
    }
  }
}

export default ProviderFactory;
