from pathlib import Path
import re

path = Path('app/deal/[id].tsx')
text = path.read_text()


def sub_once(pattern: str, replacement: str, label: str, flags: int = 0) -> None:
    global text
    text, count = re.subn(pattern, lambda _: replacement, text, count=1, flags=flags)
    if count != 1:
        raise SystemExit(f'missing source block: {label}')


sub_once(
    r'''        <View style=\{styles\.chatHeaderWrap\}>.*?        </View>\n\n        <KeyboardAwareScrollView''',
    '''        <View style={styles.dealHeaderWrap}>
          <View style={styles.dealHeader}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="رجوع"
              style={styles.headerIconButton}
              onPress={() => router.back()}
            >
              <Ionicons name="chevron-forward" size={20} color={colors.text} />
            </Pressable>
            <Pressable
              style={styles.headerIdentity}
              onPress={() => router.push(`/profile/${deal.otherParticipant.id}`)}
            >
              {deal.otherParticipant.avatarUrl ? (
                <Image source={{ uri: deal.otherParticipant.avatarUrl }} style={styles.avatar} />
              ) : (
                <View style={styles.avatarFallback}>
                  <AppText weight="bold">{(deal.otherParticipant.displayName?.trim()?.[0] ?? "؟").toUpperCase()}</AppText>
                </View>
              )}
              <View style={styles.chatIdentity}>
                <AppText weight="bold" style={styles.chatName} numberOfLines={1}>{deal.otherParticipant.displayName ?? "مستخدم"}</AppText>
                <View style={styles.identityMetaRow}>
                  {deal.otherParticipant.username ? <AppText muted style={styles.chatUsername}>@{deal.otherParticipant.username}</AppText> : null}
                  <View style={styles.identityMetaDot} />
                  <AppText muted style={styles.chatTrust}>{deal.otherParticipant.successfulSwapsCount ?? 0} مقايضات • {formatResponseRate(deal.otherParticipant.responseRate)} رد</AppText>
                </View>
                <View style={styles.liveStatusRow}>
                  <View style={[styles.liveDot, realtimeStatus !== "live" && styles.liveDotMuted]} />
                  <AppText muted style={styles.chatStatusLine}>{realtimeLabel}</AppText>
                </View>
              </View>
            </Pressable>
            <Pressable
              style={styles.headerIconButton}
              onPress={() => dealActionsSheetRef.current?.present()}
              accessibilityRole="button"
              accessibilityLabel="فتح إجراءات الصفقة"
            >
              <Ionicons name="ellipsis-horizontal" size={20} color={colors.text} />
            </Pressable>
          </View>

          <View style={styles.dealContextCard}>
            <View style={styles.dealContextHeader}>
              <View style={styles.dealContextCopy}>
                <AppText muted style={styles.contextEyebrow}>الصفقة</AppText>
                <AppText weight="bold" style={styles.contextHeading}>تنسيق التبديل</AppText>
              </View>
              <View style={styles.dealStatusPill}><AppText style={styles.dealStatusText}>{getDealStatusLabel(deal.status)}</AppText></View>
            </View>
            <View style={styles.tradePairRow}>
              <View style={styles.tradeMiniCard}>
                {deal.requestedItem?.imageUrl ? <Image source={{ uri: deal.requestedItem.imageUrl }} style={styles.tradeMiniImage} /> : <View style={[styles.tradeMiniImage, styles.tradeMiniPlaceholder]}><Ionicons name="image-outline" size={16} color={colors.textMuted} /></View>}
                <View style={styles.tradeMiniCopy}><AppText muted style={styles.tradeMiniLabel}>المطلوب</AppText><AppText weight="semibold" numberOfLines={1}>{deal.requestedItem?.title ?? "غير متاح"}</AppText></View>
              </View>
              <View style={styles.tradeArrow}><Ionicons name="swap-horizontal" size={18} color={colors.primary} /></View>
              <View style={[styles.tradeMiniCard, styles.tradeMiniCardAccent]}>
                {deal.offeredItem?.imageUrl ? <Image source={{ uri: deal.offeredItem.imageUrl }} style={styles.tradeMiniImage} /> : <View style={[styles.tradeMiniImage, styles.tradeMiniPlaceholder]}><Ionicons name="image-outline" size={16} color={colors.textMuted} /></View>}
                <View style={styles.tradeMiniCopy}><AppText muted style={styles.tradeMiniLabel}>المعروض</AppText><AppText weight="semibold" numberOfLines={1}>{deal.offeredItem?.title ?? "غير متاح"}</AppText></View>
              </View>
            </View>
          </View>
        </View>

        <KeyboardAwareScrollView''',
    'deal header and context',
    re.S,
)

