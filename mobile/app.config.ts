import { ExpoConfig, ConfigContext } from 'expo/config';

// Environment-specific configuration
const getEnvironmentConfig = () => {
  const env = process.env.APP_ENV || 'development';

  const configs = {
    development: {
      apiUrl: 'http://localhost:8000/api/v1',
      galleryServiceUrl: 'http://localhost:8001/api/v1',
      enableDebugMode: true,
    },
    staging: {
      apiUrl: 'https://staging-api.rawdrive.in/api/v1',
      galleryServiceUrl: 'https://staging-gallery.rawdrive.in/api/v1',
      enableDebugMode: true,
    },
    production: {
      apiUrl: 'https://api.rawdrive.in/api/v1',
      galleryServiceUrl: 'https://gallery.rawdrive.in/api/v1',
      enableDebugMode: false,
    },
  };

  return configs[env as keyof typeof configs] || configs.development;
};

export default ({ config }: ConfigContext): ExpoConfig => {
  const envConfig = getEnvironmentConfig();
  const appEnv = process.env.APP_ENV || 'development';

  return {
    ...config,
    name: appEnv === 'production' ? 'RawDrive' : `RawDrive (${appEnv})`,
    slug: 'rawdrive-mobile',
    version: '0.1.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    scheme: 'rawdrive',
    userInterfaceStyle: 'automatic',
    newArchEnabled: true,

    // Splash screen configuration
    splash: {
      image: './assets/splash-icon.png',
      imageWidth: 200,
      resizeMode: 'contain',
      backgroundColor: '#000000',
    },

    // iOS-specific configuration
    ios: {
      supportsTablet: true,
      bundleIdentifier: appEnv === 'production'
        ? 'in.rawdrive.mobile'
        : `in.rawdrive.mobile.${appEnv}`,
      buildNumber: '1',
      config: {
        usesNonExemptEncryption: false,
      },
      infoPlist: {
        NSCameraUsageDescription: 'RawDrive needs access to your camera to capture photos and videos for galleries.',
        NSPhotoLibraryUsageDescription: 'RawDrive needs access to your photo library to upload images to galleries.',
        NSPhotoLibraryAddUsageDescription: 'RawDrive needs permission to save images to your photo library.',
        NSFaceIDUsageDescription: 'RawDrive uses Face ID to securely authenticate you.',
        UIBackgroundModes: ['fetch', 'remote-notification'],
      },
    },

    // Android-specific configuration
    android: {
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#000000',
      },
      package: appEnv === 'production'
        ? 'in.rawdrive.mobile'
        : `in.rawdrive.mobile.${appEnv}`,
      versionCode: 1,
      permissions: [
        'android.permission.CAMERA',
        'android.permission.READ_EXTERNAL_STORAGE',
        'android.permission.WRITE_EXTERNAL_STORAGE',
        'android.permission.USE_BIOMETRIC',
        'android.permission.USE_FINGERPRINT',
        'android.permission.RECEIVE_BOOT_COMPLETED',
        'android.permission.VIBRATE',
        'android.permission.READ_MEDIA_IMAGES',
        'android.permission.READ_MEDIA_VIDEO',
      ],
    },

    // Web configuration (for development/testing)
    web: {
      bundler: 'metro',
      output: 'static',
      favicon: './assets/favicon.png',
    },

    // Expo plugins
    plugins: [
      'expo-router',
      'expo-secure-store',
      'expo-font',
      [
        'expo-local-authentication',
        {
          faceIDPermission: 'Allow RawDrive to use Face ID for authentication.',
        },
      ],
      [
        'expo-image-picker',
        {
          photosPermission: 'Allow RawDrive to access your photos to upload to galleries.',
          cameraPermission: 'Allow RawDrive to access your camera to capture photos.',
        },
      ],
      [
        'expo-media-library',
        {
          photosPermission: 'Allow RawDrive to access your photos.',
          savePhotosPermission: 'Allow RawDrive to save photos to your gallery.',
          isAccessMediaLocationEnabled: true,
        },
      ],
      [
        'expo-notifications',
        {
          icon: './assets/notification-icon.png',
          color: '#000000',
        },
      ],
      [
        'expo-background-fetch',
        {
          stopOnTerminate: false,
          startOnBoot: true,
        },
      ],
    ],

    // Expo Updates configuration
    updates: {
      enabled: true,
      fallbackToCacheTimeout: 0,
      url: 'https://u.expo.dev/your-project-id',
    },

    // Runtime version for updates
    runtimeVersion: {
      policy: 'appVersion',
    },

    // Extra configuration passed to the app
    extra: {
      ...envConfig,
      appEnv,
      eas: {
        projectId: process.env.EAS_PROJECT_ID || 'your-eas-project-id',
      },
    },

    // Expo Router configuration
    experiments: {
      typedRoutes: true,
    },

    // Owner for EAS
    owner: 'rawdrive',
  };
};
