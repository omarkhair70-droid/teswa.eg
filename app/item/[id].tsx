import { useLocalSearchParams } from 'expo-router';
import { PlaceholderScreen } from '@/components/ui/PlaceholderScreen';
export default function Screen() { const { id } = useLocalSearchParams<{id:string}>(); return <PlaceholderScreen title="تفاصيل العنصر" description="مراجعة بيانات العنصر المعروض للتبديل." paramLabel={`itemId: ${id ?? '-'}`} />; }