sub_once(
    r'''          \{!!error \? \(\n            <AppCard>\n              <AppText muted>\{error\}</AppText>\n            </AppCard>\n          \) : null\}\n          \{!!voiceMessage \? \(\n            <AppCard>\n              <AppText muted>\{voiceMessage\}</AppText>\n            </AppCard>\n          \) : null\}''',
    '''          {!!error ? <View style={[styles.inlineNotice, styles.errorNotice]}><Ionicons name="alert-circle-outline" size={17} color="#B42318" /><AppText style={styles.noticeErrorText}>{error}</AppText></View> : null}
          {!!voiceMessage ? <View style={styles.inlineNotice}><Ionicons name="information-circle-outline" size={17} color={colors.primary} /><AppText muted style={styles.noticeText}>{voiceMessage}</AppText></View> : null}''',
    'inline notices',
    re.S,
)

sub_once(
    r'''          \{\["coordinating", "completed_pending_confirmation"\]\.includes\(deal\.status\) \? \(\n            <AppCard style=\{styles\.compactActionGroup\}>.*?            </AppCard>\n          \) : null\}''',
    '''          {["coordinating", "completed_pending_confirmation"].includes(deal.status) ? (
            <View style={styles.completionPanel}>
              <View style={styles.completionHeader}>
                <View style={styles.completionIcon}><Ionicons name="checkmark-done-outline" size={20} color={colors.primary} /></View>
                <View style={styles.completionCopy}>
                  <AppText muted style={styles.contextEyebrow}>خطوة الصفقة</AppText>
                  <AppText weight="bold" style={styles.completionTitle}>أكدوا لما التبديل يتم</AppText>
                  <AppText muted style={styles.completionHint}>الإتمام بيتقفل لما الطرفين يأكدوا إن المقايضة حصلت فعلًا.</AppText>
                </View>
              </View>
              <View style={styles.confirmationRow}>
                <View style={[styles.confirmationChip, deal.iConfirmed && styles.confirmationChipDone]}><Ionicons name={deal.iConfirmed ? "checkmark-circle" : "ellipse-outline"} size={15} color={deal.iConfirmed ? colors.primary : colors.textMuted} /><AppText muted>{deal.iConfirmed ? "أنت أكدت" : "تأكيدك مستني"}</AppText></View>
                <View style={[styles.confirmationChip, deal.otherConfirmed && styles.confirmationChipDone]}><Ionicons name={deal.otherConfirmed ? "checkmark-circle" : "ellipse-outline"} size={15} color={deal.otherConfirmed ? colors.primary : colors.textMuted} /><AppText muted>{deal.otherConfirmed ? "الطرف التاني أكد" : "تأكيده مستني"}</AppText></View>
              </View>
              <AppButton
                label={confirming ? "جاري التأكيد..." : deal.iConfirmed ? "تم تسجيل تأكيدك" : "أكد إن المقايضة تمت"}
                onPress={() => { void confirmCompletion(); }}
                disabled={!deal.canConfirmCompletion || confirming}
              />
            </View>
          ) : null}''',
    'completion panel',
    re.S,
)

sub_once(
    r'''            <View style=\{styles\.threadTopLine\}>\n              <AppText weight="semibold">المحادثة</AppText>\n            </View>''',
    '''            <View style={styles.threadTopLine}>
              <View style={styles.threadHeadingCopy}><AppText muted style={styles.contextEyebrow}>تنسيق الصفقة</AppText><AppText weight="bold" style={styles.threadHeading}>المحادثة</AppText></View>
              <View style={styles.threadLivePill}><View style={[styles.liveDot, realtimeStatus !== "live" && styles.liveDotMuted]} /><AppText muted style={styles.threadLiveText}>{realtimeStatus === "live" ? "مباشر" : "غير متصل"}</AppText></View>
            </View>''',
    'thread heading',
)

