import { StyleSheet, View } from 'react-native';
import LottieView from 'lottie-react-native';

export function MotionEmptyAnimation() {
  return (
    <View style={styles.wrap}>
      <LottieView source={require('@/assets/lottie/motion-empty-pulse.json')} autoPlay loop style={styles.animation} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  animation: {
    width: 132,
    height: 132,
  },
});
