# M44C — Google Play Legal Surfaces

This phase adds Teswa public/legal policy surfaces required for Google Play readiness before Play Console submission.

## What M44C adds

- Privacy Policy page (public route + in-app access).
- Terms of Use page (public route + in-app access).
- Community Guidelines/User Content Policy page (public route + in-app access).
- Public Account Deletion page (public route + in-app access).
- A reusable legal content source and presentation layer to keep policy content centralized and consistent.

## Final route list

- `/legal/privacy`
- `/legal/terms`
- `/legal/community-guidelines`
- `/account-deletion`

These routes are Expo Router pages and are compatible with static web output (`web.output = "static"`).

## Google Play Console URLs to provide later (after hosting)

After deployment/public hosting is completed operationally, provide:

- Privacy Policy URL → hosted route for `/legal/privacy`
- Account Deletion URL → hosted route for `/account-deletion`

## Scope status in this PR

- The legal/public pages are code-complete and route-ready in this PR.
- The pages are **not** hosted or published in this PR.
- No backend web deletion form is added in this PR; deletion initiation from web uses support email.

## Next phase (M44D)

Policy acceptance gating before creating/uploading UGC is still required and intentionally deferred to:

- **M44D — Policy Acceptance Gate + Play Console Declarations Pack**

## Support email used

Current centralized support contact used in legal/public surfaces:

- `asrkhair9@gmail.com`

This can be updated centrally later if Teswa adopts a branded official support email.
