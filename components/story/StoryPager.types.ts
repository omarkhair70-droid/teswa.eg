import type { ReactNode } from 'react';

export type StoryPagerProps = {
  activeIndex: number;
  onIndexChange: (index: number) => void;
  scrollEnabled?: boolean;
  children: ReactNode[];
};
