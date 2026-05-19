import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { AppScreen } from '@/components/ui/AppScreen';
import { AppText } from '@/components/ui/AppText';
import { AppCard } from '@/components/ui/AppCard';
import { spacing } from '@/constants/spacing';
import { accountDeletionContent, TESWA_SUPPORT_EMAIL } from '@/lib/legal-content';

const MAILTO_LINK = `mailto:${TESWA_SUPPORT_EMAIL}?subject=${encodeURIComponent(accountDeletionContent.emailSubject)}`;

export default function AccountDeletionRoute() {
  return (
    <AppScreen scrollable>
      <View style={styles.content}>
        <AppText weight="bold" style={styles.title}>{accountDeletionContent.title}</AppText>
        <AppText>{accountDeletionContent.subtitle}</AppText>
        <AppText muted>{accountDeletionContent.lastUpdated}</AppText>

        <AppCard>
          <View style={styles.group}>
            <AppText weight="semibold">Delete in-app</AppText>
            <AppText>{accountDeletionContent.inAppPath}</AppText>
          </View>
        </AppCard>

        <Pressable onPress={() => Linking.openURL(MAILTO_LINK)}>
          <AppCard>
            <View style={styles.group}>
              <AppText weight="semibold">Start deletion by email (web)</AppText>
              <AppText>{TESWA_SUPPORT_EMAIL}</AppText>
              <AppText muted>Subject: {accountDeletionContent.emailSubject}</AppText>
            </View>
          </AppCard>
        </Pressable>

        <AppCard>
          <View style={styles.group}>
            <AppText weight="semibold">What to include in your request</AppText>
            {accountDeletionContent.requestItems.map((item) => (
              <View key={item} style={styles.row}><AppText>•</AppText><AppText style={styles.rowText}>{item}</AppText></View>
            ))}
          </View>
        </AppCard>

        <AppCard>
          <View style={styles.group}>
            <AppText weight="semibold">Security reminders</AppText>
            {accountDeletionContent.securityWarnings.map((item) => (
              <View key={item} style={styles.row}><AppText>•</AppText><AppText style={styles.rowText}>{item}</AppText></View>
            ))}
          </View>
        </AppCard>

        <AppCard>
          <View style={styles.group}>
            <AppText weight="semibold">What deletion generally covers</AppText>
            {accountDeletionContent.deletionCoverage.map((item) => (
              <View key={item} style={styles.row}><AppText>•</AppText><AppText style={styles.rowText}>{item}</AppText></View>
            ))}
            <AppText muted>{accountDeletionContent.retentionNote}</AppText>
          </View>
        </AppCard>
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md, paddingBottom: spacing.xxl },
  title: { fontSize: 24 },
  group: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs },
  rowText: { flex: 1 },
});
