import { useEffect, useMemo } from 'react';
import { LayoutChangeEvent, StyleSheet, View } from 'react-native';
import { Canvas, Circle, Fill, Group, LinearGradient, vec } from '@shopify/react-native-skia';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useDerivedValue, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

export type MotionPulseCanvasProps = {
  storiesCount: number;
  movingCount: number;
  storyItemsCount: number;
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

export function MotionPulseCanvas({ storiesCount, movingCount, storyItemsCount }: MotionPulseCanvasProps) {
  const width = useSharedValue(0);
  const height = useSharedValue(0);
  const ambientProgress = useSharedValue(0);
  const tapProgress = useSharedValue(1);
  const tapX = useSharedValue(0);
  const tapY = useSharedValue(0);

  useEffect(() => {
    ambientProgress.value = withRepeat(withTiming(1, { duration: 5200 }), -1, true);
  }, [ambientProgress]);

  const dataIntensity = useMemo(() => {
    const storiesBoost = clamp01(storiesCount / 14);
    const movingBoost = clamp01(movingCount / 10);
    const storyItemsBoost = clamp01(storyItemsCount / 14);
    return {
      storiesBoost,
      movingBoost,
      storyItemsBoost,
      aggregate: clamp01(storiesBoost * 0.34 + movingBoost * 0.4 + storyItemsBoost * 0.26),
    };
  }, [movingCount, storiesCount, storyItemsCount]);

  const centerX = useDerivedValue(() => width.value * 0.52);
  const centerY = useDerivedValue(() => height.value * 0.45);
  const baseRadius = useDerivedValue(() => Math.min(width.value, height.value) * 0.26);
  const drift = useDerivedValue(() => ambientProgress.value * Math.PI * 2);

  const outerRingRadius = useDerivedValue(() => baseRadius.value + ambientProgress.value * 26 + dataIntensity.aggregate * 12);
  const midRingRadius = useDerivedValue(() => baseRadius.value * 0.72 + (1 - ambientProgress.value) * 18 + dataIntensity.storiesBoost * 8);
  const innerGlowRadius = useDerivedValue(() => baseRadius.value * (0.72 + ambientProgress.value * 0.22) + dataIntensity.movingBoost * 9);

  const nodeOneX = useDerivedValue(() => centerX.value + Math.cos(drift.value) * (baseRadius.value * 0.7 + dataIntensity.storiesBoost * 6));
  const nodeOneY = useDerivedValue(() => centerY.value + Math.sin(drift.value) * (baseRadius.value * 0.42 + dataIntensity.movingBoost * 4));
  const nodeOneR = useDerivedValue(() => 4 + dataIntensity.storiesBoost * 3 + ambientProgress.value * 1.5);

  const nodeTwoX = useDerivedValue(() => centerX.value - Math.sin(drift.value * 0.8) * (baseRadius.value * 0.55 + dataIntensity.storyItemsBoost * 5));
  const nodeTwoY = useDerivedValue(() => centerY.value + Math.cos(drift.value * 1.2) * (baseRadius.value * 0.3 + dataIntensity.storiesBoost * 5));

  const burstRadius = useDerivedValue(() => tapProgress.value * 180);

  const tapGesture = Gesture.Tap().onStart((event) => {
    tapX.value = event.x;
    tapY.value = event.y;
    tapProgress.value = 0;
    tapProgress.value = withTiming(1, { duration: 850 });
  });

  const onLayout = (event: LayoutChangeEvent) => {
    width.value = event.nativeEvent.layout.width;
    height.value = event.nativeEvent.layout.height;
  };

  return (
    <GestureDetector gesture={tapGesture}>
      <View pointerEvents="box-only" style={styles.fill} onLayout={onLayout}>
        <Canvas style={styles.fill}>
          <Fill>
            <LinearGradient start={vec(0, 0)} end={vec(width, height)} colors={['rgba(255,255,255,0.06)', 'rgba(255,255,255,0.01)', 'rgba(255,255,255,0.05)']} />
          </Fill>
          <Group>
            <Circle cx={centerX} cy={centerY} r={outerRingRadius} color="rgba(255,255,255,0.16)" />
            <Circle cx={centerX} cy={centerY} r={midRingRadius} color="rgba(255,255,255,0.12)" />
            <Circle cx={centerX} cy={centerY} r={innerGlowRadius} color="rgba(255,255,255,0.14)" />
            <Circle cx={nodeOneX} cy={nodeOneY} r={nodeOneR} color="rgba(255,255,255,0.30)" />
            <Circle cx={nodeTwoX} cy={nodeTwoY} r={3 + dataIntensity.movingBoost * 2.2} color="rgba(255,255,255,0.24)" />
            <Circle cx={tapX} cy={tapY} r={burstRadius} color="rgba(255,255,255,0.24)" />
          </Group>
        </Canvas>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  fill: {
    ...StyleSheet.absoluteFillObject,
  },
});
