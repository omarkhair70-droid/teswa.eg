import { useLocalSearchParams } from 'expo-router';
import { PlaceholderScreen } from '@/components/ui/PlaceholderScreen';
export default function Screen() { const { id } = useLocalSearchParams<{id:string}>(); return <PlaceholderScreen title="ملف المستخدم" description="عرض الملف العام ومؤشرات الموثوقية." paramLabel={`profileId: ${id ?? '-'}`} />; }
