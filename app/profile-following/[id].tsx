import { useLocalSearchParams } from 'expo-router';
import { ProfileConnectionsScreen } from '@/components/profile/ProfileConnectionsScreen';

function normalizeRouteParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0]?.trim() ?? '';
  return value?.trim() ?? '';
}

export default function FollowingScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  return <ProfileConnectionsScreen profileUserId={normalizeRouteParam(params.id)} mode="following" />;
}
