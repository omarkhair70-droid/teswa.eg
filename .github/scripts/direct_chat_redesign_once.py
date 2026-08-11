from pathlib import Path
import re

path = Path("app/direct/[id].tsx")
text = path.read_text()


def sub_once(pattern: str, replacement: str, label: str, flags: int = 0) -> None:
    global text
    text, count = re.subn(pattern, lambda _: replacement, text, count=1, flags=flags)
    if count != 1:
        raise SystemExit(f"missing source block: {label}")


sub_once(
    r"const statusMeta = \{.*?\} as const;",
    """const statusMeta = {
  accepted: { label: 'محادثة مباشرة', sub: 'مساحة خاصة للتفاهم والتبادل' },
  requested: { label: 'طلب مراسلة', sub: 'في انتظار قبول الطلب' },
  ignored: { label: 'تم التجاهل', sub: 'المحادثة متوقفة حالياً' },
  blocked: { label: 'محظور', sub: 'المحادثة غير متاحة' },
} as const;""",
    "status metadata",
    re.S,
)

for old, new in {
    "Direct Chat مش متاح دلوقتي. جرّب تاني بعد لحظات.": "المحادثة مش متاحة دلوقتي. جرّب تاني بعد لحظات.",
    "إرسال عرض التبادل متاح داخل Direct Chat المقبول فقط.": "إرسال عرض التبادل متاح داخل المحادثات المقبولة فقط.",
    "بنجهز Direct Chat...": "بنجهز المحادثة...",
    "بنفتح مساحة المحادثة الآمنة.": "ثواني وتظهر الرسائل.",
    "ابدأوا الاتفاق": "ابدأوا الكلام",
    "اسأل سؤال بسيط أو وضّح تفاصيل الحاجة اللي بتتكلموا عليها.": "رسالة بسيطة كفاية لفتح النقاش، وبعدها اتفقوا على التفاصيل براحتكم.",
    "إجراءات الرسالة": "أضف للمحادثة",
    "label: 'إضافة ❤️'": "label: 'تفاعل ❤️'",
    "label: 'إضافة 👍'": "label: 'تفاعل 👍'",
}.items():
    text = text.replace(old, new)

header = """  return <AppScreen backgroundVariant=\"soft\">
    <View style={styles.header}>
      <Pressable accessibilityRole=\"button\" accessibilityLabel=\"رجوع\" style={styles.headerIconButton} onPress={() => router.back()}>
        <Ionicons name=\"chevron-forward\" size={21} color={colors.text} />
      </Pressable>
      <Pressable style={styles.headerIdentity} onPress={() => { if (convo?.otherUserId) router.push(`/profile/${convo.otherUserId}`); }} disabled={!convo?.otherUserId}>
        <View style={styles.avatarWrap}>{convo?.otherAvatarUrl ? <Image source={{ uri: convo.otherAvatarUrl }} style={styles.avatar} /> : <Ionicons name=\"person-outline\" size={22} color={colors.textMuted} />}</View>
        <View style={styles.headerCopy}>
          <AppText weight=\"bold\" numberOfLines={1}>{convo?.otherDisplayName ?? 'رسالة من تِسوى'}</AppText>
          <View style={styles.headerMetaRow}>
            <AppText muted style={styles.username}>@{convo?.otherUsername ?? 'teswa'}</AppText>
            {status ? <><View style={styles.headerMetaDot} /><AppText style={styles.statusText}>{status.label}</AppText></> : null}
          </View>
          {status ? <AppText muted style={styles.subtleLine}>{status.sub}</AppText> : null}
        </View>
      </Pressable>
      <Pressable accessibilityRole=\"button\" accessibilityLabel=\"خيارات المحادثة\" style={styles.headerIconButton} onPress={() => directActionsSheetRef.current?.present()}>
        <Ionicons name=\"ellipsis-horizontal\" size={20} color={colors.text} />
      </Pressable>
    </View>

    {acceptedDirectProActive"""
sub_once(
    r"  return <AppScreen>\s*<View style=\{styles\.header\}>.*?</View>\s*\{acceptedDirectProActive",
    header,
    "conversation header",
    re.S,
)

context = """    {acceptedDirectProActive ? (
      <View style={styles.contextStrip}>
        <View style={styles.contextIcon}><Ionicons name=\"swap-horizontal\" size={17} color={colors.primary} /></View>
        <View style={styles.contextCopy}>
          <AppText weight=\"semibold\">مساحة التبادل</AppText>
          <AppText muted style={styles.contextDescription}>اتفقوا على التفاصيل بهدوء، ولما الصورة تبقى واضحة حوّلوها لعرض رسمي.</AppText>
        </View>
        {convo?.itemId ? <Pressable accessibilityRole=\"button\" accessibilityLabel=\"عرض تفاصيل العنصر\" style={styles.contextAction} onPress={() => router.push(`/item/${convo.itemId}`)}><Ionicons name=\"cube-outline\" size={17} color={colors.accent} /></Pressable> : null}
      </View>
    ) : null}

    {isReceiverOnRequest"""
