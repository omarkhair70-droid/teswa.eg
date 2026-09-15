# Native auth slice status

Implemented on `native/android-auth-oracle-20260915`:

- Credential Manager Google ID-token acquisition with authorized-account first pass and all-account fallback.
- Existing Teswa web OAuth client ID reused for server token exchange.
- Oracle `POST /v1/auth/google`, `GET /v1/auth/session`, `POST /v1/auth/refresh`, and `POST /v1/auth/logout` contracts.
- AES/GCM encrypted session persistence backed by Android Keystore.
- Startup restore/validate/refresh flow.
- Google-provider failure separated from Oracle/network failure.
- One connection-establishment retry for Google token exchange; read timeouts are intentionally not retried.
- Native Compose signed-in/signed-out/error UI.
- Unit coverage for session expiry skew.

Pending before release: CI green, then real-device Google/Oracle smoke from Play Internal Testing. Profile/policy gates migrate in the next slice after auth acceptance.
