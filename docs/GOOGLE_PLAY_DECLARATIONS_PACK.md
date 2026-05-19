# Teswa — Google Play Declarations Pack (M44D)

## 1) Privacy Policy URL
- Planned route: `/legal/privacy`.
- Use deployed public URL of this route during Play Console submission.

## 2) Account Deletion URL
- Planned route: `/account-deletion`.
- Use deployed public URL of this route during Play Console submission.

## 3) Ads declaration
- Current expected answer: **No ads**.
- Re-verify before submission if monetization strategy changes.

## 4) Target audience (Recommendation only)
- Recommendation: audience not directed to children; treat as general/young-adult-adult marketplace social utility.
- This is not finalized in Play Console yet.
- Final manual decision must be made by product/legal owner at submission time.

## 5) Content rating notes
- App contains UGC.
- App contains messaging/interactions.
- Safety controls include report + block.
- Final content rating questionnaire must be completed manually in Play Console.

## 6) App Access
- Core app features require login.
- Reviewer login instructions and test credentials must be provided before submission.
- See: `docs/GOOGLE_PLAY_REVIEWER_ACCESS.md`.

## 7) Sensitive/high-risk permissions notes
- Android config currently includes microphone permission path for voice features.
- Camera/photo/location may be requested at runtime via Expo plugins and feature usage.
- Final permissions declarations must be validated against the final Android App Bundle and Play Console prompts.

## 8) Data Safety
- Use worksheet: `docs/GOOGLE_PLAY_DATA_SAFETY_WORKSHEET.md`.
- Final Data Safety answers must match production behavior and published privacy policy.