sub_once(
    r"    \{acceptedDirectProActive \? <AppCard style=\{styles\.contextStrip\}>.*?</AppCard> : null\}\s*\{isReceiverOnRequest",
    context,
    "exchange context strip",
    re.S,
)

sub_once(
    r"\{typingText && usingStreamChat \? <AppText muted style=\{styles\.info\}>\{typingText\}</AppText> : null\}",
    "{typingText && usingStreamChat ? <View style={styles.typingBar}><View style={styles.typingDot} /><AppText muted style={styles.typingText}>{typingText}</AppText></View> : null}",
    "typing indicator",
)

sub_once(
    r"<Pressable style=\{styles\.plus\} disabled=\{!canOpenAttachments\} onPress=\{\(\) => composerActionsSheetRef\.current\?\.present\(\)\}><Ionicons name=\"add\" size=\{20\} color=\{colors\.textMuted\} /></Pressable>",
    "<Pressable accessibilityRole=\"button\" accessibilityLabel=\"إضافة للمحادثة\" style={styles.plus} disabled={!canOpenAttachments} onPress={() => composerActionsSheetRef.current?.present()}><Ionicons name=\"add\" size={21} color={canOpenAttachments ? colors.text : colors.textMuted} /></Pressable>",
    "composer add button",
)

sub_once(
    r"\{acceptedDirectProActive \? <Pressable style=\{\[styles\.plus, !canUseVoice && styles\.sendDisabled\]\} disabled=\{!canUseVoice \|\| isRecordingVoice\} onPress=\{\(\) => \{ void startVoiceRecording\(\); \}\}><Ionicons name=\"mic\" size=\{18\} color=\{canUseVoice \? colors\.primary : colors\.textMuted\} /></Pressable> : null\}",
    "{acceptedDirectProActive ? <Pressable accessibilityRole=\"button\" accessibilityLabel=\"تسجيل رسالة صوتية\" style={[styles.plus, !canUseVoice && styles.sendDisabled]} disabled={!canUseVoice || isRecordingVoice} onPress={() => { void startVoiceRecording(); }}><Ionicons name=\"mic-outline\" size={19} color={canUseVoice ? colors.primary : colors.textMuted} /></Pressable> : null}",
    "composer voice button",
)

sub_once(
    r"  header: .*?\n  headerIdentity: .*?\n  headerMenuBtn: .*?\n  avatarWrap: .*?\n  avatar: .*?\n  subtleLine: .*?\n  pill: .*?\n  contextStrip: .*?\n  contextHead: .*?\n  streamBadge: .*?\n  itemContextCard: .*?\n",
    """  header: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.xs, backgroundColor: 'transparent' },
  headerIdentity: { flex: 1, minHeight: 54, flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm },
  headerIconButton: { width: 40, height: 40, borderRadius: radii.round, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  avatarWrap: { width: 46, height: 46, borderRadius: radii.round, backgroundColor: colors.primarySoft, borderWidth: 1, borderColor: '#D9B8A3', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatar: { width: '100%', height: '100%' },
  headerCopy: { flex: 1, alignItems: 'flex-end', gap: 2 },
  headerMetaRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6 },
  username: { fontSize: 11 },
  headerMetaDot: { width: 4, height: 4, borderRadius: radii.round, backgroundColor: colors.border },
  statusText: { color: colors.primary, fontSize: 11 },
  subtleLine: { fontSize: 11, textAlign: 'right' },
  contextStrip: { marginHorizontal: spacing.md, marginTop: 2, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: radii.xl, paddingHorizontal: spacing.sm, paddingVertical: 10, flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm },
  contextIcon: { width: 36, height: 36, borderRadius: radii.round, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  contextCopy: { flex: 1, alignItems: 'flex-end', gap: 2 },
  contextDescription: { fontSize: 11, textAlign: 'right', lineHeight: 17 },
  contextAction: { width: 34, height: 34, borderRadius: radii.round, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
""",
    "header and context styles",
)

