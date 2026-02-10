import React, { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import Animated, {
  Easing,
  interpolate,
  useAnimatedProps,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { colors } from '../theme/colors';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export type InfinityVisualMode = 'idle' | 'listening' | 'thinking' | 'solid';

type Props = {
  size?: number;
  mode: InfinityVisualMode;
  particleCount?: number;
};

function clamp(v: number, min: number, max: number) {
  'worklet';
  return Math.max(min, Math.min(max, v));
}

/**
 * Animated "pixel fragments" tracing a lemniscate (infinity) curve.
 * This is a lightweight, cross-platform animation (no images required).
 */
export default function InfinityListeningVisual({
  size = 260,
  mode,
  particleCount = 56,
}: Props) {
  const t = useSharedValue(0);
  const aura = useSharedValue(0);
  const solid = useSharedValue(0);

  useEffect(() => {
    // motion
    const shouldSpin = mode === 'listening' || mode === 'thinking';
    if (shouldSpin) {
      t.value = withRepeat(
        withTiming(1, { duration: 2200, easing: Easing.linear }),
        -1,
        false
      );
    } else {
      t.value = withTiming(0, { duration: 500, easing: Easing.out(Easing.cubic) });
    }

    // aura
    const shouldGlow = mode === 'thinking' || mode === 'listening';
    aura.value = shouldGlow
      ? withRepeat(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }), -1, true)
      : withTiming(0, { duration: 250 });

    // solidify
    solid.value = mode === 'solid' || mode === 'idle' ? withTiming(1, { duration: 350 }) : withTiming(0, { duration: 250 });
  }, [aura, mode, solid, t]);

  const particles = useMemo(() => {
    return new Array(particleCount).fill(0).map((_, i) => ({
      id: i,
      phase: i / particleCount,
      radius: 2.1 + (i % 4) * 0.35,
      alpha: 0.65 - (i % 5) * 0.08,
    }));
  }, [particleCount]);

  const s = size;
  const cx = s / 2;
  const cy = s / 2;
  const a = s * 0.22; // scale

  // Parametric lemniscate of Bernoulli
  // x = a * cos(theta) / (1 + sin^2(theta))
  // y = a * sin(theta) * cos(theta) / (1 + sin^2(theta))
  // then scale y a bit to look nicer in the viewport.

  return (
    <View style={[styles.wrap, { width: s, height: s }]}>
      {/* Aura (simple layered rings) */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.aura,
          {
            width: s,
            height: s,
            borderRadius: s / 2,
          },
        ]}
      />

      <Svg width={s} height={s}>
        {particles.map((p) => {
          const animatedProps = useAnimatedProps(() => {
            const theta = 2 * Math.PI * (t.value + p.phase);
            const denom = 1 + Math.pow(Math.sin(theta), 2);
            const x = (a * Math.cos(theta)) / denom;
            const y = (a * Math.sin(theta) * Math.cos(theta)) / denom;

            const jitter = 1.6 * Math.sin(2 * Math.PI * (t.value + p.phase * 3));
            const px = cx + x * 2.15 + jitter;
            const py = cy + y * 3.0;

            const solidK = solid.value;
            const fade = interpolate(solidK, [0, 1], [1, 0.15]);

            return {
              cx: px,
              cy: py,
              opacity: clamp(p.alpha * fade, 0.05, 1),
            } as any;
          });

          return (
            <AnimatedCircle
              key={p.id}
              animatedProps={animatedProps}
              r={p.radius}
              fill={colors.primary}
            />
          );
        })}

        {/* Solid infinity mark (two bigger dots clusters) */}
        <AnimatedSolidMark size={s} solid={solid} />
      </Svg>
    </View>
  );
}

function AnimatedSolidMark({ size, solid }: { size: number; solid: Animated.SharedValue<number> }) {
  const s = size;
  const cx = s / 2;
  const cy = s / 2;

  const left = useAnimatedProps(() => {
    return {
      opacity: solid.value,
    } as any;
  });

  const right = useAnimatedProps(() => {
    return {
      opacity: solid.value,
    } as any;
  });

  // Draw the infinity as two loops using dot clusters (keeps it "pixel" themed)
  const dots = 18;
  const r = s * 0.095;
  const gap = s * 0.13;

  const leftCx = cx - gap;
  const rightCx = cx + gap;

  const pointsL = new Array(dots).fill(0).map((_, i) => {
    const ang = (2 * Math.PI * i) / dots;
    return {
      x: leftCx + Math.cos(ang) * r,
      y: cy + Math.sin(ang) * r,
    };
  });

  const pointsR = new Array(dots).fill(0).map((_, i) => {
    const ang = (2 * Math.PI * i) / dots;
    return {
      x: rightCx + Math.cos(ang) * r,
      y: cy + Math.sin(ang) * r,
    };
  });

  return (
    <>
      {pointsL.map((pt, idx) => (
        <AnimatedCircle
          key={`l-${idx}`}
          animatedProps={left}
          cx={pt.x}
          cy={pt.y}
          r={2.8}
          fill={colors.text}
          opacity={0}
        />
      ))}
      {pointsR.map((pt, idx) => (
        <AnimatedCircle
          key={`r-${idx}`}
          animatedProps={right}
          cx={pt.x}
          cy={pt.y}
          r={2.8}
          fill={colors.text}
          opacity={0}
        />
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  aura: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: 'rgba(46,209,255,0.18)',
  },
});
