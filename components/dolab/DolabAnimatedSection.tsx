import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, type ViewStyle } from 'react-native';

type Props = {
  children: React.ReactNode;
  delay?: number;
  style?: ViewStyle;
};

export function DolabAnimatedSection({ children, delay = 0, style }: Props) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(10)).current;

  useEffect(() => {
    const animation = Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 260, delay, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 280, delay, useNativeDriver: true }),
    ]);

    animation.start();

    return () => {
      animation.stop();
      opacity.stopAnimation();
      translateY.stopAnimation();
    };
  }, [delay, opacity, translateY]);

  return (
    <Animated.View style={[styles.wrap, style, { opacity, transform: [{ translateY }] }]}>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
  },
});
