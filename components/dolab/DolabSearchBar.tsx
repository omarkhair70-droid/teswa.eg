import { View } from 'react-native';
import { AppInput } from '@/components/ui/AppInput';

export function DolabSearchBar({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <View>
      <AppInput value={value} onChangeText={onChange} placeholder="ابحث في دولابك..." />
    </View>
  );
}
