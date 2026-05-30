module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      [
        'module-resolver',
        {
          root: ['.'],
          alias: {
            '@': './src',
            '@theme': './src/theme',
            '@services': './src/services',
            '@store': './src/store',
            '@hooks': './src/hooks',
            '@components': './src/components',
            '@utils': './src/utils',
            '@models': './src/types',
          },
        },
      ],
      'react-native-reanimated/plugin',
    ],
  };
};
