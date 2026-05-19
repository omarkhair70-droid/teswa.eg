import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { AppScreen } from '@/components/ui/AppScreen';
import { AppText } from '@/components/ui/AppText';
import { AppCard } from '@/components/ui/AppCard';
import { spacing } from '@/constants/spacing';
import type { LegalDocument } from '@/lib/legal-content';

type Props = {
  document: LegalDocument;
};

export function LegalDocumentScreen({ document }: Props) {
  return (
    <AppScreen scrollable>
      <View style={styles.content}>
        <AppText weight="bold" style={styles.title}>{document.title}</AppText>
        <AppText muted>{document.subtitle}</AppText>
        <AppText muted>{document.lastUpdated}</AppText>

        {document.sections.map((section) => (
          <AppCard key={section.heading}>
            <View style={styles.section}>
              <AppText weight="semibold">{section.heading}</AppText>
              {section.paragraphs?.map((paragraph) => (
                <AppText key={paragraph}>{paragraph}</AppText>
              ))}
              {section.bullets?.map((bullet) => (
                <View key={bullet} style={styles.bulletRow}>
                  <AppText>•</AppText>
                  <AppText style={styles.bulletText}>{bullet}</AppText>
                </View>
              ))}
            </View>
          </AppCard>
        ))}

        {document.contactLabel ? (
          <Pressable onPress={() => Linking.openURL(`mailto:${document.contactLabel}`)}>
            <AppCard>
              <View style={styles.section}>
                <AppText weight="semibold">Contact</AppText>
                <AppText>{document.contactLabel}</AppText>
              </View>
            </AppCard>
          </Pressable>
        ) : null}
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md, paddingBottom: spacing.xxl },
  title: { fontSize: 24 },
  section: { gap: spacing.sm },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs },
  bulletText: { flex: 1 },
});