sub_once(
    r"  requestCard: .*?\n  requestHead: .*?\n  requestActions: .*?\n  retryState: .*?\n  infoCard: .*?\n  info: .*?\n  messagesWrap: .*?\n  bubbleRow: .*?\n  bubble: .*?\n  bubbleMineRow: .*?\n  bubbleOtherRow: .*?\n  mine: .*?\n  other: .*?\n  bodyText: .*?\n  senderHint: .*?\n  time: .*?\n",
    """  requestCard: { marginHorizontal: spacing.md, marginTop: spacing.xs, marginBottom: 2, gap: spacing.sm, borderColor: '#D9B8A3' },
  requestHead: { gap: 4 },
  requestActions: { flexDirection: 'row-reverse', gap: spacing.xs },
  retryState: { padding: spacing.md, gap: spacing.sm },
  infoCard: { marginHorizontal: spacing.md, marginBottom: 2, borderColor: colors.border },
  info: { paddingHorizontal: spacing.md, paddingBottom: spacing.xs },
  typingBar: { paddingHorizontal: spacing.lg, paddingBottom: 4, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'flex-start', gap: 6 },
  typingDot: { width: 6, height: 6, borderRadius: radii.round, backgroundColor: colors.accent },
  typingText: { fontSize: 11 },
  messagesWrap: { paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.lg, gap: 5, flexGrow: 1 },
  bubbleRow: { width: '100%' },
  bubble: { maxWidth: '82%', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 9, gap: 4, borderWidth: 1 },
  bubbleMineRow: { alignItems: 'flex-end' },
  bubbleOtherRow: { alignItems: 'flex-start' },
  mine: { backgroundColor: '#F1DDCF', borderColor: '#D9B8A3', borderTopRightRadius: 7 },
  other: { backgroundColor: colors.surface, borderTopLeftRadius: 7, borderColor: colors.border },
  bodyText: { textAlign: 'right', lineHeight: 20 },
  senderHint: { fontSize: 10 },
  time: { fontSize: 10, marginTop: 1 },
""",
    "message surface styles",
)

sub_once(
    r"  recordingCard: .*?\n  recordingHeader: .*?\n  recordingDot: .*?\n  recordingActions: .*?\n  composerWrap: .*?\n  replyCard: .*?\n  replyClose: .*?\n  composer: .*?\n  plus: .*?\n  input: .*?\n  send: .*?\n",
    """  recordingCard: { marginHorizontal: spacing.md, marginBottom: spacing.xs, borderRadius: radii.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: '#E2B7B7', paddingHorizontal: spacing.sm, paddingVertical: spacing.sm, gap: spacing.xs },
  recordingHeader: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'flex-end', gap: 7 },
  recordingDot: { width: 8, height: 8, borderRadius: radii.round, backgroundColor: colors.danger },
  recordingActions: { flexDirection: 'row-reverse', gap: spacing.xs },
  composerWrap: { borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: spacing.md, paddingTop: 8, paddingBottom: spacing.sm, gap: spacing.xs },
  replyCard: { borderWidth: 1, borderColor: colors.border, borderRightWidth: 3, borderRightColor: colors.primary, backgroundColor: colors.background, borderRadius: radii.lg, paddingHorizontal: spacing.sm, paddingVertical: 8, flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.xs },
  replyClose: { width: 28, height: 28, borderRadius: radii.round, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  composer: { flexDirection: 'row-reverse', alignItems: 'flex-end', gap: 6 },
  plus: { width: 40, height: 44, borderRadius: radii.round, alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent', opacity: 0.9 },
  input: { flex: 1, minHeight: 46, maxHeight: 112, borderWidth: 1, borderColor: colors.border, borderRadius: 23, paddingHorizontal: spacing.md, paddingVertical: 9, textAlign: 'right', color: colors.text, backgroundColor: colors.background },
  send: { width: 46, height: 46, borderRadius: radii.round, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
""",
    "composer and recording styles",
)

sub_once(
    r"  quotedWrap: .*?\n  quotedUser: .*?\n",
    """  quotedWrap: { borderRightWidth: 3, borderRightColor: colors.accent, backgroundColor: 'rgba(255,255,255,0.46)', borderRadius: radii.md, paddingHorizontal: spacing.xs, paddingVertical: 6, gap: 2 },
  quotedUser: { fontSize: 10, color: colors.accent },
""",
    "quoted message styles",
)

sub_once(
    r"  pendingCard: .*?\n  pendingImage: .*?\n  reactionsRow: .*?\n  reactionChip: .*?\n",
    """  pendingCard: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, borderRadius: radii.xl, padding: 8, flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.xs },
  pendingImage: { width: 54, height: 54, borderRadius: radii.md },
  reactionsRow: { flexDirection: 'row-reverse', gap: 5, marginTop: 4 },
  reactionChip: { borderWidth: 1, borderColor: '#C6DDD8', backgroundColor: colors.accentSoft, borderRadius: radii.round, paddingHorizontal: 7, paddingVertical: 2 },
""",
    "pending and reaction styles",
)

if "Stream مباشر" in text:
    raise SystemExit("stale user-visible Stream badge remains")

path.write_text(text)
