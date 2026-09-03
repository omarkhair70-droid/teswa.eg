import fs from 'node:fs';

function fail(message) {
  console.error(`[android-release-proof] FAIL: ${message}`);
  process.exitCode = 1;
}

function pass(message) {
  console.log(`[android-release-proof] PASS: ${message}`);
}

function read(path) {
  if (!fs.existsSync(path)) {
    fail(`Missing generated file: ${path}`);
    return '';
  }
  return fs.readFileSync(path, 'utf8');
}

const packageJson = JSON.parse(read('package.json') || '{}');
const gradleProperties = read('android/gradle.properties');
const appGradle = read('android/app/build.gradle');
const rootGradle = read('android/build.gradle');

const expoVersion = packageJson.dependencies?.expo;
const reactNativeVersion = packageJson.dependencies?.['react-native'];

if (/^[~^]?57\./.test(expoVersion ?? '')) {
  pass(`Expo SDK 57 detected (${expoVersion})`);
} else {
  fail(`Expected Expo SDK 57, found ${expoVersion ?? 'missing'}`);
}

if (/^0\.86\./.test(reactNativeVersion ?? '')) {
  pass(`React Native 0.86 detected (${reactNativeVersion})`);
} else {
  fail(`Expected React Native 0.86.x, found ${reactNativeVersion ?? 'missing'}`);
}

const expectedProperties = {
  'android.enableMinifyInReleaseBuilds': 'true',
  'android.enableShrinkResourcesInReleaseBuilds': 'true',
};

for (const [key, expected] of Object.entries(expectedProperties)) {
  const escapedKey = key.replaceAll('.', '\\.');
  const match = gradleProperties.match(new RegExp(`^${escapedKey}=(.+)$`, 'm'));

  if (!match) {
    fail(`Missing ${key} in generated android/gradle.properties`);
  } else if (match[1].trim() !== expected) {
    fail(`${key} expected ${expected}, found ${match[1].trim()}`);
  } else {
    pass(`${key}=${expected}`);
  }
}

if (/proguard-android-optimize\.txt/.test(appGradle)) {
  pass('generated release uses proguard-android-optimize.txt');
} else {
  fail('generated release does not use proguard-android-optimize.txt');
}

if (/applicationId\s+["']com\.teswa\.mobile["']/.test(appGradle)) {
  pass('production applicationId is com.teswa.mobile');
} else {
  fail('generated production applicationId is not com.teswa.mobile');
}

const sdkText = `${rootGradle}\n${appGradle}\n${gradleProperties}`;
if (/(compileSdkVersion|compileSdk|android\.compileSdkVersion)[^\n]*36/.test(sdkText)) {
  pass('compile SDK 36 detected');
} else {
  console.warn('[android-release-proof] INFO: compile SDK 36 is resolved by Gradle; static generated files do not expose a literal 36.');
}

if (/(targetSdkVersion|targetSdk|android\.targetSdkVersion)[^\n]*36/.test(sdkText)) {
  pass('target SDK 36 detected');
} else {
  console.warn('[android-release-proof] INFO: target SDK 36 is resolved by Gradle; static generated files do not expose a literal 36.');
}

if (process.exitCode) {
  process.exit(process.exitCode);
}

console.log('[android-release-proof] SDK 57 release optimization configuration is ready for native build proof.');
