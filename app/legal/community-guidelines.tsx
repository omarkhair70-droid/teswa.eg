import { LegalDocumentScreen } from '@/components/legal/LegalDocumentScreen';
import { communityGuidelinesContent } from '@/lib/legal-content';

export default function CommunityGuidelinesRoute() {
  return <LegalDocumentScreen document={communityGuidelinesContent} />;
}
