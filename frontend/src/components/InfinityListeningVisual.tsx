import React, { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
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
const AnimatedRect = Animated.createAnimatedComponent(Rect);

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
  // More, smaller particles looks smoother on mobile
  particleCount = 320,
}: Props) {
  const t = useSharedValue(0);
  const aura = useSharedValue(0);
  const solid = useSharedValue(0);

  useEffect(() => {
    // motion
    const shouldSpin = mode === 'listening' || mode === 'thinking';
    if (shouldSpin) {
      t.value = withRepeat(
        // slower spin
        withTiming(1, { duration: 1600, easing: Easing.linear }),
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

  const STRANDS = 8;

  const particles = useMemo(() => {
    // Multi-helix twist: multiple strands with phase offsets.
    return new Array(particleCount).fill(0).map((_, i) => {
      const strand = i % STRANDS; // 0..STRANDS-1
      return {
        id: i,
        phase: i / particleCount,
        strand,
        // ~4x thicker than before
        // more, smaller pixels (keep strands thick via density instead of huge dots)
        radius: 2.2 + (i % 3) * 0.55,
        alpha: 0.58 - (i % 6) * 0.06,
      };
    });
  }, [particleCount]);

  const s = size;
  const cx = s / 2;
  const cy = s / 2;
  const a = s * 0.22; // scale

  // Quadruple helix separation (tighter than before)
  const helix = s * 0.014;

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
        <Defs>
          <RadialGradient id="pxGlow" cx="50%" cy="50%" rx="50%" ry="50%" fx="50%" fy="50%">
            <Stop offset="0%" stopColor="#FFFFFF" stopOpacity={0.75} />
            <Stop offset="35%" stopColor={colors.primary} stopOpacity={0.90} />
            <Stop offset="100%" stopColor={colors.primary} stopOpacity={0.20} />
          </RadialGradient>
        </Defs>
        {particles.map((p) => {
          const animatedProps = useAnimatedProps(() => {
            const theta = 2 * Math.PI * (t.value + p.phase);
            const denom = 1 + Math.pow(Math.sin(theta), 2);
            const x = (a * Math.cos(theta)) / denom;
            const y = (a * Math.sin(theta) * Math.cos(theta)) / denom;

            // DNA-like twist: two strands wobble in opposite directions around the curve
            const wobbleBase = helix * Math.sin(2 * Math.PI * (t.value * 1.25 + p.phase * 2.2));
            // 4 strands with offsets around the curve
            const strandOffset = (p.strand - 1.5) / 1.5; // -1..1
            const wobble = wobbleBase * strandOffset;
            const px = cx + x * 2.15 + wobble;
            const py = cy + y * 3.0 + wobble * 0.22 * -1;

            const solidK = solid.value;
            const fade = interpolate(solidK, [0, 1], [1, 0.15]);

            return {
              cx: px,
              cy: py,
              opacity: clamp(p.alpha * fade, 0.05, 1),
            } as any;
          });

          // Use square-ish "pixels" instead of circles to match the reference look.
          const rectProps = useAnimatedProps(() => {
            const theta = 2 * Math.PI * (t.value + p.phase);
            const denom = 1 + Math.pow(Math.sin(theta), 2);
            const x = (a * Math.cos(theta)) / denom;
            const y = (a * Math.sin(theta) * Math.cos(theta)) / denom;

            const wobbleBase = helix * Math.sin(2 * Math.PI * (t.value * 1.25 + p.phase * 2.2));
            const strandOffset = (p.strand - 1.5) / 1.5;
            const wobble = wobbleBase * strandOffset;

            const px = cx + x * 2.15 + wobble;
            const py = cy + y * 3.0 + wobble * 0.22 * -1;

            const solidK = solid.value;
            const fade = interpolate(solidK, [0, 1], [1, 0.15]);
            const opacity = clamp(p.alpha * fade, 0.05, 1);

            const size = p.radius * 2;
            return {
              x: px - size / 2,
              y: py - size / 2,
              width: size,
              height: size,
              rx: 1.2,
              ry: 1.2,
              opacity,
            } as any;
          });

          return (
            <AnimatedRect
              key={p.id}
              animatedProps={rectProps}
              fill="url(#pxGlow)"
            />
          );
        })}

        {/* Solid infinity mark (two bigger dots clusters) */}
        <AnimatedSolidMark size={s} solid={solid} />
      </Svg>
    </View>
  );
}

function AnimatedSolidMark({ size, solid }: { size: number; solid: any }) {
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
