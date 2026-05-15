import { useLocalSearchParams } from 'expo-router';
import { PlaceholderScreen } from '@/components/ui/PlaceholderScreen';
export default function Screen() { const { id } = useLocalSearchParams<{id:string}>(); return <PlaceholderScreen title="تفاصيل العرض" description="عرض حالة ومحتوى عرض التبديل." paramLabel={`offerId: ${id ?? '-'}`} />; }
