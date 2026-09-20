# Logo Bloom Loader

## Concept

The loader is built from four identical outlined capsules sharing one center point.

Collapsed state:

- All four capsules are horizontal at `0°`.
- Because they overlap perfectly, they visually read as one capsule.

Expanded state:

- Capsule 1: `0°`
- Capsule 2: `45°`
- Capsule 3: `90°`
- Capsule 4: `135°`

The four capsules therefore create an eight-petal rosette-like brand mark.

The animation should feel like the complete identity is already contained inside the single capsule and is unfolding from it.

## Default motion

1. Collapsed hold — 220 ms
2. Bloom — 480 ms
3. Expanded hold — 300 ms
4. Collapse — 480 ms
5. Repeat

Base cycle: **1480 ms**

Default easing:

`cubic-bezier(0.42, 0, 0.58, 1)`

## Default geometry

- Capsule count: 4
- Capsule length: 132 SVG units
- Capsule height: 38 SVG units
- Stroke width: 3
- Angular separation: 45°
- Base rotation: 0°
- Scale: 1

## Default appearance

- Stroke: `#B99445`
- Stroke opacity: 100%
- Fill: none
- Background: white in the tuning lab

## Motion principles

- Rotation is the foundational motion.
- All capsules remain centered.
- Capsule dimensions do not change while animating.
- No bounce by default.
- No glow.
- No particles.
- No stroke-drawing effect.
- No generic circular spinner behavior.
- Holds are intentional and should remain short enough that the loader never appears frozen.

## Included files

### `logo-bloom-loader-motion-lab.html`

Standalone browser-based tuning environment.

It includes controls for:

- speed multiplier
- phase timing
- capsule length
- capsule height
- stroke thickness
- loader scale
- angular separation
- base rotation
- stroke/background colors
- opacity
- preview zoom
- clockwise/counterclockwise direction
- stagger
- overshoot
- cubic Bézier easing
- actual-size preview
- fixed collapsed/expanded inspection
- JSON / Markdown / compact-prompt export

No external dependencies are required.

### `LogoBloomLoader.jsx`

Reusable React implementation using inline SVG and the Web Animations API.

Example:

```jsx
import LogoBloomLoader from "./LogoBloomLoader";

export default function Example() {
  return (
    <LogoBloomLoader
      size={48}
      color="#B99445"
      strokeWidth={3}
      spread={45}
      collapsedHoldMs={220}
      bloomMs={480}
      expandedHoldMs={300}
      collapseMs={480}
      easing="cubic-bezier(0.42, 0, 0.58, 1)"
    />
  );
}
```

## Tuning workflow

1. Open `logo-bloom-loader-motion-lab.html` directly in Chrome or Edge.
2. Tune the design and motion.
3. Check the loader at 16, 24, 32, 48 and 64 px.
4. Use **Copy Compact Prompt** or **Copy JSON**.
5. Send the resulting values back to the implementation agent.
6. Apply the approved values to the React or framework-specific component.

The compact-prompt export is designed specifically for this workflow.
