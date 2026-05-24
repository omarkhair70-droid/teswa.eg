import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { BottomSheetModal } from '@gorhom/bottom-sheet';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { AppActionSheet } from '@/components/sheets/AppActionSheet';
import { AppBottomSheet } from '@/components/sheets/AppBottomSheet';
import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';
import { AppInput } from '@/components/ui/AppInput';
import { AppScreen } from '@/components/ui/AppScreen';
import { AppText } from '@/components/ui/AppText';
import { EmptyState } from '@/components/ui/EmptyState';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';
import type { DolabDraftItem, DolabDraftItemInput } from '@/lib/dolab/draft-types';
import { toPendingMedia } from '@/lib/dolab/local-media';
import type { DolabPendingMedia } from '@/lib/dolab/media-types';
import { DolabSelfChatPanel } from '@/components/dolab/DolabSelfChatPanel';
import { DolabShareBridgeSheet } from '@/components/dolab/DolabShareBridgeSheet';
import { DolabPublishBridgeSheet } from '@/components/dolab/DolabPublishBridgeSheet';
import type { DolabSelfMessage, DolabSelfMessageType } from '@/lib/dolab/self-chat-types';
import type { DolabShareDraft, DolabShareDraftTargetMode } from '@/lib/dolab/share-bridge-types';
import { buildPublishDraftFromDolabDraft, type DolabPublishDraft } from '@/lib/dolab/publish-bridge-types';

const draftItems = [
  { id: 'd1', title: 'جاكيت شتوي نظيف', hint: 'جاهز للتصوير النهائي والنشر لاحقًا.' },
  { id: 'd2', title: 'طقم قهوة تراثي', hint: 'يحتاج تحديد حالة القطع قبل العرض.' },
];

const exchangeIdeas = [
  { id: 'e1', text: 'تبادل الطقم مع جهاز مطبخ صغير بحالة ممتازة.' },
  { id: 'e2', text: 'دمج عنصرين في عرض واحد لتسريع التبادل.' },
];

const emptyDraftForm: DolabDraftItemInput = {
  title: '',
  description: '',
  category: '',
  condition: '',
  exchangeIntent: '',
  linkedPendingMediaIds: [],
};