# Replace the old header/context styles as one contiguous block.
sub_once(
    r'''  chatHeaderWrap: \{.*?  contextHint: \{ fontSize: 12 \},''',
    '''  dealHeaderWrap: { paddingHorizontal: spacing.md, paddingTop: spacing.sm, gap: spacing.sm },
  dealHeader: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.sm },
  headerIconButton: { width: 40, height: 40, borderRadius: radii.round, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  headerIdentity: { flex: 1, minHeight: 52, flexDirection: "row-reverse", gap: spacing.sm, alignItems: "center" },
  avatar: { width: 44, height: 44, borderRadius: radii.round },
  avatarFallback: { width: 44, height: 44, borderRadius: radii.round, backgroundColor: colors.primarySoft, borderWidth: 1, borderColor: '#D9B8A3', alignItems: "center", justifyContent: "center" },
  chatIdentity: { flex: 1, gap: 2, alignItems: "flex-end" },
  chatName: { fontSize: 16, color: colors.text },
  chatUsername: { fontSize: 11 },
  chatTrust: { fontSize: 10 },
  identityMetaRow: { flexDirection: "row-reverse", alignItems: "center", gap: 5 },
  identityMetaDot: { width: 3, height: 3, borderRadius: radii.round, backgroundColor: colors.border },
  liveStatusRow: { flexDirection: "row-reverse", alignItems: "center", gap: 5 },
  liveDot: { width: 6, height: 6, borderRadius: radii.round, backgroundColor: colors.accent },
  liveDotMuted: { backgroundColor: colors.textMuted },
  chatStatusLine: { fontSize: 10 },
  dealContextCard: { borderWidth: 1, borderColor: '#D9B8A3', backgroundColor: '#F7E8DD', borderRadius: radii.xl, padding: spacing.sm, gap: spacing.sm },
  dealContextHeader: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  dealContextCopy: { flex: 1, alignItems: "flex-end", gap: 1 },
  contextEyebrow: { fontSize: 10 },
  contextHeading: { fontSize: 17 },
  dealStatusPill: { borderRadius: radii.round, paddingHorizontal: spacing.sm, paddingVertical: 5, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  dealStatusText: { color: colors.primary, fontSize: 10 },
  tradePairRow: { flexDirection: "row-reverse", alignItems: "center", gap: 7 },
  tradeMiniCard: { flex: 1, minWidth: 0, flexDirection: "row-reverse", alignItems: "center", gap: 7, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 7 },
  tradeMiniCardAccent: { borderColor: '#C7DDD7', backgroundColor: colors.accentSoft },
  tradeMiniImage: { width: 42, height: 42, borderRadius: radii.md, backgroundColor: colors.primarySoft },
  tradeMiniPlaceholder: { alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border, borderStyle: "dashed" },
  tradeMiniCopy: { flex: 1, minWidth: 0, gap: 1, alignItems: "flex-end" },
  tradeMiniLabel: { fontSize: 9 },
  tradeArrow: { width: 30, height: 30, borderRadius: radii.round, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },''',
    'header styles',
    re.S,
)

sub_once(
    r'''  threadSection: \{ flex: 1, gap: spacing\.sm, paddingVertical: spacing\.sm \},\n  threadTopLine: \{ gap: 2 \},''',
    '''  threadSection: { flex: 1, gap: spacing.sm, paddingTop: spacing.md, paddingBottom: spacing.sm },
  threadTopLine: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  threadHeadingCopy: { flex: 1, alignItems: "flex-end", gap: 1 },
  threadHeading: { fontSize: 17 },
  threadLivePill: { flexDirection: "row-reverse", alignItems: "center", gap: 5, paddingHorizontal: 8, paddingVertical: 5, borderRadius: radii.round, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  threadLiveText: { fontSize: 9 },''',
    'thread styles',
)

