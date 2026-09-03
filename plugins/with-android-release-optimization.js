const { withGradleProperties } = require('expo/config-plugins');

const SAFE_RELEASE_PROPERTIES = {
  // Emergency runtime hotfix: keep release bytecode/resources intact until
  // native keep rules are validated against a production-signed build.
  'android.enableMinifyInReleaseBuilds': 'false',
  'android.enableShrinkResourcesInReleaseBuilds': 'false',
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
 * Emergency safe release mode.
 *
 * The previous production candidate enabled R8 full optimization and showed
 * widespread runtime regressions across native-backed surfaces. Until keep
 * rules are proven with device smoke tests, disable minification and resource
 * shrinking so release behavior matches the pre-R8 production baseline.
 */
module.exports = function withAndroidReleaseOptimization(config) {
  return withGradleProperties(config, (config) => {
    for (const [key, value] of Object.entries(SAFE_RELEASE_PROPERTIES)) {
      setGradleProperty(config.modResults, key, value);
    }

    return config;
  });
};
