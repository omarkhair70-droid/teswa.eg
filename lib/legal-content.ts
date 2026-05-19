export const TESWA_SUPPORT_EMAIL = 'asrkhair9@gmail.com';

export type LegalSection = {
  heading: string;
  paragraphs?: string[];
  bullets?: string[];
};

export type LegalDocument = {
  title: string;
  subtitle: string;
  lastUpdated: string;
  sections: LegalSection[];
  contactLabel?: string;
};

export const privacyPolicyContent: LegalDocument = {
  title: 'Privacy Policy',
  subtitle:
    'Teswa is an Arabic-first mobile swap marketplace with social stories and messaging features. This policy explains how Teswa handles your information.',
  lastUpdated: 'Last updated: May 2026',
  sections: [
    {
      heading: 'Information you provide',
      bullets: [
        'Account identifiers and authentication-related profile details.',
        'Profile information such as display name, username, profile photo, cover photo, city, and area when provided.',
        'Marketplace listings, descriptions, and wanted or exchange preferences.',
        'Stories, captions, photos, videos, and other user-generated content.',
        'Messages, story replies, and voice messages.',
        'Reports submitted through safety and moderation tools.',
      ],
    },
    {
      heading: 'Permissions and optional device data',
      bullets: [
        'Camera access to capture item photos, videos, and stories.',
        'Photo/media library access to select and save media.',
        'Microphone access for voice messages and audio/video features.',
        'Location access when used for nearby and local discovery experiences.',
        'Notification permission to deliver push notifications when enabled by you.',
        'Biometric or local authentication is used on-device only to protect app access. Teswa does not receive or store biometric templates.',
      ],
    },
    {
      heading: 'How Teswa uses information',
      bullets: [
        'To authenticate users and protect account access.',
        'To power marketplace browsing, swaps, offers, deals, stories, replies, and messages.',
        'To personalize and improve local discovery where applicable.',
        'To send relevant notifications.',
        'To operate safety tools such as reporting, blocking, and moderation.',
        'To maintain app reliability, fraud prevention, and security.',
      ],
    },
    {
      heading: 'Sharing and disclosure',
      paragraphs: [
        'Content you post publicly in Teswa may be visible to other users.',
        'Teswa may use service providers for core app operations, including authentication, database, storage, backend processing, notification delivery, and sign-in services.',
      ],
      bullets: [
        'Supabase infrastructure for backend, database, and storage operations.',
        'Google Sign-In where you choose that login method.',
      ],
    },
    {
      heading: 'Retention and deletion',
      paragraphs: [
        'You can delete your account from inside the app, and you can also request deletion through the public Teswa account deletion page.',
        'When account deletion is completed, associated account data is deleted according to Teswa deletion processes. Limited retention may apply where required for security, fraud prevention, dispute handling, or legal obligations.',
      ],
    },
    {
      heading: 'Eligibility',
      paragraphs: [
        'Teswa is not intended to be used in violation of applicable age or legal eligibility requirements.',
      ],
    },
    {
      heading: 'Contact',
      paragraphs: [`For privacy questions, contact: ${TESWA_SUPPORT_EMAIL}`],
    },
  ],
  contactLabel: TESWA_SUPPORT_EMAIL,
};

