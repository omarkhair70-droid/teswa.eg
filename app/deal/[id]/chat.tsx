import { useLocalSearchParams } from 'expo-router';
import { PlaceholderScreen } from '@/components/ui/PlaceholderScreen';
export default function Screen() { const { id } = useLocalSearchParams<{id:string}>(); return <PlaceholderScreen title="دردشة الصفقة" description="محادثة مرتبطة بصفقة محددة بين الطرفين." paramLabel={`dealId: ${id ?? '-'}`} />; }
