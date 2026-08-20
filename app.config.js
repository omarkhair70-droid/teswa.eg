const fs = require('fs');

const APP_VARIANT = process.env.APP_VARIANT;
const IS_PREVIEW = APP_VARIANT === 'preview';
const hasPreviewGoogleServices = fs.existsSync('./google-services.preview.json');
const sentryOrg = process.env.SENTRY_ORG;
const sentryProject = process.env.SENTRY_PROJECT;

module.exports = {
  expo: {
    name: IS_PREVIEW ? 'Teswa Preview' : 'Teswa',
    slug: 'teswa-mobile',
    owner: 'omarkhair70-droids-organization',
    scheme: IS_PREVIEW ? 'teswa-preview' : 'teswa',
    version: '1.0.10',
    orientation: 'portrait',
    icon: './assets/branding/icon.png',
    userInterfaceStyle: 'automatic',
    ios: {
      supportsTablet: true,
    },
    android: {
      package: IS_PREVIEW ? 'com.teswa.mobile.preview' : 'com.teswa.mobile',
      ...(IS_PREVIEW
        ? (hasPreviewGoogleServices
          ? { googleServicesFile: './google-services.preview.json' }
          : {})
        : { googleServicesFile: './google-services.json' }),
      adaptiveIcon: {
        foregroundImage: './assets/branding/adaptive-icon-foreground.png',
        backgroundColor: '#B8623F',
        monochromeImage: './assets/branding/monochrome-icon.png',
      },
      permissions: ['android.permission.RECORD_AUDIO'],
    },
    androidStatusBar: {
      barStyle: 'dark-content',
      backgroundColor: '#F9F3EA',
      translucent: false,
    },
    web: {
      bundler: 'metro',
      output: 'static',
    },
    plugins: [
      [
        '@sentry/react-native/expo',
        {
          url: 'https://sentry.io/',
          organization: sentryOrg,
          project: sentryProject,
        },
      ],
      'expo-router',
      [
        'expo-image-picker',
        {
          photosPermission: 'نحتاج الوصول للصور لاختيار صور العنصر قبل نشره.',
        },
      ],
      'expo-notifications',
      [
        'expo-location',
        {
          locationWhenInUsePermission: 'نحتاج إذن الموقع لتحسين اكتشاف العناصر القريبة منك.',
        },
      ],
      'react-native-compressor',
      [
        'expo-share-intent',
        {
          disableIOS: true,
          androidIntentFilters: ['image/*'],
          androidMultiIntentFilters: ['image/*'],
        },
      ],
      'expo-image',
      [
        'expo-audio',
        {
          microphonePermission: 'نحتاج إذن الميكروفون لتسجيل الرسائل الصوتية داخل تِسوى.',
          recordAudioAndroid: true,
          enableBackgroundRecording: false,
          enableBackgroundPlayback: false,
        },
      ],
      [
        'expo-camera',
        {
          cameraPermission: 'نحتاج إذن الكاميرا لتصوير العناصر والقصص داخل تِسوى.',
          microphonePermission: 'نحتاج إذن الميكروفون لتسجيل الفيديو بالصوت داخل تِسوى.',
          recordAudioAndroid: true,
          barcodeScannerEnabled: false,
        },
      ],
      [
        'expo-local-authentication',
        {
          faceIDPermission: 'نستخدم التحقق البيومتري لحماية حسابك داخل تِسوى.',
        },
      ],
      'expo-video',
      'expo-sqlite',
      'expo-background-task',
      '@react-native-google-signin/google-signin',
      [
        'expo-secure-store',
        {
          configureAndroidBackup: true,
          faceIDPermission: 'نستخدم التحقق البيومتري لحماية بياناتك المحلية داخل تِسوى.',
        },
      ],
      [
        'expo-media-library',
        {
          photosPermission: 'نحتاج الوصول إلى صورك وفيديوهاتك عند استخدام ميزات الحفظ أو إدارة الوسائط داخل تِسوى.',
          savePhotosPermission: 'نحتاج الإذن لحفظ الصور أو الفيديوهات التي تطلب حفظها من تِسوى.',
          isAccessMediaLocationEnabled: false,
          granularPermissions: ['photo', 'video'],
        },
      ],
      [
        'expo-splash-screen',
        {
          backgroundColor: '#F9F3EA',
          image: './assets/branding/splash-mark.png',
          imageWidth: 180,
          resizeMode: 'contain',
        },
      ],
      'expo-font',
      'expo-asset',
      'expo-localization',
      'expo-web-browser',
      'expo-sharing',
      // Expo mods run as an interceptor chain. Register the guard first so it
      // executes after expo-updates writes expo_runtime_version to strings.xml.
      './plugins/with-nontranslatable-expo-runtime-version',
      'expo-updates',
    ],
    runtimeVersion: {
      policy: 'appVersion',
    },
    updates: {
      url: 'https://u.expo.dev/494945c6-ca94-41c5-afb6-45b9119915ff',
      enabled: true,
      checkAutomatically: 'ON_LOAD',
      fallbackToCacheTimeout: 0,
    },
    extra: {
      eas: {
        projectId: '494945c6-ca94-41c5-afb6-45b9119915ff',
      },
    },
  },
};
