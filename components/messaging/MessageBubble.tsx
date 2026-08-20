import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import * as Haptics from 'expo-haptics';

import { AppText } from '@/components/ui/AppText';
import type { TeswaThemeColors } from '@/constants/themes';
import { useTeswaStyles } from '@/lib/theme/use-teswa-theme';

type BubbleReaction = { key: string; label: string; count: number; active?: boolean };

type MessageBubbleProps = {
  mine: boolean;
  text?: string | null;
  timeLabel?: string | null;
  statusLabel?: string | null;
  replyLabel?: string | null;
  replyText?: string | null;
  reactions?: BubbleReaction[];
  onLongPress?: () => void;
  children?: ReactNode;
  deleted?: boolean;
};

const createStyles = (colors: TeswaThemeColors) => ({
  row: { width: '100%' as const, flexDirection: 'row' as const, paddingHorizontal: 10 },
  rowMine: { justifyContent: 'flex-end' as const },
  rowOther: { justifyContent: 'flex-start' as const },
  pressable: { maxWidth: '82%' as const },
  bubble: { minWidth: 70, gap: 7, paddingHorizontal: 13, paddingTop: 9, paddingBottom: 7 },
  mine: { backgroundColor: colors.primary, borderRadius: 20, borderBottomRightRadius: 6 },
  other: { backgroundColor: colors.surface, borderWidth: 0.5, borderColor: colors.border, borderRadius: 20, borderBottomLeftRadius: 6 },
  text: { color: colors.text, fontSize: 15.5, lineHeight: 21, textAlign: 'right' as const },
  mineText: { color: colors.white },
  deletedText: { color: colors.textMuted, fontStyle: 'italic' as const, fontSize: 13 },
  reply: { gap: 2, borderRadius: 11, paddingHorizontal: 9, paddingVertical: 7, borderRightWidth: 3 },
  replyMine: { backgroundColor: 'rgba(255,255,255,0.10)', borderRightColor: 'rgba(255,255,255,0.52)' },
  replyOther: { backgroundColor: colors.background, borderRightColor: colors.primary },
  replyLabel: { fontSize: 11, color: colors.primary, textAlign: 'right' as const },
  mineReplyLabel: { color: colors.white },
  replyText: { fontSize: 12, color: colors.textMuted, textAlign: 'right' as const },
  metaRow: { flexDirection: 'row-reverse' as const, alignItems: 'center' as const, gap: 5, minHeight: 14 },
  meta: { fontSize: 10.5, color: colors.textMuted, fontVariant: ['tabular-nums'] as ('tabular-nums')[] },
  status: { marginRight: 'auto' as const },
  mineMuted: { color: 'rgba(255,255,255,0.70)' },
  reactions: { position: 'absolute' as const, bottom: -13, flexDirection: 'row' as const, gap: 4 },
  reactionsMine: { right: 7 },
  reactionsOther: { left: 7 },
  reactionChip: { minHeight: 24, paddingHorizontal: 7, borderRadius: 12, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: colors.surface, borderWidth: 0.5, borderColor: colors.border },
  reactionActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  reactionText: { fontSize: 11 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.992 }] },
});

export function MessageBubble({
  mine,
  text,
  timeLabel,
  statusLabel,
  replyLabel,
  replyText,
  reactions = [],
  onLongPress,
  children,
  deleted = false,
}: MessageBubbleProps) {
  const styles = useTeswaStyles(createStyles);
  const visibleReactions = reactions.filter((reaction) => reaction.count > 0);
  return (
    <View style={[styles.row, mine ? styles.rowMine : styles.rowOther]}>
      <Pressable
        disabled={!onLongPress}
        delayLongPress={200}
        onLongPress={onLongPress ? () => {
          void Haptics.selectionAsync().catch(() => undefined);
          onLongPress();
        } : undefined}
        style={({ pressed }) => [styles.pressable, pressed && onLongPress && styles.pressed]}
      >
        <View style={[styles.bubble, mine ? styles.mine : styles.other]}>
          {replyText ? (
            <View style={[styles.reply, mine ? styles.replyMine : styles.replyOther]}>
              {replyLabel ? <AppText weight="semibold" style={[styles.replyLabel, mine && styles.mineReplyLabel]} numberOfLines={1}>{replyLabel}</AppText> : null}
              <AppText style={[styles.replyText, mine && styles.mineMuted]} numberOfLines={2}>{replyText}</AppText>
            </View>
          ) : null}
          {deleted ? (
            <AppText style={[styles.deletedText, mine && styles.mineMuted]}>تم حذف الرسالة</AppText>
          ) : (
            <>
              {text?.trim() ? <AppText style={[styles.text, mine && styles.mineText]}>{text.trim()}</AppText> : null}
              {children}
            </>
          )}
          <View style={styles.metaRow}>
            {timeLabel ? <AppText style={[styles.meta, mine && styles.mineMuted]}>{timeLabel}</AppText> : null}
            {mine && statusLabel ? <AppText style={[styles.meta, styles.status, styles.mineMuted]}>{statusLabel}</AppText> : null}
          </View>
        </View>
        {visibleReactions.length ? (
          <View style={[styles.reactions, mine ? styles.reactionsMine : styles.reactionsOther]}>
            {visibleReactions.map((reaction) => (
              <View key={reaction.key} style={[styles.reactionChip, reaction.active && styles.reactionActive]}>
                <AppText style={styles.reactionText}>{reaction.label}{reaction.count > 1 ? ` ${reaction.count}` : ''}</AppText>
              </View>
            ))}
          </View>
        ) : null}
      </Pressable>
    </View>
  );
}
