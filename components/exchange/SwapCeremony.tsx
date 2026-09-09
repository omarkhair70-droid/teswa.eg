import { useCallback, useMemo, useRef, type ElementRef } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import ViewShot from 'react-native-view-shot';
import { MotiView } from 'moti';
import * as Haptics from 'expo-haptics';
import * as Sharing from 'expo-sharing';
import { AppText } from '@/components/ui/AppText';
import { AppCard } from '@/components/ui/AppCard';
import { AppButton } from '@/components/ui/AppButton';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';

type CeremonyStatus = 'sent' | 'accepted' | 'completed';

export function SwapCeremony({ requestedItemTitle, offeredItemTitle, requestedItemImageUrl, offeredItemImageUrl, status = 'sent', onClose, onShare }: { requestedItemTitle?: string; offeredItemTitle?: string; requestedItemImageUrl?: string; offeredItemImageUrl?: string; status?: CeremonyStatus; onClose?: () => void; onShare?: () => void; }) {
  const cardRef = useRef<ElementRef<typeof ViewShot> | null>(null);
  const revealedRef = useRef(false);
  const stampText = useMemo(() => status === 'accepted' ? 'تم الاتفاق' : status === 'completed' ? 'تم التبادل' : 'العرض اتبعت', [status]);

  const handleShare = useCallback(async () => {
    if (onShare) return onShare();
    const canShare = await Sharing.isAvailableAsync();
    if (!canShare) return;
    const uri = await cardRef.current?.capture?.();
    if (!uri) return;
    const normalizedUri = uri.startsWith('file://') ? uri : `file://${uri}`;
    await Sharing.shareAsync(normalizedUri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle: 'شارك اللحظة' });
  }, [onShare]);

  const handleReveal = useCallback(() => {
    if (revealedRef.current) return;
    revealedRef.current = true;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
  }, []);

  const renderItem = (title?: string, imageUrl?: string) => <View style={styles.itemCard}>{imageUrl ? <Image source={{ uri: imageUrl }} style={styles.itemImage} /> : <View style={[styles.itemImage, styles.placeholder]} /> }<AppText numberOfLines={2} weight="semibold" style={styles.itemTitle}>{title || 'عنصر للتبديل'}</AppText></View>;

  return <MotiView from={{ opacity: 0, translateY: 14 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', duration: 450 }} onDidAnimate={handleReveal}><AppCard style={styles.container}><ViewShot ref={cardRef} options={{ format: 'png', quality: 1 }} style={styles.captureBody}><AppText muted style={styles.eyebrow}>Swap Ceremony</AppText><View style={styles.row}>{renderItem(requestedItemTitle, requestedItemImageUrl)}<MotiView from={{ opacity: 0.3, scale: 0.9 }} animate={{ opacity: 1, scale: 1.05 }} transition={{ type: 'timing', duration: 1200, loop: true }} style={styles.connector} />{renderItem(offeredItemTitle, offeredItemImageUrl)}</View><View style={styles.stamp}><AppText weight="bold" style={styles.stampText}>{stampText}</AppText></View></ViewShot><View style={styles.actions}><AppButton label="شارك اللحظة" onPress={() => { void handleShare(); }} /><Pressable onPress={onClose} disabled={!onClose}><AppText muted>راجع تفاصيل العرض</AppText></Pressable></View></AppCard></MotiView>;
}

const styles = StyleSheet.create({ container: { gap: spacing.md, overflow: 'hidden' }, captureBody: { gap: spacing.md }, eyebrow: { textAlign: 'center' }, row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, itemCard: { flex: 1, borderRadius: radii.lg, backgroundColor: '#f7f8ff', padding: spacing.sm, gap: spacing.xs }, itemImage: { width: '100%', height: 92, borderRadius: radii.md, backgroundColor: '#d9deef' }, placeholder: { borderWidth: 1, borderColor: '#c3cde6', borderStyle: 'dashed' }, itemTitle: { fontSize: 13, textAlign: 'center' }, connector: { width: 38, height: 6, borderRadius: 999, backgroundColor: colors.primary }, stamp: { alignSelf: 'center', borderRadius: 999, borderWidth: 1, borderColor: '#c9ab52', backgroundColor: '#fff8df', paddingHorizontal: spacing.lg, paddingVertical: spacing.xs }, stampText: { color: '#7a5a0d' }, actions: { gap: spacing.sm } });