export default function DolabScreen() {
  const router = useRouter();
  const addSheetRef = useRef<BottomSheetModal>(null);
  const draftStudioRef = useRef<BottomSheetModal>(null);
  const shareBridgeRef = useRef<BottomSheetModal>(null);
  const publishBridgeRef = useRef<BottomSheetModal>(null);
  const glow = useRef(new Animated.Value(0)).current;
  const drift = useRef(new Animated.Value(0)).current;

  const [inlineFeedback, setInlineFeedback] = useState<string | null>(null);
  const [pendingMedia, setPendingMedia] = useState<DolabPendingMedia[]>([]);
  const [localDrafts, setLocalDrafts] = useState<DolabDraftItem[]>([]);
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);
  const [draftForm, setDraftForm] = useState<DolabDraftItemInput>(emptyDraftForm);
  const [selfMessages, setSelfMessages] = useState<DolabSelfMessage[]>([]);
  const [selfComposerBody, setSelfComposerBody] = useState('');
  const [selfComposerType, setSelfComposerType] = useState<DolabSelfMessageType>('text');
  const [selfComposerDraftId, setSelfComposerDraftId] = useState<string | null>(null);
  const [selfComposerMediaIds, setSelfComposerMediaIds] = useState<string[]>([]);
  const [selfComposerError, setSelfComposerError] = useState<string | null>(null);
  const [shareDrafts, setShareDrafts] = useState<DolabShareDraft[]>([]);
  const [shareBridgeMessageId, setShareBridgeMessageId] = useState<string | null>(null);
  const [shareBridgeBody, setShareBridgeBody] = useState('');
  const [shareBridgeTargetMode, setShareBridgeTargetMode] = useState<DolabShareDraftTargetMode>('choose_later');
  const [publishDrafts, setPublishDrafts] = useState<DolabPublishDraft[]>([]);
  const [selectedPublishSourceDraftId, setSelectedPublishSourceDraftId] = useState<string | null>(null);

  const appendMedia = (items: DolabPendingMedia[]) => {
    setPendingMedia((prev) => [...items, ...prev]);
  };

  const removePendingMedia = (mediaId: string) => {
    setPendingMedia((prev) => prev.filter((item) => item.id !== mediaId));
    setDraftForm((prev) => ({
      ...prev,
      linkedPendingMediaIds: prev.linkedPendingMediaIds.filter((id) => id !== mediaId),
    }));
    setLocalDrafts((prev) => prev.map((draft) => ({ ...draft, linkedPendingMediaIds: draft.linkedPendingMediaIds.filter((id) => id !== mediaId) })));
    setSelfComposerMediaIds((prev) => prev.filter((id) => id !== mediaId));
    setSelfMessages((prev) =>
      prev.map((message) => ({
        ...message,
        linkedPendingMediaIds: message.linkedPendingMediaIds.filter((id) => id !== mediaId),
      })),
    );
  };

  const resetDraftForm = () => {
    setEditingDraftId(null);
    setDraftForm(emptyDraftForm);
  };

  const pickImages = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setInlineFeedback('محتاجين إذن الصور عشان ترفع صور للدولاب.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsMultipleSelection: true,
      selectionLimit: 8,
    });

    if (result.canceled) {
      setInlineFeedback('تم إلغاء اختيار الصور.');
      return;
    }

    const items = result.assets.map((asset) => toPendingMedia(asset, 'image'));
    appendMedia(items);
    setInlineFeedback(`تمت إضافة ${items.length} صورة للدولاب المحلي.`);
  };

  const pickVideo = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setInlineFeedback('محتاجين إذن الصور والفيديو عشان ترفع فيديو.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      quality: 0.8,
    });

    if (result.canceled) {
      setInlineFeedback('تم إلغاء اختيار الفيديو.');
      return;
    }

    const items = result.assets.map((asset) => toPendingMedia(asset, 'video'));
    appendMedia(items);
    setInlineFeedback('تمت إضافة فيديو للدولاب المحلي.');
  };

  const captureImage = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setInlineFeedback('إذن الكاميرا مرفوض. فعّله من الإعدادات للتصوير.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
    });

    if (result.canceled) {
      setInlineFeedback('تم إلغاء التصوير.');
      return;
    }

    const items = result.assets.map((asset) => toPendingMedia(asset, 'image'));
    appendMedia(items);
    setInlineFeedback('تم التقاط صورة وإضافتها للدولاب المحلي.');
  };

  const openDraftStudioForNew = () => {
    resetDraftForm();
    draftStudioRef.current?.present();
  };

  const openDraftStudioForEdit = (draft: DolabDraftItem) => {
    setEditingDraftId(draft.id);
    setDraftForm({
      title: draft.title,
      description: draft.description,
      category: draft.category ?? '',
      condition: draft.condition ?? '',
      exchangeIntent: draft.exchangeIntent ?? '',
      linkedPendingMediaIds: draft.linkedPendingMediaIds,
    });
    draftStudioRef.current?.present();
  };

  const toggleMediaLink = (mediaId: string) => {
    setDraftForm((prev) => ({
      ...prev,
      linkedPendingMediaIds: prev.linkedPendingMediaIds.includes(mediaId)
        ? prev.linkedPendingMediaIds.filter((id) => id !== mediaId)
        : [...prev.linkedPendingMediaIds, mediaId],
    }));
  };

  const toggleSelfComposerMedia = (mediaId: string) => {
    setSelfComposerMediaIds((prev) => (prev.includes(mediaId) ? prev.filter((id) => id !== mediaId) : [...prev, mediaId]));
  };

  const saveSelfMessage = () => {
    const cleanBody = selfComposerBody.trim();
    if (!cleanBody) {
      setSelfComposerError('اكتب ملاحظة أو فكرة الأول قبل الحفظ.');
      return;
    }

    const newMessage: DolabSelfMessage = {
      id: `local-self-message-${Date.now()}`,
      body: cleanBody,
      messageType: selfComposerType,
      linkedDraftId: selfComposerDraftId ?? undefined,
      linkedPendingMediaIds: selfComposerMediaIds,
      createdAt: new Date().toISOString(),
    };

    setSelfMessages((prev) => [newMessage, ...prev]);
    setSelfComposerBody('');
    setSelfComposerError(null);
  };

  const deleteSelfMessage = (messageId: string) => {
    setSelfMessages((prev) => prev.filter((message) => message.id !== messageId));
    setShareDrafts((prev) => prev.filter((draft) => draft.sourceMessageId !== messageId));
  };


  const openShareBridge = (messageId: string) => {
    const message = selfMessages.find((item) => item.id === messageId);
    if (!message) {
      setInlineFeedback('تعذر تحميل الرسالة المختارة للمشاركة.');
      return;
    }

    setShareBridgeMessageId(message.id);
    setShareBridgeBody(message.body);
    setShareBridgeTargetMode('choose_later');
    shareBridgeRef.current?.present();
  };

  const openMessagesHub = () => {
    setShareBridgeTargetMode('direct_chat_placeholder');
    shareBridgeRef.current?.dismiss();
    router.push('/(tabs)/messages');
  };

  const prepareShareDraft = () => {
    if (!shareBridgeMessageId) {
      return;
    }

    const sourceMessage = selfMessages.find((item) => item.id === shareBridgeMessageId);
    if (!sourceMessage) {
      setInlineFeedback('تعذر تجهيز الرسالة للمشاركة.');
      return;
    }

    const cleanBody = shareBridgeBody.trim() || sourceMessage.body;
    const draft: DolabShareDraft = {
      id: `local-share-draft-${Date.now()}`,
      sourceMessageId: sourceMessage.id,
      body: cleanBody,
      linkedDraftId: sourceMessage.linkedDraftId,
      linkedPendingMediaIds: sourceMessage.linkedPendingMediaIds,
      targetMode: shareBridgeTargetMode,
      createdAt: new Date().toISOString(),
    };

    setShareDrafts((prev) => [draft, ...prev.filter((item) => item.sourceMessageId !== sourceMessage.id)]);
    shareBridgeRef.current?.dismiss();
    setInlineFeedback('اتجهزت للمشاركة. الربط بالشات الحقيقي في PR لاحق.');
  };

  const selectedShareMessage = useMemo(
    () => selfMessages.find((message) => message.id === shareBridgeMessageId) ?? null,
    [selfMessages, shareBridgeMessageId],
  );

  const selectedShareLinkedDraft = useMemo(
    () => localDrafts.find((draft) => draft.id === selectedShareMessage?.linkedDraftId),
    [localDrafts, selectedShareMessage?.linkedDraftId],
  );


  const selectedPublishSourceDraft = useMemo(
    () => localDrafts.find((draft) => draft.id === selectedPublishSourceDraftId) ?? null,
    [localDrafts, selectedPublishSourceDraftId],
  );

  const selectedPublishLinkedMedia = useMemo(() => {
    if (!selectedPublishSourceDraft) {
      return [];
    }

    return pendingMedia.filter((item) => selectedPublishSourceDraft.linkedPendingMediaIds.includes(item.id));
  }, [pendingMedia, selectedPublishSourceDraft]);

  const selectedPublishBridgeData = useMemo(() => {
    if (!selectedPublishSourceDraft) {
      return null;
    }

    return buildPublishDraftFromDolabDraft(selectedPublishSourceDraft, selectedPublishLinkedMedia);
  }, [selectedPublishLinkedMedia, selectedPublishSourceDraft]);

  const openPublishBridge = (draft: DolabDraftItem) => {
    setSelectedPublishSourceDraftId(draft.id);
    publishBridgeRef.current?.present();
  };

  const preparePublishDraft = () => {
    if (!selectedPublishSourceDraft || !selectedPublishBridgeData) {
      return;
    }

    const now = new Date().toISOString();

    setPublishDrafts((prev) => {
      const existing = prev.find((item) => item.sourceDraftId === selectedPublishSourceDraft.id);
      const nextDraft: DolabPublishDraft = {
        ...selectedPublishBridgeData,
        id: existing?.id ?? `local-publish-draft-${Date.now()}`,
        readinessStatus: selectedPublishBridgeData.missingFields.length === 0 ? 'prepared' : 'incomplete',
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };

      return [nextDraft, ...prev.filter((item) => item.sourceDraftId !== selectedPublishSourceDraft.id)];
    });

    publishBridgeRef.current?.dismiss();
    setInlineFeedback('العرض اتجهز محليًا. النشر الحقيقي في PR لاحق.');
  };

  const saveLocalDraft = () => {
    const now = new Date().toISOString();

    if (editingDraftId) {
      setLocalDrafts((prev) =>
        prev.map((draft) =>
          draft.id === editingDraftId
            ? {
                ...draft,
                ...draftForm,
                category: draftForm.category || undefined,
                condition: draftForm.condition || undefined,
                exchangeIntent: draftForm.exchangeIntent || undefined,
                updatedAt: now,
              }
            : draft,
        ),
      );
    } else {
      const newDraft: DolabDraftItem = {
        id: `local-draft-${Date.now()}`,
        ...draftForm,
        category: draftForm.category || undefined,
        condition: draftForm.condition || undefined,
        exchangeIntent: draftForm.exchangeIntent || undefined,
        createdAt: now,
        updatedAt: now,
      };
      setLocalDrafts((prev) => [newDraft, ...prev]);
    }

    draftStudioRef.current?.dismiss();
    setInlineFeedback('اتحفظت كمسودة محلية داخل دولابك.');
    resetDraftForm();
  };

  useEffect(() => {
    const glowLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 2400, useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0, duration: 2400, useNativeDriver: true }),
      ]),
    );

    const driftLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, { toValue: 1, duration: 3400, useNativeDriver: true }),
        Animated.timing(drift, { toValue: 0, duration: 3400, useNativeDriver: true }),
      ]),
    );

    glowLoop.start();
    driftLoop.start();

    return () => {
      glowLoop.stop();
      driftLoop.stop();
      glow.stopAnimation();
      drift.stopAnimation();
    };
  }, [drift, glow]);

  const sheetActions = useMemo(
    () => [
      {
        label: 'صوّر حاجة',
        iconName: 'camera-outline' as const,
        description: 'التقط صورة محلية محفوظة على جهازك.',
        onPress: () => {
          addSheetRef.current?.dismiss();
          void captureImage();
        },
      },
      {
        label: 'ارفع صور',
        iconName: 'images-outline' as const,
        description: 'اختار صورة أو أكثر من جهازك.',
        onPress: () => {
          addSheetRef.current?.dismiss();
          void pickImages();
        },
      },
      {
        label: 'ارفع فيديو',
        iconName: 'videocam-outline' as const,
        description: 'اختَر فيديو محلي للدولاب.',
        onPress: () => {
          addSheetRef.current?.dismiss();
          void pickVideo();
        },
      },
      {
        label: 'اكتب ملاحظة',
        iconName: 'document-text-outline' as const,
        description: 'سجّل فكرة تبادل أو وصف سريع.',
        onPress: () => {
          addSheetRef.current?.dismiss();
          setInlineFeedback('ملاحظات الدولاب في PR لاحق.');
        },
      },
      {
        label: 'سجل صوت',
        iconName: 'mic-outline' as const,
        description: 'احفظ ملاحظة صوتية لنفسك لاحقًا.',
        onPress: () => {
          addSheetRef.current?.dismiss();
          setInlineFeedback('تسجيل الصوت في PR لاحق.');
        },
      },
      {
        label: 'مسودة عنصر',
        iconName: 'cube-outline' as const,
        description: 'ابدأ عنصرًا يتحول لاحقًا لعرض.',
        onPress: () => {
          addSheetRef.current?.dismiss();
          openDraftStudioForNew();
        },
      },
    ],
    [],
  );

  return (
    <AppScreen backgroundVariant="alive" style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <Pressable
            style={styles.backButton}
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="الرجوع من شاشة دولاب تسوى"
          >
            <Ionicons name="chevron-forward" size={20} color={colors.primary} />
          </Pressable>
          <AppText weight="bold" style={styles.headerTitle}>
            دولاب تسوى
          </AppText>
        </View>

        <LinearGradient colors={['#FFF8EE', '#F4EDE4', '#F2F7F6']} style={styles.hero}>
          <Animated.View
            style={[
              styles.heroGlow,
              {
                opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0.2, 0.5] }),
              },
            ]}
          />
          <Animated.View
            style={[
              styles.floatingChip,
              {
                transform: [
                  {
                    translateY: drift.interpolate({ inputRange: [0, 1], outputRange: [0, -8] }),
                  },
                ],
              },
            ]}
          >
            <Ionicons name="lock-closed-outline" size={14} color={colors.primary} />
            <AppText style={styles.chipText}>خاص</AppText>
          </Animated.View>
          <Animated.View
            style={[
              styles.floatingChipSecondary,
              {
                transform: [
                  {
                    translateY: drift.interpolate({ inputRange: [0, 1], outputRange: [-2, 6] }),
                  },
                ],
              },
            ]}
          >
            <Ionicons name="sparkles-outline" size={14} color={colors.accent} />
            <AppText style={styles.chipText}>حيّ</AppText>
          </Animated.View>
          <View style={styles.heroTopIcon}>
            <Ionicons name="archive-outline" size={22} color={colors.primary} />
          </View>
          <View style={styles.heroBadge}>
            <AppText weight="semibold" style={styles.heroBadgeText}>
              نسخة أولى
            </AppText>
          </View>
          <AppText weight="bold" style={styles.heroTitle}>
            دولاب تسوى
          </AppText>
          <AppText muted style={styles.heroSubtitle}>
            مكانك الخاص لتجميع الصور، الفيديوهات، الأفكار، والحاجات اللي ممكن تتحول لتبادل.
          </AppText>
        </LinearGradient>

        <AppCard>
          <View style={styles.sectionHeader}>
            <AppText weight="bold">ميديا جاهزة للحفظ</AppText>
            <AppText muted>لسه محلية على جهازك، والحفظ السحابي هييجي في الخطوة الجاية.</AppText>
            <AppText muted style={styles.smallText}>
              عدد العناصر: {pendingMedia.length}
            </AppText>
          </View>

          {pendingMedia.length === 0 ? (
            <AppText muted style={styles.smallText}>
              لسه ما أضفتش ميديا محلية.
            </AppText>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pendingRow}>
              {pendingMedia.map((item) => (
                <View key={item.id} style={styles.pendingCard}>
                  {item.mediaType === 'image' ? (
                    <Image source={{ uri: item.uri }} style={styles.pendingImage} />
                  ) : (
                    <View style={styles.pendingPlaceholder}>
                      <Ionicons
                        name={item.mediaType === 'video' ? 'videocam-outline' : 'mic-outline'}
                        size={20}
                        color={colors.primary}
                      />
                      <AppText style={styles.smallText}>
                        {item.durationMs ? `${Math.round(item.durationMs / 1000)}ث` : 'بدون مدة'}
                      </AppText>
                    </View>
                  )}

                  <Pressable
                    style={styles.removeButton}
                    accessibilityRole="button"
                    accessibilityLabel="حذف عنصر ميديا من قائمة الدولاب"
                    onPress={() => removePendingMedia(item.id)}
                  >
                    <Ionicons name="close-circle" size={18} color={colors.danger} />
                  </Pressable>
                </View>
              ))}
            </ScrollView>
          )}
        </AppCard>

        <DolabSelfChatPanel
          messages={selfMessages}
          localDrafts={localDrafts}
          pendingMedia={pendingMedia}
          composerBody={selfComposerBody}
          selectedType={selfComposerType}
          selectedDraftId={selfComposerDraftId}
          linkedMediaIds={selfComposerMediaIds}
          composerError={selfComposerError}
          preparedShareSourceIds={shareDrafts.map((draft) => draft.sourceMessageId)}
          onChangeBody={(value) => {
            setSelfComposerBody(value);
            if (selfComposerError) {
              setSelfComposerError(null);
            }
          }}
          onSelectType={setSelfComposerType}
          onSelectDraft={setSelfComposerDraftId}
          onToggleMedia={toggleSelfComposerMedia}
          onSave={saveSelfMessage}
          onShareLater={openShareBridge}
          onDelete={deleteSelfMessage}
        />



        <AppCard>
          <View style={styles.sectionHeader}>
            <AppText weight="bold">جاهز للمشاركة</AppText>
            <AppText muted>مسودات مشاركة محلية فقط لحد PR الربط الحقيقي.</AppText>
          </View>
          {shareDrafts.length === 0 ? (
            <AppText muted style={styles.smallText}>مفيش رسائل مجهزة للمشاركة لسه.</AppText>
          ) : (
            <View style={styles.listWrap}>
              {shareDrafts.map((draft) => (
                <View key={draft.id} style={styles.localDraftCard}>
                  <View style={styles.localDraftHeader}>
                    <AppText weight="semibold" numberOfLines={2}>{draft.body}</AppText>
                    <View style={styles.localBadge}>
                      <AppText style={styles.localBadgeText}>مجهز</AppText>
                    </View>
                  </View>
                  <AppText muted style={styles.smallText}>ميديا مرتبطة: {draft.linkedPendingMediaIds.length}</AppText>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="فتح الرسائل لإكمال المشاركة لاحقًا"
                    onPress={openMessagesHub}
                    style={styles.actionBtnInline}
                  >
                    <AppText style={styles.actionBtnInlineText}>افتح الرسائل</AppText>
                  </Pressable>
                </View>
              ))}
            </View>
          )}
        </AppCard>


        <AppCard>
          <View style={styles.sectionHeader}>
            <AppText weight="bold">عروض جاهزة للسوق</AppText>
            <AppText muted>تحضيرات محلية لحد ما نربط النشر الحقيقي.</AppText>
          </View>
          {publishDrafts.length === 0 ? (
            <AppText muted style={styles.smallText}>لسه مفيش عروض محضرة للسوق.</AppText>
          ) : (
            <View style={styles.listWrap}>
              {publishDrafts.map((draft) => (
                <View key={draft.id} style={styles.localDraftCard}>
                  <View style={styles.localDraftHeader}>
                    <AppText weight="semibold">{draft.title || 'مسودة بدون اسم'}</AppText>
                    <View style={styles.localBadge}>
                      <AppText style={styles.localBadgeText}>
                        {draft.readinessStatus === 'prepared' ? 'مجهز' : draft.readinessStatus === 'ready' ? 'جاهز' : 'ناقص بيانات'}
                      </AppText>
                    </View>
                  </View>
                  <AppText muted style={styles.smallText}>ميديا مرتبطة: {draft.linkedPendingMediaIds.length}</AppText>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="فتح إضافة عنصر لاستكمال النشر"
                    onPress={() => {
                      setInlineFeedback('افتح إضافة عنصر وكمّل النشر هناك.');
                      router.push('/(tabs)/add');
                    }}
                    style={styles.actionBtnInline}
                  >
                    <AppText style={styles.actionBtnInlineText}>افتح إضافة عنصر</AppText>
                  </Pressable>
                </View>
              ))}
            </View>
          )}
        </AppCard>

        <AppCard>
          <View style={styles.sectionHeader}>
            <AppText weight="bold">جاهز يتحول لعرض</AppText>
            <AppText muted>مسودات جاهزة لخطوة السوق لاحقًا.</AppText>
          </View>
          <View style={styles.listWrap}>
            {localDrafts.map((draft) => (
              <Pressable
                key={draft.id}
                style={styles.localDraftCard}
                onPress={() => openDraftStudioForEdit(draft)}
                accessibilityRole="button"
                accessibilityLabel={`فتح مسودة محلية ${draft.title || 'بدون عنوان'} للتعديل`}
              >
                <View style={styles.localDraftHeader}>
                  <AppText weight="semibold">{draft.title || 'مسودة بدون اسم'}</AppText>
                  <View style={styles.localBadge}>
                    <AppText style={styles.localBadgeText}>
                      {publishDrafts.some((item) => item.sourceDraftId === draft.id) ? 'تحضير نشر' : 'مسودة محلية'}
                    </AppText>
                  </View>
                </View>
                <AppText muted style={styles.smallText}>
                  {draft.description || draft.exchangeIntent || 'بدون تفاصيل إضافية حتى الآن.'}
                </AppText>
                <AppText muted style={styles.smallText}>
                  ميديا مرتبطة: {draft.linkedPendingMediaIds.length}
                </AppText>
                <Pressable
                  style={styles.actionBtnInline}
                  onPress={() => openPublishBridge(draft)}
                  accessibilityRole="button"
                  accessibilityLabel="تحويل المسودة إلى تحضير عرض"
                >
                  <AppText style={styles.actionBtnInlineText}>حوّل لعرض</AppText>
                </Pressable>
              </Pressable>
            ))}

            {draftItems.map((item) => (
              <View key={item.id} style={styles.rowCard}>
                <Ionicons name="cube-outline" size={18} color={colors.primary} />
                <View style={styles.rowCopy}>
                  <AppText weight="semibold">{item.title}</AppText>
                  <AppText muted style={styles.smallText}>
                    {item.hint}
                  </AppText>
                </View>
              </View>
            ))}
          </View>
        </AppCard>

        <AppCard>
          <View style={styles.sectionHeader}>
            <AppText weight="bold">أفكار التبادل</AppText>
            <AppText muted>ملاحظات خاصة تُجهّز صفقات أذكى.</AppText>
          </View>
          <View style={styles.listWrap}>
            {exchangeIdeas.map((idea) => (
              <View key={idea.id} style={styles.noteCard}>
                <Ionicons name="document-text-outline" size={16} color={colors.primary} />
                <AppText>{idea.text}</AppText>
              </View>
            ))}
          </View>
        </AppCard>

        <AppCard>
          <EmptyState
            title="المساحة الفارغة جاهزة لك"
            description="عند ربط البيانات الحقيقية، ستظهر هنا العناصر والميديا والأفكار الجديدة."
            iconName="folder-open-outline"
          />
          <AppButton
            label="ابدأ الإضافة الآن"
            variant="neutral"
            onPress={() => addSheetRef.current?.present()}
          />
        </AppCard>

        <View style={styles.ctaWrap}>
          <AppButton label="أضف للدولاب" onPress={() => addSheetRef.current?.present()} />
          <AppText muted style={styles.feedbackText}>
            {inlineFeedback ?? 'اختَر طريقة البداية، والباقي قريبًا.'}
          </AppText>
        </View>
      </ScrollView>

      <AppActionSheet
        ref={addSheetRef}
        title="أضف حاجة للدولاب"
        description="ابدأ بصورة، فيديو، ملاحظة، أو مسودة تبادل."
        titleIconName="add-circle-outline"
        snapPoints={['52%']}
        actions={sheetActions}
      />

      <DolabShareBridgeSheet
        sheetRef={shareBridgeRef}
        selectedMessage={selectedShareMessage}
        linkedDraft={selectedShareLinkedDraft}
        shareBody={shareBridgeBody}
        targetMode={shareBridgeTargetMode}
        onChangeBody={setShareBridgeBody}
        onSelectTargetMode={setShareBridgeTargetMode}
        onPrepareShare={prepareShareDraft}
        onOpenMessages={openMessagesHub}
      />

      <DolabPublishBridgeSheet
        sheetRef={publishBridgeRef}
        selectedDraft={selectedPublishSourceDraft}
        linkedPendingMedia={selectedPublishLinkedMedia}
        missingFields={selectedPublishBridgeData?.missingFields ?? []}
        onPrepare={preparePublishDraft}
      />

      <AppBottomSheet
        ref={draftStudioRef}
        title="مسودة عنصر"
        description="حوّل الصور والأفكار اللي في دولابك لمسودة جاهزة للتبادل لاحقًا."
        titleIconName="cube-outline"
        snapPoints={['80%']}
      >
        <ScrollView contentContainerStyle={styles.studioBody}>
          <AppInput
            value={draftForm.title}
            onChangeText={(value) => setDraftForm((prev) => ({ ...prev, title: value }))}
            placeholder="اسم الحاجة"
          />
          <AppInput
            value={draftForm.description}
            onChangeText={(value) => setDraftForm((prev) => ({ ...prev, description: value }))}
            placeholder="وصف سريع"
            multiline
          />
          <AppInput
            value={draftForm.category}
            onChangeText={(value) => setDraftForm((prev) => ({ ...prev, category: value }))}
            placeholder="التصنيف"
          />
          <AppInput
            value={draftForm.condition}
            onChangeText={(value) => setDraftForm((prev) => ({ ...prev, condition: value }))}
            placeholder="الحالة"
          />
          <AppInput
            value={draftForm.exchangeIntent}
            onChangeText={(value) => setDraftForm((prev) => ({ ...prev, exchangeIntent: value }))}
            placeholder="نية التبادل / هتحب تبدلها بإيه؟"
            multiline
          />

          <View style={styles.sectionHeader}>
            <AppText weight="semibold">ربط ميديا محلية</AppText>
            {pendingMedia.length === 0 ? (
              <AppText muted style={styles.smallText}>
                ارفع صور أو فيديوهات الأول عشان تربطها بالمسودة.
              </AppText>
            ) : null}
          </View>

          {pendingMedia.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pendingRow}>
              {pendingMedia.map((item) => {
                const selected = draftForm.linkedPendingMediaIds.includes(item.id);
                return (
                  <Pressable
                    key={item.id}
                    style={[styles.pendingCard, selected && styles.pendingCardSelected]}
                    onPress={() => toggleMediaLink(item.id)}
                    accessibilityRole="button"
                    accessibilityLabel={selected ? 'إلغاء ربط عنصر ميديا بالمسودة' : 'ربط عنصر ميديا بالمسودة'}
                  >
                    {item.mediaType === 'image' ? (
                      <Image source={{ uri: item.uri }} style={styles.pendingImage} />
                    ) : (
                      <View style={styles.pendingPlaceholder}>
                        <Ionicons name="videocam-outline" size={20} color={colors.primary} />
                        <AppText style={styles.smallText}>فيديو</AppText>
                      </View>
                    )}
                    {selected ? (
                      <View style={styles.selectedOverlay}>
                        <Ionicons name="checkmark-circle" size={20} color={colors.white} />
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : null}

          <AppButton label="احفظ المسودة محليًا" onPress={saveLocalDraft} />
        </ScrollView>
      </AppBottomSheet>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingHorizontal: 0,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.sm,
  },
  headerRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.sm,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: radii.round,
    borderWidth: 1,
    borderColor: 'rgba(184,98,63,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  headerTitle: {
    fontSize: 22,
  },
  hero: {
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: 'rgba(184,98,63,0.16)',
    padding: spacing.lg,
    overflow: 'hidden',
    gap: spacing.sm,
  },
  heroGlow: {
    position: 'absolute',
    width: 170,
    height: 170,
    borderRadius: radii.round,
    backgroundColor: 'rgba(184,98,63,0.22)',
    left: -30,
    top: -20,
  },
  heroTopIcon: {
    width: 44,
    height: 44,
    borderRadius: radii.round,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,253,248,0.9)',
    borderWidth: 1,
    borderColor: 'rgba(184,98,63,0.16)',
  },
  heroBadge: {
    alignSelf: 'flex-start',
    borderRadius: radii.round,
    backgroundColor: 'rgba(255,253,248,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(184,98,63,0.22)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  heroBadgeText: {
    color: '#7B5230',
    fontSize: 12,
  },
  heroTitle: {
    fontSize: 28,
  },
  heroSubtitle: {
    lineHeight: 23,
  },
  floatingChip: {
    position: 'absolute',
    top: 16,
    right: 16,
    flexDirection: 'row-reverse',
    gap: 4,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.84)',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: radii.round,
  },
  floatingChipSecondary: {
    position: 'absolute',
    bottom: 18,
    left: 14,
    flexDirection: 'row-reverse',
    gap: 4,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.84)',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: radii.round,
  },
  chipText: {
    fontSize: 12,
  },
  sectionHeader: {
    gap: 3,
    marginBottom: spacing.xs,
  },
  listWrap: {
    gap: spacing.xs,
  },
  rowCard: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: spacing.sm,
    backgroundColor: '#FFFDF9',
  },
  rowCopy: {
    flex: 1,
    gap: 2,
  },
  smallText: {
    fontSize: 12,
  },
  actionBtnInline: {
    alignSelf: 'flex-start',
    borderRadius: radii.round,
    borderWidth: 1,
    borderColor: colors.primary,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  actionBtnInlineText: {
    color: colors.primary,
    fontSize: 13,
  },
  noteCard: {
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: spacing.sm,
    backgroundColor: '#FFFEFC',
  },
  pendingRow: {
    gap: spacing.sm,
  },
  pendingCard: {
    width: 124,
    height: 124,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    backgroundColor: '#FFFDF9',
  },
  pendingCardSelected: {
    borderColor: colors.primary,
    borderWidth: 2,
  },
  selectedOverlay: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 26,
    height: 26,
    borderRadius: radii.round,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pendingImage: {
    width: '100%',
    height: '100%',
  },
  pendingPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  removeButton: {
    position: 'absolute',
    top: 6,
    left: 6,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: radii.round,
  },
  ctaWrap: {
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  feedbackText: {
    textAlign: 'center',
  },
  localDraftCard: {
    borderWidth: 1,
    borderColor: colors.primarySoft,
    borderRadius: radii.lg,
    padding: spacing.sm,
    backgroundColor: '#FFF9F1',
    gap: spacing.xs,
  },
  localDraftHeader: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  localBadge: {
    backgroundColor: colors.primarySoft,
    borderRadius: radii.round,
    paddingHorizontal: spacing.xs,
    paddingVertical: 4,
  },
  localBadgeText: {
    fontSize: 11,
    color: colors.primary,
  },
  studioBody: {
    gap: spacing.sm,
    paddingBottom: spacing.xxl,
  },
});
