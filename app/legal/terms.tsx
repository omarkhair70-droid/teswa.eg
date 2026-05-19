import { LegalDocumentScreen } from '@/components/legal/LegalDocumentScreen';
import { termsOfUseContent } from '@/lib/legal-content';

export default function TermsOfUseRoute() {
  return <LegalDocumentScreen document={termsOfUseContent} />;
}
