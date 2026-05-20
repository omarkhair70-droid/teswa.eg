import { View } from 'react-native';
import type { StoryPagerProps } from './StoryPager.types';

export function StoryPager({ activeIndex, children }: StoryPagerProps) {
  const safeIndex = Math.min(Math.max(0, activeIndex), Math.max(0, children.length - 1));
  return <View style={{ flex: 1 }}>{children[safeIndex] ?? null}</View>;
}
