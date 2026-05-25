import { useCallback, useEffect, useState, type RefObject } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import type { BottomSheetModal } from '@gorhom/bottom-sheet';
import { AppBottomSheet } from '@/components/sheets/AppBottomSheet';
import { AppText } from '@/components/ui/AppText';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';
import { fetchMyDirectConversations, type DirectConversationSummary } from '@/lib/direct-messages';

type Props = {
  sheetRef: RefObject<BottomSheetModal | null>;
  isSending: boolean;
  refreshKey: number;
  onSelectConversation: (conversation: DirectConversationSummary) => void;
};

const statusMap: Record<DirectConversationSummary['status'], string> = {
  accepted: 'مقبولة',
  requested: 'طلب',
  ignored: 'متجاهلة',
  blocked: 'محظورة',
};

export function DolabConversationPickerSheet({ sheetRef, isSending, refreshKey, onSelectConversation }: Props) {
  const [isLoading, setIsLoading] = useState(false);
  const [conversations, setConversations] = useState<DirectConversationSummary[]>([]);

  const loadConversations = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await fetchMyDirectConversations();
      setConversations(data);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadConversations();
  }, [loadConversations, refreshKey]);

  return (
    <AppBottomSheet
      ref={sheetRef}
      title="اختار محادثة"
      description="اختار شات حقيقي لإرسال رسالة الدولاب."
      titleIconName="chatbubbles-outline"
      snapPoints={['70%']}
    >
      <ScrollView contentContainerStyle={styles.container}>
        {isLoading ? <AppText muted>جاري تحميل المحادثات...</AppText> : null}
        {!isLoading && conversations.length === 0 ? (
          <AppText muted>لسه مفيش محادثات متاحة للمشاركة.</AppText>
        ) : null}
        {conversations.map((conversation) => {
          const displayName = conversation.otherDisplayName || conversation.otherUsername || 'مستخدم';
          const isSendable = conversation.status === 'accepted';

          return (
            <Pressable
              key={conversation.conversationId}
              accessibilityRole="button"
              accessibilityLabel={`اختيار محادثة مع ${displayName}`}
              disabled={!isSendable || isSending}
              onPress={() => onSelectConversation(conversation)}
              style={[styles.row, (!isSendable || isSending) && styles.rowDisabled]}
            >
              <View style={styles.rowHeader}>
                <AppText weight="semibold">{displayName}</AppText>
                <View style={styles.badge}>
                  <AppText style={styles.badgeText}>{statusMap[conversation.status]}</AppText>
                </View>
              </View>
              {conversation.lastMessageBody ? (
                <AppText muted numberOfLines={1}>
                  {conversation.lastMessageBody}
                </AppText>
              ) : null}
              {!isSendable ? (
                <AppText style={styles.helper}>غير متاح للإرسال قبل قبول المحادثة.</AppText>
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </AppBottomSheet>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
    paddingBottom: spacing.xl,
  },
  row: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: spacing.sm,
    gap: 4,
  },
  rowDisabled: {
    opacity: 0.55,
  },
  rowHeader: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  badge: {
    backgroundColor: colors.primarySoft,
    borderRadius: radii.round,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
  },
  badgeText: {
    fontSize: 11,
    color: colors.primary,
  },
  helper: {
    fontSize: 12,
    color: colors.textMuted,
  },
});
