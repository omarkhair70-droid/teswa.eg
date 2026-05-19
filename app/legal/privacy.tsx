import { LegalDocumentScreen } from '@/components/legal/LegalDocumentScreen';
import { privacyPolicyContent } from '@/lib/legal-content';

export default function PrivacyPolicyRoute() {
  return <LegalDocumentScreen document={privacyPolicyContent} />;
}
