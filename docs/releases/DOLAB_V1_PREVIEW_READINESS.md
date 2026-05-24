# Dolab v1 — Preview Readiness

This guide is the final manual path from DB readiness to Preview validation.

## 1) OTA rule for this phase
After DB push is completed and verified, create **one Preview OTA only**.

```bash
eas update --channel preview --message "Dolab v1 preview readiness"
```

- Do **not** run production OTA yet.
- Do **not** promote to production until Preview validation is complete.

## 2) Preview APK validation
Run checks on Preview build(s):

- [ ] Logged-in behavior works end-to-end
- [ ] Logged-out behavior is safe and non-crashing
- [ ] Missing permission flows are handled
- [ ] Cancel flows (picker/capture/cancel) are handled
- [ ] Weak/unstable network behavior is acceptable
- [ ] App restart limitation scenarios are tested

## 3) Known Dolab v1 limitations
- Local pending media may not persist across app restart unless already uploaded
- Audio is placeholder only (no real recording yet)
- Share Bridge does not send direct messages yet
- Publish Bridge does not create public marketplace item yet
- Preview validation is required before any production OTA
