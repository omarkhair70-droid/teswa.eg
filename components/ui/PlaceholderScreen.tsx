import { AppScreen } from './AppScreen';
import { SectionHeader } from './SectionHeader';
import { EmptyState } from './EmptyState';
import { AppButton } from './AppButton';

export function PlaceholderScreen({ title, description, paramLabel }: { title: string; description: string; paramLabel?: string }) {
  return <AppScreen><SectionHeader title={title} subtitle={description} /><EmptyState title="قيد التطوير" description={paramLabel ?? 'شاشة تأسيسية للهيكلة والتصميم.'} /><AppButton label="إجراء تجريبي" variant="neutral" /></AppScreen>;
}
