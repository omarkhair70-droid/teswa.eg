# Native Android auth real-device smoke

Before Play Internal Testing promotion, verify on a device installed from Google Play:

1. Launch Teswa and confirm the native client does not depend on Expo Updates.
2. Tap Continue with Google once and select the existing test account.
3. Confirm the Google chooser returns once; Oracle exchange must not reopen Google on backend failure.
4. Confirm `POST /v1/auth/google` succeeds and the signed-in identity appears.
5. Force-stop and relaunch. The encrypted session must restore and `GET /v1/auth/session` must validate it.
6. Exercise refresh by using an expired/near-expiry test session; `POST /v1/auth/refresh` must replace it.
7. Disable connectivity while a still-valid session is stored, relaunch, and confirm the app does not destroy that valid local session solely because validation cannot reach Oracle.
8. Sign out and confirm the local encrypted session is removed immediately.

Do not promote the native client until this smoke passes against the live Oracle auth endpoint.
