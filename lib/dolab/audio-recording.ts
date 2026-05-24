import { AudioModule, setAudioModeAsync } from 'expo-audio';

export const DOLAB_AUDIO_PERMISSION_ERROR = 'نحتاج إذن الميكروفون لتسجيل ملاحظة صوتية.';
export const DOLAB_AUDIO_START_ERROR = 'تعذر بدء التسجيل. حاول مرة تانية.';
export const DOLAB_AUDIO_SAVE_ERROR = 'تعذر حفظ التسجيل. حاول مرة تانية.';

export type DolabAudioRecordingResult = {
  uri: string;
  durationMs?: number;
  mimeType: string;
};

export async function requestDolabAudioPermission(): Promise<{ granted: boolean; errorMessage?: string }> {
  try {
    const permission = await AudioModule.requestRecordingPermissionsAsync();
    if (!permission.granted) return { granted: false, errorMessage: DOLAB_AUDIO_PERMISSION_ERROR };
    return { granted: true };
  } catch {
    return { granted: false, errorMessage: DOLAB_AUDIO_PERMISSION_ERROR };
  }
}

export async function prepareDolabAudioRecordingMode(): Promise<{ ok: boolean; errorMessage?: string }> {
  try {
    await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
    return { ok: true };
  } catch {
    return { ok: false, errorMessage: DOLAB_AUDIO_START_ERROR };
  }
}

export function buildDolabAudioRecordingResult(uri?: string | null, durationMs?: number, mimeType?: string): { data: DolabAudioRecordingResult | null; errorMessage?: string } {
  if (!uri) return { data: null, errorMessage: DOLAB_AUDIO_SAVE_ERROR };
  return {
    data: {
      uri,
      durationMs: typeof durationMs === 'number' && durationMs > 0 ? durationMs : undefined,
      mimeType: mimeType || 'audio/m4a',
    },
  };
}
