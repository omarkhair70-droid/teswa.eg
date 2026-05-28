import { I18nManager } from 'react-native';
import * as Localization from 'expo-localization';
import { getString, setString } from '@/lib/storage/mmkv-storage';

export type TeswaLanguage = 'ar' | 'en';
export type LanguagePreference = TeswaLanguage | 'system';

const LANGUAGE_STORAGE_KEY = 'teswa:language-preference:v1';
const SUPPORTED_LANGUAGES: readonly TeswaLanguage[] = ['ar', 'en'];
const LANGUAGE_PREFERENCES: readonly LanguagePreference[] = ['ar', 'en', 'system'];

type TranslationKey =
  | 'settings.title'
  | 'settings.appearance'
  | 'settings.language'
  | 'settings.notifications'
  | 'settings.privacySafety'
  | 'settings.account'
  | 'settings.about';

const translations: Record<TeswaLanguage, Record<TranslationKey, string>> = {
  ar: {
    'settings.title': 'الإعدادات',
    'settings.appearance': 'المظهر',
    'settings.language': 'اللغة',
    'settings.notifications': 'الإشعارات',
    'settings.privacySafety': 'الخصوصية والأمان',
    'settings.account': 'الحساب',
    'settings.about': 'عن تِسوى',
  },
  en: {
    'settings.title': 'Settings',
    'settings.appearance': 'Appearance',
    'settings.language': 'Language',
    'settings.notifications': 'Notifications',
    'settings.privacySafety': 'Privacy & Safety',
    'settings.account': 'Account',
    'settings.about': 'About Teswa',
  },
};

function isLanguagePreference(value: string | null): value is LanguagePreference {
  return LANGUAGE_PREFERENCES.includes(value as LanguagePreference);
}

function normalizeLanguage(languageCode?: string | null): TeswaLanguage | null {
  const normalized = languageCode?.toLowerCase().split('-')[0];
  return SUPPORTED_LANGUAGES.includes(normalized as TeswaLanguage) ? normalized as TeswaLanguage : null;
}

export function getLanguagePreference(): LanguagePreference {
  const stored = getString(LANGUAGE_STORAGE_KEY);
  return isLanguagePreference(stored) ? stored : 'ar';
}

export function setLanguagePreference(nextPreference: LanguagePreference): void {
  setString(LANGUAGE_STORAGE_KEY, nextPreference);
}

export function getSystemLanguage(): TeswaLanguage {
  const localeLanguage = normalizeLanguage(Localization.getLocales()[0]?.languageCode);
  return localeLanguage ?? 'ar';
}

export function getResolvedLanguage(preference: LanguagePreference = getLanguagePreference()): TeswaLanguage {
  if (preference === 'system') return getSystemLanguage();
  return preference;
}

export function t(key: TranslationKey, language: TeswaLanguage = getResolvedLanguage()): string {
  return translations[language][key] ?? translations.ar[key] ?? key;
}

export function getCurrentLayoutDirectionNote(): string {
  return I18nManager.isRTL
    ? 'التطبيق يعمل حاليًا باتجاه RTL. تغيير الاتجاه بين العربية والإنجليزية قد يحتاج إعادة تشغيل التطبيق.'
    : 'The app is currently running LTR. Switching between Arabic and English layout direction may require an app restart.';
}

export { LANGUAGE_STORAGE_KEY, SUPPORTED_LANGUAGES };
