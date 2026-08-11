import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { AppScreen } from '@/components/ui/AppScreen';
import { AppText } from '@/components/ui/AppText';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';
import type { LegalDocument } from '@/lib/legal-content';

type Props = { document: LegalDocument };

export function LegalDocumentScreen({ document }: Props) {
  return (
    <AppScreen scrollable backgroundVariant="alive">
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="رجوع" onPress={() => router.back()} style={styles.backButton}><Ionicons name="chevron-forward" size={20} color={colors.text} /></Pressable>
        <View style={styles.headerCopy}><AppText muted style={styles.eyebrow}>معلومات تِسوى</AppText><AppText weight="bold" style={styles.title}>{document.title}</AppText><AppText muted style={styles.subtitle}>{document.subtitle}</AppText></View>
      </View>

      <View style={styles.updatedCard}>
        <View style={styles.updatedIcon}><Ionicons name="document-text-outline" size={20} color={colors.primary} /></View>
        <View style={styles.updatedCopy}><AppText muted style={styles.eyebrow}>آخر تحديث</AppText><AppText weight="semibold">{document.lastUpdated}</AppText></View>
        <View style={styles.readingPill}><Ionicons name="shield-checkmark-outline" size={14} color={colors.accent} /><AppText style={styles.readingPillText}>معلومة واضحة</AppText></View>
      </View>

      <View style={styles.documentSurface}>
        {document.sections.map((section, index) => (
          <View key={section.heading} style={[styles.section, index < document.sections.length - 1 && styles.sectionBorder]}>
            <View style={styles.sectionHeadingRow}><View style={styles.sectionNumber}><AppText weight="bold" style={styles.sectionNumberText}>{index + 1}</AppText></View><AppText weight="bold" style={styles.sectionHeading}>{section.heading}</AppText></View>
            <View style={styles.sectionBody}>
              {section.paragraphs?.map((paragraph) => <AppText key={paragraph} style={styles.paragraph}>{paragraph}</AppText>)}
              {section.bullets?.map((bullet) => (
                <View key={bullet} style={styles.bulletRow}><View style={styles.bulletDot} /><AppText style={styles.bulletText}>{bullet}</AppText></View>
              ))}
            </View>
          </View>
        ))}
      </View>

      {document.contactLabel ? (
        <Pressable accessibilityRole="button" accessibilityLabel="التواصل مع تِسوى بالبريد" onPress={() => Linking.openURL(`mailto:${document.contactLabel}`)} style={({ pressed }) => [styles.contactCard, pressed && styles.pressed]}>
          <View style={styles.contactIcon}><Ionicons name="mail-outline" size={21} color={colors.primary} /></View>
          <View style={styles.contactCopy}><AppText muted style={styles.eyebrow}>عندك سؤال؟</AppText><AppText weight="bold">تواصل مع تِسوى</AppText><AppText muted style={styles.contactEmail}>{document.contactLabel}</AppText></View>
          <Ionicons name="chevron-back" size={18} color={colors.textMuted} />
        </Pressable>
      ) : null}

      <View style={styles.footerNote}><Ionicons name="information-circle-outline" size={18} color={colors.textMuted} /><AppText muted style={styles.footerText}>النص ده جزء من قواعد استخدام تِسوى. لو تغيرت السياسة أو الشروط بشكل مهم، هنحدث تاريخ الوثيقة والمحتوى هنا.</AppText></View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: spacing.md },
  backButton: { width: 42, height: 42, borderRadius: radii.round, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  headerCopy: { flex: 1, alignItems: 'flex-end', gap: 3 },
  eyebrow: { fontSize: 12 },
  title: { fontSize: 27, lineHeight: 35, textAlign: 'right' },
  subtitle: { lineHeight: 21, textAlign: 'right' },
  updatedCard: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radii.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  updatedIcon: { width: 44, height: 44, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft },
  updatedCopy: { flex: 1, alignItems: 'flex-end', gap: 2 },
  readingPill: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 5, borderRadius: radii.round, backgroundColor: colors.accentSoft },
  readingPillText: { color: colors.accent, fontSize: 10 },
  documentSurface: { borderRadius: radii.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  section: { gap: spacing.md, padding: spacing.lg },
  sectionBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  sectionHeadingRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm },
  sectionNumber: { width: 30, height: 30, borderRadius: radii.round, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft },
  sectionNumberText: { color: colors.primary, fontSize: 12 },
  sectionHeading: { flex: 1, fontSize: 17, textAlign: 'right' },
  sectionBody: { gap: spacing.sm, paddingRight: 38 },
  paragraph: { lineHeight: 23, textAlign: 'right' },
  bulletRow: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: spacing.sm },
  bulletDot: { width: 6, height: 6, borderRadius: radii.round, backgroundColor: colors.primary, marginTop: 8 },
  bulletText: { flex: 1, lineHeight: 22, textAlign: 'right' },
  contactCard: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radii.xl, backgroundColor: colors.primarySoft },
  contactIcon: { width: 44, height: 44, borderRadius: radii.round, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  contactCopy: { flex: 1, alignItems: 'flex-end', gap: 2 },
  contactEmail: { fontSize: 11 },
  footerNote: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: spacing.sm, padding: spacing.md, borderRadius: radii.lg, backgroundColor: colors.background },
  footerText: { flex: 1, fontSize: 11, lineHeight: 18, textAlign: 'right' },
  pressed: { opacity: 0.72 },
});
