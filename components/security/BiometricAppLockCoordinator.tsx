import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '@/lib/auth';
import { authenticateTeswaAppLock, getBiometricCapabilityState, readBiometricAppLockEnabled } from '@/lib/biometric-app-lock';
import { BiometricAppLockGate } from '@/components/security/BiometricAppLockGate';

const RELOCK_AFTER_BACKGROUND_MS = 60_000;

export function BiometricAppLockCoordinator() {
  const { bootstrapReady, loadingProfile, user, profileCompleted, profileCheckError } = useAuth();
  const [lockEnabled, setLockEnabled] = useState(false);
  const [locked, setLocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'unlock' | 'recovery'>('unlock');
  const [message, setMessage] = useState<string | null>(null);
  const backgroundedAtRef = useRef<number | null>(null);
  const autoAttemptedForLockRef = useRef(false);

  const coordinatorActive = bootstrapReady && !loadingProfile && !!user && profileCompleted && !profileCheckError;

  useEffect(() => {
    let active = true;

    const hydrate = async () => {
      if (!user?.id) {
        setLockEnabled(false);
        setLocked(false);
        setBusy(false);
        setMode('unlock');
        setMessage(null);
        autoAttemptedForLockRef.current = false;
        return;
      }

      setBusy(false);
      setMode('unlock');
      setMessage(null);
      autoAttemptedForLockRef.current = false;

      const enabled = await readBiometricAppLockEnabled(user.id);
      if (!active) return;
      setLockEnabled(enabled);
      setLocked(enabled);
    };

    void hydrate();

    return () => {
      active = false;
    };
  }, [user?.id]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'background' || nextState === 'inactive') {
        backgroundedAtRef.current = Date.now();
        return;
      }

      if (nextState === 'active' && lockEnabled && coordinatorActive) {
        const elapsed = Date.now() - (backgroundedAtRef.current ?? Date.now());
        if (elapsed >= RELOCK_AFTER_BACKGROUND_MS) {
          setLocked(true);
          setMode('unlock');
          setMessage(null);
          autoAttemptedForLockRef.current = false;
        }
      }
    });

    return () => sub.remove();
  }, [coordinatorActive, lockEnabled]);

  const attemptUnlock = useCallback(async () => {
    if (!lockEnabled || busy) return;
    setBusy(true);
    setMessage(null);

    const capability = await getBiometricCapabilityState();
    if (capability.status !== 'available') {
      setMode('recovery');
      setBusy(false);
      setMessage('الحماية البيومترية غير متاحة الآن. راجع إعدادات الحماية من حسابك لاحقًا.');
      return;
    }

    const result = await authenticateTeswaAppLock('unlock');
    if (result.success) {
      setLocked(false);
      setMode('unlock');
      setMessage(null);
    } else {
      setLocked(true);
      setMode('unlock');
      setMessage('لم يتم فتح القفل. تقدر تحاول مرة تانية.');
    }
    setBusy(false);
  }, [busy, lockEnabled]);

  useEffect(() => {
    if (!coordinatorActive || !lockEnabled || !locked || autoAttemptedForLockRef.current) return;
    autoAttemptedForLockRef.current = true;
    void attemptUnlock();
  }, [attemptUnlock, coordinatorActive, lockEnabled, locked]);

  if (!coordinatorActive || !lockEnabled || !locked) return null;

  return (
    <BiometricAppLockGate
      mode={mode}
      busy={busy}
      message={message}
      onUnlock={() => void attemptUnlock()}
      onContinueWithoutBiometric={mode === 'recovery' ? () => setLocked(false) : undefined}
    />
  );
}
