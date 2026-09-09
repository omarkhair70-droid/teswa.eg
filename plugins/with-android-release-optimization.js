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

function enableOptimizedProguardDefaults(buildGradle) {
  const legacy = 'getDefaultProguardFile("proguard-android.txt")';
  const optimized = 'getDefaultProguardFile("proguard-android-optimize.txt")';

  if (buildGradle.includes(optimized)) {
    return buildGradle;
  }

  if (!buildGradle.includes(legacy)) {
    throw new Error(
      '[with-android-release-optimization] Could not locate the generated release ProGuard baseline.'
    );
  }

  return buildGradle.replace(legacy, optimized);
}

/**
 * Teswa SDK 57 optimized release configuration.
 *
 * Expo 57.0.19 currently generates proguard-android.txt in the CNG Android
 * template. For the modernization branch, opt release builds into minification
 * and resource shrinking and switch only that generated default baseline to
 * Android's optimized ProGuard configuration. Runtime acceptance still requires
 * device smoke and Play-signed Internal proof before production promotion.
 */
module.exports = function withAndroidReleaseOptimization(config) {
  config = withGradleProperties(config, (config) => {
    for (const [key, value] of Object.entries(RELEASE_OPTIMIZATION_PROPERTIES)) {
      setGradleProperty(config.modResults, key, value);
    }

    return config;
  });

  config = withAppBuildGradle(config, (config) => {
    config.modResults.contents = enableOptimizedProguardDefaults(
      config.modResults.contents
    );
    return config;
  });

  return config;
};
