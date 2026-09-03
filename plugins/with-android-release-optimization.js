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
 * Expo SDK 57 release optimization.
 *
 * SDK 57 generates the modern Android release baseline with
 * proguard-android-optimize.txt. This plugin only opts the generated release
 * build into minification and resource shrinking; it does not rewrite
 * build.gradle or inject SDK-55-era ProGuard behavior.
 */
module.exports = function withAndroidReleaseOptimization(config) {
  return withGradleProperties(config, (config) => {
    for (const [key, value] of Object.entries(RELEASE_OPTIMIZATION_PROPERTIES)) {
      setGradleProperty(config.modResults, key, value);
    }

    return config;
  });
};
