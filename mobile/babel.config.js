module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // Required for Expo Router
      'expo-router/babel',
      // Required for React Native Reanimated
      'react-native-reanimated/plugin',
      // Module resolver for path aliases
      [
        'module-resolver',
        {
          root: ['.'],
          alias: {
            '@': './src',
            '@components': './src/components',
            '@screens': './src/screens',
            '@services': './src/services',
            '@hooks': './src/hooks',
            '@utils': './src/utils',
            '@contexts': './src/contexts',
            '@database': './src/database',
            '@providers': './src/providers',
            '@constants': './src/constants',
            '@types': './src/types',
            '@assets': './assets',
          },
        },
      ],
    ],
  };
};