sub_once(
    r'''  bubble: \{\n    maxWidth: "82%",\n    paddingVertical: spacing\.sm,\n    paddingHorizontal: spacing\.md,\n    borderRadius: radii\.xl,\n    gap: spacing\.xs,\n  \},\n  myBubble: \{\n    backgroundColor: colors\.primarySoft,\n    borderBottomRightRadius: radii\.sm,\n  \},\n  otherBubble: \{\n    backgroundColor: colors\.surface,\n    borderBottomLeftRadius: radii\.sm,\n    borderWidth: 1,\n    borderColor: colors\.border,\n  \},''',
    '''  bubble: { maxWidth: "82%", paddingVertical: 9, paddingHorizontal: 12, borderRadius: 20, gap: 4, borderWidth: 1 },
  myBubble: { backgroundColor: '#F1DDCF', borderColor: '#D9B8A3', borderTopRightRadius: 7 },
  otherBubble: { backgroundColor: colors.surface, borderColor: colors.border, borderTopLeftRadius: 7 },''',
    'bubble styles',
    re.S,
)

sub_once(
    r'''  subtleSender: \{ fontSize: 11 \},\n  messageBody: \{ lineHeight: 22, fontSize: 15, color: colors\.text \},\n  metaText: \{ fontSize: 11 \},\n  voiceBubble: \{ gap: spacing\.xs \},\n  compactActionGroup: \{ gap: spacing\.xs \},\n  compactStatusRow: \{ fontSize: 13 \},\n  blockErrorCard: \{ gap: spacing\.xs \},''',
    '''  subtleSender: { fontSize: 10 },
  messageBody: { lineHeight: 21, fontSize: 15, color: colors.text, textAlign: "right" },
  metaText: { fontSize: 10 },
  voiceBubble: { gap: spacing.xs },
  completionPanel: { gap: spacing.sm, borderWidth: 1, borderColor: '#C7DDD7', backgroundColor: colors.accentSoft, borderRadius: radii.xl, padding: spacing.md },
  completionHeader: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.sm },
  completionIcon: { width: 44, height: 44, borderRadius: radii.round, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  completionCopy: { flex: 1, gap: 3, alignItems: "flex-end" },
  completionTitle: { fontSize: 18 },
  completionHint: { textAlign: "right", lineHeight: 19 },
  confirmationRow: { flexDirection: "row-reverse", gap: spacing.xs, flexWrap: "wrap" },
  confirmationChip: { flexDirection: "row-reverse", alignItems: "center", gap: 5, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: radii.round, paddingHorizontal: spacing.sm, paddingVertical: 6 },
  confirmationChipDone: { borderColor: '#C7DDD7', backgroundColor: colors.background },
  inlineNotice: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.xs, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: radii.lg, padding: spacing.sm },
  errorNotice: { borderColor: '#F0C7C1', backgroundColor: '#FFF2F0' },
  noticeText: { flex: 1, textAlign: "right" },
  noticeErrorText: { flex: 1, color: '#B42318', textAlign: "right" },
  blockErrorCard: { gap: spacing.xs },''',
    'status and completion styles',
    re.S,
)

sub_once(
    r'''  composerShell: \{\n    backgroundColor: colors\.surface,\n    borderTopWidth: 1,\n    borderColor: colors\.border,\n    paddingHorizontal: spacing\.md,\n    paddingTop: spacing\.sm,\n    paddingBottom: spacing\.sm,\n    gap: spacing\.sm,\n  \},''',
    '''  composerShell: { backgroundColor: colors.surface, borderTopWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, paddingTop: 8, paddingBottom: spacing.sm, gap: spacing.xs },''',
    'composer shell style',
    re.S,
)

sub_once(
    r'''  inputShell: \{\n    flex: 1,\n    backgroundColor: colors\.background,\n    borderWidth: 1,\n    borderColor: colors\.border,\n    borderRadius: radii\.round,\n    paddingHorizontal: spacing\.sm,\n    minHeight: 46,\n    justifyContent: "center",\n  \},''',
    '''  inputShell: { flex: 1, backgroundColor: '#FBF7F2', borderWidth: 1, borderColor: colors.border, borderRadius: radii.round, paddingHorizontal: spacing.md, minHeight: 46, justifyContent: "center" },''',
    'composer input style',
    re.S,
)

path.write_text(text)
