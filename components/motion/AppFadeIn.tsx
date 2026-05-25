import type { PropsWithChildren } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { MotiView } from 'moti';

type AppFadeInProps = PropsWithChildren<{
  delay?: number;
  duration?: number;
  fromY?: number;
  style?: StyleProp<ViewStyle>;
}>;

export function AppFadeIn({ children, delay = 0, duration = 220, fromY = 8, style }: AppFadeInProps) {
  return (
    <MotiView
      from={{ opacity: 0, translateY: fromY }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: 'timing', delay, duration }}
      style={style}
    >
      {children}
    </MotiView>
  );
}
