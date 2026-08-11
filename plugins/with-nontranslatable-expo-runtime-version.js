const { withStringsXml } = require('expo/config-plugins');

/**
 * Prevent Google Play app-string translation from localizing the technical
 * expo_runtime_version resource used by expo-updates.
 *
 * Keep this plugin registered immediately before `expo-updates` in app.config.js.
 * Expo mods execute as an interceptor chain, so `expo-updates` writes the string
 * first and this guard then marks that generated resource as non-translatable.
 */
module.exports = function withNonTranslatableExpoRuntimeVersion(config) {
  return withStringsXml(config, (config) => {
    const strings = config.modResults?.resources?.string;
    const runtimeVersionString = Array.isArray(strings)
      ? strings.find((item) => item?.$?.name === 'expo_runtime_version')
      : undefined;

    if (!runtimeVersionString) {
      throw new Error(
        '[Teswa] expo_runtime_version was not generated before the translation guard ran.'
      );
    }

    runtimeVersionString.$ = {
      ...runtimeVersionString.$,
      translatable: 'false',
    };

    return config;
  });
};
