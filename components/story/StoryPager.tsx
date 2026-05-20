import { useEffect, useRef } from 'react';
import PagerView from 'react-native-pager-view';
import type { StoryPagerProps } from './StoryPager.types';

export function StoryPager({ activeIndex, onIndexChange, scrollEnabled = true, children }: StoryPagerProps) {
  const pagerRef = useRef<PagerView>(null);

  useEffect(() => {
    pagerRef.current?.setPage(activeIndex);
  }, [activeIndex]);

  return (
    <PagerView
      ref={pagerRef}
      style={{ flex: 1 }}
      initialPage={0}
      scrollEnabled={scrollEnabled}
      onPageSelected={(event) => onIndexChange(event.nativeEvent.position)}
    >
      {children}
    </PagerView>
  );
}
