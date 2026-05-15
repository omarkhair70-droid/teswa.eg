import { useLocalSearchParams } from 'expo-router';
import { PlaceholderScreen } from '@/components/ui/PlaceholderScreen';
export default function Screen() { const { itemId } = useLocalSearchParams<{itemId:string}>(); return <PlaceholderScreen title="إنشاء عرض" description="بدء عرض تبديل على عنصر محدد." paramLabel={`itemId: ${itemId ?? '-'}`} />; }
