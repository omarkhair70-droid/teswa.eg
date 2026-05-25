import { useMemo, type RefObject } from 'react';
import type { BottomSheetModal } from '@gorhom/bottom-sheet';
import { AppActionSheet } from '@/components/sheets/AppActionSheet';
import type { AppActionSheetAction } from '@/components/sheets/types';
import type { DolabViewMode } from '@/lib/dolab/organization';

type Props = {
  sheetRef: RefObject<BottomSheetModal | null>;
  activeShelf: DolabViewMode;
  onCaptureImage: () => void;
  onPickImages: () => void;
  onPickVideo: () => void;
  onRecordAudio: () => void;
  onOpenDraftStudio: () => void;
  onOpenQuickNote: () => void;
  onCaptureClipboard: () => void;
  onCaptureDocument: () => void;
  onFeedback: (value: string) => void;
};

export function DolabShelfActionSheet({
  sheetRef,
  activeShelf,
  onCaptureImage,
  onPickImages,
  onPickVideo,
  onRecordAudio,
  onOpenDraftStudio,
  onOpenQuickNote,
  onCaptureClipboard,
  onCaptureDocument,
  onFeedback,
}: Props) {
  const dismiss = () => sheetRef.current?.dismiss();

  const actions = useMemo<AppActionSheetAction[]>(() => {
    if (activeShelf === 'notes') {
      return [
        { label: 'اكتب نوت', iconName: 'create-outline', onPress: () => { dismiss(); onOpenQuickNote(); } },
        { label: 'سجل ريكورد', iconName: 'mic-outline', onPress: () => { dismiss(); onRecordAudio(); } },
        { label: 'اربط بمسودة', iconName: 'cube-outline', onPress: () => { dismiss(); onFeedback('اختار مسودة من الكلام مع نفسي.'); } },
        { label: 'اربط بميديا', iconName: 'images-outline', onPress: () => { dismiss(); onFeedback('اختار ميديا من داخل الرسالة.'); } },
      ];
    }
    if (activeShelf === 'media') {
      return [
        { label: 'صوّر حاجة', iconName: 'camera-outline', onPress: () => { dismiss(); onCaptureImage(); } },
        { label: 'ارفع صور', iconName: 'images-outline', onPress: () => { dismiss(); onPickImages(); } },
        { label: 'ارفع فيديو', iconName: 'videocam-outline', onPress: () => { dismiss(); onPickVideo(); } },
        { label: 'سجل صوت', iconName: 'mic-outline', onPress: () => { dismiss(); onRecordAudio(); } },
      ];
    }
    if (activeShelf === 'drafts') {
      return [
        { label: 'مسودة عنصر', iconName: 'cube-outline', onPress: () => { dismiss(); onOpenDraftStudio(); } },
        { label: 'صوّر حاجة للمسودة', iconName: 'camera-outline', onPress: () => { dismiss(); onCaptureImage(); } },
        { label: 'افتح إضافة عنصر', iconName: 'add-circle-outline', onPress: () => { dismiss(); onOpenDraftStudio(); } },
      ];
    }
    if (activeShelf === 'inbox') {
      return [
        { label: 'الصق من الحافظة', iconName: 'clipboard-outline', onPress: () => { dismiss(); onCaptureClipboard(); } },
        { label: 'اختار ملف', iconName: 'document-attach-outline', onPress: () => { dismiss(); onCaptureDocument(); } },
        { label: 'اكتب نص سريع', iconName: 'create-outline', onPress: () => { dismiss(); onOpenQuickNote(); } },
      ];
    }
    if (activeShelf === 'ready') {
      return [
        { label: 'مسودة عنصر', iconName: 'cube-outline', onPress: () => { dismiss(); onOpenDraftStudio(); } },
        { label: 'افتح إضافة عنصر', iconName: 'add-circle-outline', onPress: () => { dismiss(); onOpenDraftStudio(); } },
        { label: 'جهّز عرض جديد', iconName: 'rocket-outline', onPress: () => { dismiss(); onFeedback('ابدأ مسودة جديدة وجهّزها للعرض.'); onOpenDraftStudio(); } },
      ];
    }
    return [
      { label: 'اكتب فكرة', iconName: 'bulb-outline', onPress: () => { dismiss(); onOpenQuickNote(); } },
      { label: 'اكتب قائمة', iconName: 'list-outline', onPress: () => { dismiss(); onOpenQuickNote(); } },
      { label: 'سجل ريكورد', iconName: 'mic-outline', onPress: () => { dismiss(); onRecordAudio(); } },
    ];
  }, [activeShelf, onCaptureClipboard, onCaptureDocument, onCaptureImage, onFeedback, onOpenDraftStudio, onOpenQuickNote, onPickImages, onPickVideo, onRecordAudio]);

  return <AppActionSheet ref={sheetRef} title="أضف هنا" description="اختَر الإجراء المناسب للرف الحالي." titleIconName="albums-outline" snapPoints={['48%']} actions={actions} />;
}
