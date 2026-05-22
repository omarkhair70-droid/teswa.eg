#!/usr/bin/env node

const checks = [
  'typescript',
  'expo',
  'expo/tsconfig.base',
  'react',
  'react-native',
];

const missing = checks.filter((name) => {
  try {
    require.resolve(name);
    return false;
  } catch {
    return true;
  }
});

if (missing.length > 0) {
  console.error('Typecheck environment is incomplete. Missing required packages/modules:');
  for (const name of missing) {
    console.error(` - ${name}`);
  }
  console.error('Run `npm ci` (or `npm install`) before running typecheck.');
  process.exit(1);
}

console.log('Typecheck environment check passed.');
