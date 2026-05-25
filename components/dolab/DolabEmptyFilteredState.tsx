import { EmptyState } from '@/components/ui/EmptyState';

export function DolabEmptyFilteredState({ description }: { description: string }) {
  return <EmptyState title="مفيش نتائج هنا" description={description} iconName="search-outline" />;
}
