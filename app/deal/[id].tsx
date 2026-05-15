import { useLocalSearchParams } from 'expo-router';
import { PlaceholderScreen } from '@/components/ui/PlaceholderScreen';
export default function Screen() { const { id } = useLocalSearchParams<{id:string}>(); return <PlaceholderScreen title="الصفقة" description="متابعة تفاصيل الصفقة الجارية." paramLabel={`dealId: ${id ?? '-'}`} />; }
