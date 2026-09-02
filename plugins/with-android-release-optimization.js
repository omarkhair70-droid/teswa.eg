const { withGradleProperties } = require('expo/config-plugins');

const RELEASE_OPTIMIZATION_PROPERTIES = {
  'android.enableMinifyInReleaseBuilds': 'true',
  'android.enableShrinkResourcesInReleaseBuilds': 'true',
};

function setGradleProperty(items, key, value) {
  const index = items.findIndex(
    (item) => item?.type === 'property' && item?.key === key
  );

  const property = { type: 'property', key, value };

  if (index >= 0) {
    items[index] = property;
  } else {
    items.push(property);
  }
}

/**
 * Enable Android release optimization without adding another npm dependency.
 *
 * Expo SDK 55's generated Android build reads these Gradle properties to:
 * - run R8 minification/obfuscation/optimization for release builds
 * - shrink unused Android resources
 */
module.exports = function withAndroidReleaseOptimization(config) {
  return withGradleProperties(config, (config) => {
    for (const [key, value] of Object.entries(RELEASE_OPTIMIZATION_PROPERTIES)) {
      setGradleProperty(config.modResults, key, value);
    }

    return config;
  });
};