export const termsOfUseContent: LegalDocument = {
  title: 'Terms of Use',
  subtitle: 'These Terms describe your responsibilities when using Teswa.',
  lastUpdated: 'Last updated: May 2026',
  sections: [
    { heading: '1) Acceptance of terms', paragraphs: ['By creating an account or using Teswa, you agree to these Terms and applicable laws.'] },
    { heading: '2) Account responsibility', paragraphs: ['You are responsible for account activity, keeping your details accurate, and protecting your login credentials.'] },
    { heading: '3) Marketplace role of Teswa', paragraphs: ['Teswa facilitates exchange interactions between users. Teswa does not guarantee the completion, quality, safety, or legality of user-to-user swaps or listings.'] },
    { heading: '4) User-generated content', paragraphs: ['You remain responsible for the content you post. You grant Teswa a limited license to host, process, display, and distribute your content only as needed to operate and improve the service.'] },
    { heading: '5) Prohibited behavior', bullets: ['Illegal activity or illegal goods.', 'Fraud, scams, deceptive offers, or coercive behavior.', 'Harassment, threats, bullying, or abuse.', 'Impersonation or identity misrepresentation.', 'Spam or repeated unwanted contact.', 'Misleading listings or intentionally false information.', 'Uploading content that violates rights, privacy, or applicable law.', 'Attempts to bypass moderation or safety systems.'] },
    { heading: '6) Safety, reporting, and blocking', paragraphs: ['Teswa may review reports, remove or restrict content, and apply account actions to protect the community and service integrity.'] },
    { heading: '7) Suspension or termination', paragraphs: ['Teswa may suspend or terminate accounts that violate these Terms, safety rules, or applicable law.'] },
    { heading: '8) Account deletion', paragraphs: ['You can request account deletion from Profile / Account inside the app, or through the public web account deletion page.'] },
    { heading: '9) Service changes and availability', paragraphs: ['Teswa may update, change, or discontinue features at any time. Service availability is not guaranteed in all regions or at all times.'] },
    { heading: '10) Contact', paragraphs: [`Questions about these Terms: ${TESWA_SUPPORT_EMAIL}`] },
  ],
  contactLabel: TESWA_SUPPORT_EMAIL,
};

export const communityGuidelinesContent: LegalDocument = {
  title: 'Community Guidelines',
  subtitle: 'Teswa is built for respectful and safe swaps. These rules apply to listings, stories, messages, profiles, and all interactions.',
  lastUpdated: 'Last updated: May 2026',
  sections: [
    {
      heading: 'Not allowed on Teswa',
      bullets: [
        'Harassment, threats, bullying, or targeted abuse.',
        'Hate speech, discriminatory abuse, or dehumanizing content.',
        'Sexual exploitation or child sexual abuse material.',
        'Illegal goods, illegal services, or illegal activity.',
        'Fraud, scams, coercion, or deceptive swap behavior.',
        'Impersonation or identity misrepresentation.',
        'Privacy violations, including sharing personal data without consent.',
        'Graphic or shocking content that is inappropriate for Teswa contexts.',
        'Spam, repeated unwanted contact, or manipulative behavior.',
        'Misleading or intentionally false listing details.',
      ],
    },
    {
      heading: 'Safety tools and enforcement',
      bullets: [
        'You can report content and users inside Teswa.',
        'You can block users to stop unwanted contact.',
        'Teswa may remove content, limit reach, or restrict account features.',
        'Serious or repeated violations can lead to permanent account action.',
      ],
    },
    {
      heading: 'Contact',
      paragraphs: [`Safety policy questions: ${TESWA_SUPPORT_EMAIL}`],
    },
  ],
  contactLabel: TESWA_SUPPORT_EMAIL,
};

export const accountDeletionContent = {
  title: 'Teswa Account Deletion',
  subtitle: 'You can request deletion of your Teswa account and associated data from this page without reinstalling the app.',
  lastUpdated: 'Last updated: May 2026',
  inAppPath: 'Profile / Account → Delete account',
  emailSubject: 'Teswa Account Deletion Request',
  requestItems: [
    'The email address used for your Teswa account (or your username).',
    'A short statement requesting account deletion.',
  ],
  securityWarnings: [
    'Do not send your password.',
    'Do not send one-time codes or authentication secrets.',
  ],
  deletionCoverage: [
    'Account and profile information.',
    'Public listings and stories tied to your account.',
    'Associated media and user content where applicable.',
    'Account-linked interaction data according to Teswa deletion processes.',
  ],
  retentionNote:
    'Limited retention may apply where required for security, fraud prevention, dispute handling, or legal obligations.',
};
