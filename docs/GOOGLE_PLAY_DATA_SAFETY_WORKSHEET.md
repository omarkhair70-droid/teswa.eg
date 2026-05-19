# Teswa — Google Play Data Safety Worksheet (Working Draft)

> هذا الملف مسودة عمل داخلية. لا تعتبر إجابات نهائية حتى يتم التأكد من السلوك الإنتاجي النهائي داخل Play Console.

## Scope
- Product: Teswa mobile app.
- Draft date: 2026-05-19.
- Status: Pre-submission worksheet.

## Personal info
### Email address / authentication identity
- Collected? نعم (تسجيل دخول/هوية الحساب).
- Shared? غير مقصود كـ data sharing لأطراف خارجية لأغراض إعلانية (Verify during Play Console entry).
- Purpose: account management, app functionality, communications/security.
- Required or optional: مطلوب للحساب.
- Deletion availability: متاح عبر تدفق حذف الحساب.
- Notes: Confirm against final production behavior.

### Name / username / profile fields
- Collected? نعم.
- Shared? يظهر داخل التطبيق حسب نموذج الشبكة الاجتماعية/السوق.
- Purpose: app functionality, personalization/discovery, account management.
- Required or optional: الاسم المعروض واسم المستخدم مطلوبان لإكمال الملف.
- Deletion availability: مع حذف الحساب أو تعديل الملف.
- Notes: Verify exact Play wording for “publicly visible in app”.

## App activity
### User-generated content (listings, stories, replies, interactions)
- Collected? نعم.
- Shared? يعرض للمستخدمين داخل المنصة حسب إعدادات/تدفقات المنتج.
- Purpose: app functionality, personalization/discovery, safety moderation/reporting.
- Required or optional: اختياري للاستخدام، لكنه جوهر المنتج عند النشر.
- Deletion availability: Confirm against final production behavior.
- Notes: Verify during Play Console entry.

### Messages / in-app interactions
- Collected? نعم.
- Shared? بين المستخدمين المشاركين بالمحادثة داخل التطبيق.
- Purpose: communications, app functionality, safety.
- Required or optional: اختياري.
- Deletion availability: Confirm against final production behavior.
- Notes: Verify retention policy before final declaration.

## Photos and videos
### Listing / story / profile media
- Collected? نعم عند الرفع.
- Shared? نعم داخل التطبيق حسب صفحة/قصة/ملف المستخدم.
- Purpose: app functionality, personalization/discovery.
- Required or optional: اختياري (حسب استخدام الميزة).
- Deletion availability: Confirm against final production behavior.
- Notes: Verify during Play Console entry.

## Audio
### Voice messages / replies
- Collected? نعم عند استخدام ميزات الصوت.
- Shared? داخل المحادثة/السياق المقصود داخل التطبيق.
- Purpose: communications, app functionality.
- Required or optional: اختياري.
- Deletion availability: Confirm against final production behavior.
- Notes: Confirm microphone flow and storage lifecycle in production.

## Location
### City/area profile fields + discovery context
- Collected? نعم (profile city/area) وقد توجد سياقات اكتشاف مرتبطة.
- Shared? قد يظهر للمستخدمين داخل التطبيق حسب الواجهة.
- Purpose: personalization/discovery, app functionality.
- Required or optional: Verify during Play Console entry.
- Deletion availability: عبر تعديل الملف/حذف الحساب.
- Notes: Confirm against final production behavior.

## Device or other IDs
### Push notification token / installation identifiers
- Collected? غالباً نعم لدعم الإشعارات.
- Shared? Verify during Play Console entry.
- Purpose: communications, app functionality, security.
- Required or optional: اختياري وظيفياً لكن لازم للإشعارات.
- Deletion availability: Confirm against final production behavior.
- Notes: Confirm exact identifiers persisted in production.

## Reports / safety submissions
### User reports, block/safety events
- Collected? نعم.
- Shared? داخلياً لأغراض السلامة والامتثال.
- Purpose: security/fraud prevention, trust & safety.
- Required or optional: اختياري.
- Deletion availability: Confirm against final production behavior.
- Notes: Verify during Play Console entry.

## Final pre-submission checklist
- راجع كل بند مقابل السلوك الفعلي في نسخة Android النهائية.
- طابق الإجابات مع سياسة الخصوصية المنشورة.
- لا تعتمد هذه المسودة كإقرار نهائي بدون مراجعة قانونية/منتج.
