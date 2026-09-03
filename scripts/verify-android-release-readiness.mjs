import fs from 'node:fs';

function fail(message) {
  console.error(`[android-release-readiness] FAIL: ${message}`);
  process.exitCode = 1;
}

function pass(message) {
  console.log(`[android-release-readiness] PASS: ${message}`);
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

const expoVersion = packageJson.dependencies?.expo;
if (/^~?55\./.test(expoVersion ?? '')) {
  pass(`Expo SDK 55 detected (${expoVersion})`);
} else {
  fail(`Expected Expo SDK 55, found ${expoVersion ?? 'missing'}`);
}

const expectedProperties = {
  'android.enableMinifyInReleaseBuilds': 'true',
  'android.enableShrinkResourcesInReleaseBuilds': 'true',
};

for (const [key, expected] of Object.entries(expectedProperties)) {
  const match = gradleProperties.match(new RegExp(`^${key.replaceAll('.', '\\.') }=(.+)$`, 'm'));
  if (!match) {
    fail(`Missing ${key} in generated android/gradle.properties`);
  } else if (match[1].trim() !== expected) {
    fail(`${key} expected ${expected}, found ${match[1].trim()}`);
  } else {
    pass(`${key}=${expected}`);
  }
}

if (/android\.enableR8\.fullMode\s*=\s*false/.test(gradleProperties)) {
  fail('R8 full mode is explicitly disabled');
} else {
  pass('R8 full mode is not disabled');
}

const gradleChecks = [
  {
    label: 'release minification consumes android.enableMinifyInReleaseBuilds',
    pattern: /minifyEnabled\s+enableMinifyInReleaseBuilds/,
  },
  {
    label: 'release resource shrinking is wired',
    pattern: /shrinkResources\s+enableShrinkResources\.toBoolean\(\)/,
  },
  {
    label: 'optimized Android ProGuard defaults are used',
    pattern: /proguard-android-optimize\.txt/,
  },
];

for (const check of gradleChecks) {
  if (check.pattern.test(appGradle)) {
    pass(check.label);
  } else {
    fail(check.label);
  }
}

if (/applicationId\s+["']com\.teswa\.mobile["']/.test(appGradle)) {
  pass('production applicationId is com.teswa.mobile');
} else {
  fail('generated production applicationId is not com.teswa.mobile');
}

if (process.exitCode) {
  process.exit(process.exitCode);
}

console.log('[android-release-readiness] Generated native release configuration is ready for an R8 release build.');
