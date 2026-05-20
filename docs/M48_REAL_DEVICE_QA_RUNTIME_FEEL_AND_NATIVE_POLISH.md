# M48 — Real-Device End-to-End QA, Runtime Feel & Native Polish

## 1) Executive purpose
M48 is a launch-quality runtime and polish pass for Teswa mobile. It focuses on real-device confidence, interaction responsiveness, and truthful native behavior in high-frequency flows (Stories, Motion, messaging, sharing, and location-aware discovery), without adding new product concepts.

## 2) Full manual QA matrix by product area

### B1. Auth / entry
- Splash boot and handoff to auth/session gate.
- Login (email/password) success + invalid credentials path.
- Signup success and duplicate account path.
- Google sign-in cold and warm flows.
- Profile setup submission and guardrails.
- Policy acceptance gate and re-entry checks.
- Auth stall recovery (retry and relaunch).

### B2. Profile / social
- Own profile load, edits, and persistence.
- Public profile load and navigation.
- Follow graph behavior (if M47.5 baseline present).
- Followers/following list navigation and pagination.
- Follow notification deep route (if available in baseline).

### B3. Marketplace
- Item detail render and media readiness.
- Item share link behavior and target app clickability.
- Add item flow (media + form + publish).
- Edit/manage item flows.
- Image/media handling, including compressed upload result.
- Video teaser cards and open behavior.

### B4. Stories
- Story create flow (camera/photo/video).
- Story open/view transition and first frame readiness.
- Story media transition timing and jitter checks.
- Text replies.
- Voice replies (start/stop/send/cancel and permission paths).

### B5. Motion
- Motion landing data readiness.
- Reel/video card open path.
- Viewer transition and close behavior.
- Playback stability and partial-failure fallback UI.
- Share behavior (existing capture-based share flow).

### B6. Offers / deals / messages
- Offer create/respond lifecycle.
- Deal state transitions.
- Text messaging send/read updates.
- Voice messaging record/send/playback and busy states.
- Completion confirmation path.

### B7. Notifications
- M46A event push delivery surface checks.
- M46B reminder categories operationally verified.
- Push-tap routing.
- Notification-center tap routing.

### B8. Safety / compliance
- Report flows (item/user/story/deal).
- Block flows.
- Follow/block interaction (if baseline includes it).
- Account deletion path.
- Legal/public routes.
- Policy acceptance route behavior.

### B9. Offline / network / runtime resilience
- Warm reopen state.
- Stale cache rendering behavior.
- Slow network loading and retries.
- Offline UX copy and actions.
- Recovery after network returns.

## 3) Runtime feel checklist
- Tap acknowledgment should be immediate on key actions.
- Voice recording should show active state instantly.
- Sending/uploading should expose truthful busy states.
- Story/Motion viewers should avoid rough flashes/stall ambiguity.
- Empty/loading/error states must look intentional.
- Media surfaces must clearly show response to user action.
- Share action should be explicit and reliable.
- Permission denial should offer a recoverable path (no dead-end).

## 4) User-observed issue investigations

### A1. Voice recording/sending lag
- **Audit result:** Voice recording start path exists in deal, contextual, and story reply surfaces with async permission + recorder preparation. Perceived lag came from UI active-state visibility waiting until after async steps on story/contextual paths.
- **M48 fix in this PR:** Voice composer is opened immediately before async permission/recorder init in story and contextual flows, so the user sees instant acknowledgment while setup completes.
- **Remaining real-device validation:** Verify cold-start microphone permission prompt timing and low-end device recorder init delay.

### A2. Story open / viewer feel
- **Audit result:** Story viewer already has explicit loading/unavailable states and progress gating; no redesign required.
- **M48 action:** No structural viewer redesign in this PR; focus kept on voice-reply responsiveness inside viewer.
- **Remaining validation:** First-frame readiness on older Android devices under weak network.

### A3. Motion/reel open feel
- **Audit result:** Motion viewer has dedicated loading/empty/error/partial-failure states and prewarm neighbors.
- **M48 action:** No additional code change required in this PR for Motion architecture.
- **Remaining validation:** Device-level playback smoothness and transition feel across mid/low-tier hardware.

### A4. Location/proximity truth (3 km expectation)
- **Audit result:** Current location logic is **term-based city/area matching** via reverse geocode label terms, not GPS radius-distance filtering. No true 3 km geospatial radius pipeline is present in current app logic.
- **Implication:** User expectation of strict 3 km nearby results cannot currently be guaranteed by implemented logic.
- **M48 action in this PR:** Documented truth and limitation; no map expansion or fake geospatial promise introduced.
- **Launch-safe guidance:** Product copy/ops should avoid overpromising kilometer-precision proximity until radius filtering is implemented end-to-end (data model + query layer + UX disclosure).

### A5. Item sharing not reliably clickable
- **Audit result:** Item sharing previously used `Linking.createURL('/item/:id')`, which commonly emits scheme/dev links and is not consistently clickable as public HTTPS in recipient apps.
- **M48 fix in this PR:** Added env-driven public share base (`EXPO_PUBLIC_SHARE_BASE_URL`). If valid HTTPS base exists, share uses `https://.../item/:id`. Otherwise it falls back to deep link while clearly instructing user to open Teswa/search in-app (truthful non-misleading fallback).
- **Motion share note:** Existing Motion capture sharing (expo-sharing file share) preserved as-is.

## 5) Native capability leverage decisions
- **expo-location:** Audited and confirmed active usage for reverse-geocode city/area discovery, not kilometer-radius nearby filtering.
- **expo-network:** Not activated in this PR; no direct code path added to avoid unnecessary phase expansion.
- **expo-intent-launcher:** Not activated in this PR; permission recovery UX can be added in a dedicated targeted pass if needed.
- **Reserved capabilities:** No map product or unrelated native capability expansion added.

## 6) Fixed now vs. remaining for operational real-device QA

### Fixed in this PR
1. Immediate voice interaction acknowledgment for story/contextual voice recording starts.
2. Item share link architecture upgraded to public HTTPS when configured, with truthful fallback.
3. Proximity behavior truth explicitly documented (city/area matching, no true 3 km radius currently).

### Remaining for on-device operational verification
1. Real-device latency measurements across Android device tiers for voice record start/send.
2. Story and Motion first-frame/open smoothness under constrained network.
3. Location expectation alignment in release communication until radius filtering exists.
4. End-to-end share clickability validation in WhatsApp, Telegram, Messenger, SMS, and email using production HTTPS share base.

## Scope controls observed in M48
- No payments/monetization architecture was added.
- No map UI or broad feature redesign introduced.
- Focus remained on runtime quality and launch feel.
