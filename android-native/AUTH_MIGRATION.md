# Teswa native Android auth slice

This slice replaces the Expo/React Native Google sign-in path for the new Android client while preserving the existing Teswa Oracle auth contract.

## Contract

1. Android Credential Manager requests a Google ID token using the existing Teswa web OAuth client ID.
2. The token is exchanged with `POST /v1/auth/google` as `{ "id_token": "..." }`.
3. The Oracle response is mapped from `access_token`, `refresh_token`, `expires_at`, and `user`.
4. Session material is encrypted locally with an Android Keystore AES/GCM key.
5. App startup validates a usable local session with `GET /v1/auth/session`; expired sessions use `POST /v1/auth/refresh` when a refresh token is available.
6. Sign-out clears the local session immediately and performs best-effort `POST /v1/auth/logout`.

## Reliability rules

- Google provider success and Teswa backend exchange failure are separate states.
- A backend failure never triggers a second Google account chooser.
- The Google token exchange retries once only for connection-establishment failures. Read timeouts are not retried because the server may already have created a session.
- A still-unexpired local session is retained when startup validation fails only because the network is unavailable.
- HTTP 401 expires the local session or triggers refresh; HTTP 429 remains retryable.

## Release identity

The native project keeps `applicationId = com.teswa.mobile`, `versionCode = 26`, and `versionName = 1.0.11` so the finished native client can ship as an update to the existing Play application.
