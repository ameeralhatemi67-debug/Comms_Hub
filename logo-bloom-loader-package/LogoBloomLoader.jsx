import React, { useEffect, useMemo, useRef } from "react";

/**
 * LogoBloomLoader
 *
 * Four identical outlined capsules share one center point.
 * They unfold from 0° into [0, spread, 2*spread, 3*spread],
 * hold, then collapse back to 0°.
 *
 * Uses the Web Animations API so phase timing can be configured without
 * generating dynamic CSS keyframes.
 */
export default function LogoBloomLoader({
  size = 48,
  capsuleLength = 132,
  capsuleHeight = 38,
  strokeWidth = 3,
  color = "#B99445",
  opacity = 1,
  spread = 45,
  baseAngle = 0,
  direction = "clockwise",
  collapsedHoldMs = 220,
  bloomMs = 480,
  expandedHoldMs = 300,
  collapseMs = 480,
  easing = "cubic-bezier(0.42, 0, 0.58, 1)",
  scale = 1,
  paused = false,
  ariaLabel = "Loading"
}) {
  const refs = [useRef(null), useRef(null), useRef(null), useRef(null)];
  const animations = useRef([]);

  const total = collapsedHoldMs + bloomMs + expandedHoldMs + collapseMs;
  const offsets = useMemo(() => {
    if (!total) return [0, 0, 0, 1];
    const a = collapsedHoldMs / total;
    const b = (collapsedHoldMs + bloomMs) / total;
    const c = (collapsedHoldMs + bloomMs + expandedHoldMs) / total;
    return [0, a, b, c, 1];
  }, [collapsedHoldMs, bloomMs, expandedHoldMs, collapseMs, total]);

  useEffect(() => {
    animations.current.forEach(a => a.cancel());
    animations.current = [];

    const sign = direction === "counterclockwise" ? -1 : 1;

    refs.forEach((ref, index) => {
      const node = ref.current;
      if (!node || !total) return;

      const target = index * spread * sign;

      const animation = node.animate(
        [
          { transform: "rotate(0deg)", offset: offsets[0] },
          { transform: "rotate(0deg)", offset: offsets[1], easing },
          { transform: `rotate(${target}deg)`, offset: offsets[2] },
          { transform: `rotate(${target}deg)`, offset: offsets[3], easing },
          { transform: "rotate(0deg)", offset: offsets[4] }
        ],
        {
          duration: total,
          iterations: Infinity,
          fill: "both"
        }
      );

      if (paused) animation.pause();
      animations.current.push(animation);
    });

    return () => animations.current.forEach(a => a.cancel());
  }, [spread, direction, total, easing, paused, offsets]);

  useEffect(() => {
    animations.current.forEach(a => {
      if (paused) a.pause();
      else a.play();
    });
  }, [paused]);

  const x = -capsuleLength / 2;
  const y = -capsuleHeight / 2;
  const radius = capsuleHeight / 2;

  return (
    <svg
      width={size}
      height={size}
      viewBox="-140 -140 280 280"
      role="img"
      aria-label={ariaLabel}
      style={{ overflow: "visible", display: "block" }}
    >
      <g transform={`rotate(${baseAngle}) scale(${scale})`}>
        {[0, 1, 2, 3].map(index => (
          <g
            key={index}
            ref={refs[index]}
            style={{
              transformBox: "fill-box",
              transformOrigin: "center",
              willChange: "transform"
            }}
          >
            <rect
              x={x}
              y={y}
              width={capsuleLength}
              height={capsuleHeight}
              rx={radius}
              ry={radius}
              fill="none"
              stroke={color}
              strokeWidth={strokeWidth}
              opacity={opacity}
              vectorEffect="non-scaling-stroke"
            />
          </g>
        ))}
      </g>
    </svg>
  );
}
