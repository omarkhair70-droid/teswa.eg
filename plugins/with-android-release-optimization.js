const { withAppBuildGradle, withGradleProperties } = require('expo/config-plugins');

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
function withOptimizedProguardDefaults(config) {
  return withAppBuildGradle(config, (config) => {
    if (config.modResults.language !== 'groovy') {
      throw new Error(
        '[with-android-release-optimization] Expected Groovy app/build.gradle.'
      );
    }

    const legacyDefault = 'getDefaultProguardFile("proguard-android.txt")';
    const optimizedDefault = 'getDefaultProguardFile("proguard-android-optimize.txt")';
    const contents = config.modResults.contents;

    if (contents.includes(optimizedDefault)) {
      return config;
    }

    if (!contents.includes(legacyDefault)) {
      throw new Error(
        '[with-android-release-optimization] Could not locate Expo release ProGuard defaults. Refusing to silently ship an unverified R8 configuration.'
      );
    }

    config.modResults.contents = contents.replace(legacyDefault, optimizedDefault);
    return config;
  });
}

module.exports = function withAndroidReleaseOptimization(config) {
  config = withGradleProperties(config, (config) => {
    for (const [key, value] of Object.entries(RELEASE_OPTIMIZATION_PROPERTIES)) {
      setGradleProperty(config.modResults, key, value);
    }

    return config;
  });

  config = withOptimizedProguardDefaults(config);
  return config;
};
