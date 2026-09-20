# Logo Loading Animation Motion Lab

An interactive, zero-dependency visual and motion tuning laboratory for the branded Comms Hub logo loading animation.

---

## 1. Overview and Purpose

The Motion Lab is an engineering sandbox designed for visual exploration, timing calibration, and geometric tuning of a bespoke brand loading mark. 

Rather than settling on hardcoded parameters in advance, this prototype allows you to adjust every aesthetic and mechanical dimension of the animation in real time, preview the mark at both magnified workbench scale and true UI target dimensions, and export the exact configuration for downstream production implementation.

---

## 2. Core Animation Concept

The animation is founded on a pure geometric transformation:

```
[ One Horizontal Capsule ] 
         |
         v  (Bloom / Unfold)
[ Symmetrical 8-Petal Rosette ] 
         |
         v  (Expanded Hold)
[ Fully Resolved Brand Mark ] 
         |
         v  (Collapse / Fold)
[ One Horizontal Capsule ] 
         |
         v  (Collapsed Hold)
      Repeat
```

### The Geometry
- The symbol is constructed from **four identical elongated capsules**.
- Each capsule is an outline with no fill (`fill="none"`), rendered with fully rounded circular caps ($rx = ry = \text{height} / 2$).
- All four capsules share the exact same geometric center point $(0, 0)$ and rotate about that shared origin.
- **Collapsed State**: All four capsules align at $0^\circ$ (plus base rotation). Because their geometry and centers coincide, they overlap to form a single, crisp horizontal pill.
- **Expanded State**: The capsules unfold to distinct distributed angles (nominally $0^\circ, 45^\circ, 90^\circ, 135^\circ$). Their intersecting outlines form a woven 8-petal rosette mark.

---

## 3. How to Run

1. Open `logo-loader-motion-lab.html` directly in any modern browser (Chrome, Edge, Firefox, Safari).
2. No local web server, npm install, build step, or network connection is required.
3. The lab runs entirely in local browser memory with zero external assets, fonts, or scripts.

---

## 4. Control Guide

### Motion Presets
Quick-profile buttons that instantly populate the workbench with curated timing profiles:
- **Balanced (Default)**: 2000 ms total cycle, smooth ease-in-out easing, 120x36 geometry, zero overshoot or stagger.
- **Calm**: 3200 ms total cycle, soft easing, restrained 2.5px stroke, 30 ms subtle stagger.
- **Fast**: 1200 ms snappy loop for rapid transactional states.
- **Snappy**: 1400 ms cycle with subtle 3.5-degree overshoot settling.
- **Reset Defaults**: Reverts all settings to the baseline configuration.

### Cycle and Phase Timing
- **Cycle Duration**: Master duration slider (0.5s to 8.0s) that proportionally scales all phases.
- **Bloom Duration**: Milliseconds spent transitioning from the collapsed single capsule to the full rosette.
- **Expanded Hold**: Dwell duration at full bloom to allow brand recognition.
- **Collapse Duration**: Milliseconds spent folding back into the single capsule.
- **Collapsed Hold**: Rest duration in the collapsed state before the next bloom.

### Capsule Geometry
- **Capsule Length**: Total SVG unit length of each capsule.
- **Capsule Height**: Total SVG unit height. The corner radius automatically tracks $\text{height} / 2$ to maintain continuous rounded caps.
- **Stroke Thickness**: Line weight of the outline, tunable in fine 0.25 unit increments.
- **Loader Scale**: Global scale factor (25% to 250%) of the symbol within the coordinate system.
- **Center X / Y Offsets**: Fine translation alignment controls.
- **Aspect Ratio Readout**: Live ratio of length to height.

### Color and Appearance
- **Stroke Color**: HTML color picker and editable hexadecimal input (default `#B99445`).
- **Stage Background**: Live stage color picker and hex input.
- **Stroke Opacity**: Master opacity slider (5% to 100%).
- **Overlap Strategy**:
  - *Natural Geometric Overlap*: True SVG stroke rendering.
  - *Fade Duplicate Collapsed Strokes*: Progressively attenuates duplicate overlapping strokes as they approach the collapsed state to prevent color deepening when using translucent strokes.

### Rotation and Bloom
- **Angular Separation**: Master angle step between consecutive capsules (nominally $45^\circ$ for an 8-petal rosette; ranges from $15^\circ$ to $90^\circ$ for tight or wide blooms).
- **Base Rotation**: Rotates the entire assembly from $-180^\circ$ to $+180^\circ$.
- **Bloom Direction**: Clockwise or Counterclockwise.
- **Pass-Through Mode / Trajectory**:
  - *Standard Reversing ($A \to B \to A$)* [OFF]: Capsules bloom from $0^\circ \to +\text{Target}$ (State A), dwell, and collapse back to $0^\circ$ (State B).
  - *Full 360 Forward ($90 \to 0 \to -90 \to 180$)* [ON]: Continuous unidirectional forward revolution without reversing. Geometrically, there are only 2 stops in the entire loop:
    1. **Expanded Rosette** ($90 \mid -90$ for shape 2, $45 \mid -135$ for shape 1, $135 \mid -45$ for shape 3).
    2. **Collapsed Single Pill** ($0 \mid 180$ for all shapes).
    Because a rounded capsule has $180^\circ$ rotational symmetry ($\theta \equiv \theta \pm 180^\circ$), $-90^\circ \equiv +90^\circ$, $-135^\circ \equiv +45^\circ$, $-45^\circ \equiv +135^\circ$, and $180^\circ \equiv 0^\circ$. Every shape revolves forward smoothly across a full $360^\circ$ circle with zero backward motion.
  - *Pass-Through Alternating Swing ($A \to B \to C \to B$)*: Bidirectional swing blooming to Positive Rosette ($A$), passing through horizontal ($B$), blooming to Negative Rosette ($C$), and returning.

### Mathematical Verification of the 2-Stop Full 360 Loop
Every capsule completes exactly one full revolution ($360^\circ$) without intermediate pauses, pausing only at Expanded and Collapsed:
- **Shape 2 ($90^\circ$ Petal)**:
  $90^\circ \to 0^\circ \to -90^\circ \to -180^\circ \equiv 180^\circ \to -270^\circ \equiv 90^\circ$.
  Stops: $90 \mid -90$ (Expanded) and $0 \mid 180$ (Collapsed).
  Deltas: $-90^\circ, -90^\circ, -90^\circ, -90^\circ$. Total: $-360^\circ$.
- **Shape 1 ($45^\circ$ Petal)**:
  $45^\circ \to 0^\circ \to -135^\circ \to -180^\circ \equiv 180^\circ \to -315^\circ \equiv 45^\circ$.
  Stops: $45 \mid -135$ (Expanded) and $0 \mid 180$ (Collapsed).
  Deltas: $-45^\circ, -135^\circ, -45^\circ, -135^\circ$. Total: $-360^\circ$.
- **Shape 3 ($135^\circ$ Petal)**:
  $135^\circ \to 0^\circ \to -45^\circ \to -180^\circ \equiv 180^\circ \to -225^\circ \equiv 135^\circ$.
  Stops: $135 \mid -45$ (Expanded) and $0 \mid 180$ (Collapsed).
  Deltas: $-135^\circ, -45^\circ, -135^\circ, -45^\circ$. Total: $-360^\circ$.
- **Shape 0 (Baseline Anchor)**:
  Stays stable at $0^\circ \equiv 180^\circ$ as the reference horizontal line around which the petals orbit (or rotates with the entire assembly when continuous rotation is enabled).
- **Overshoot**: Damped excursion angle ($0^\circ$ to $20^\circ$) during bloom settling.
- **Capsule Stagger**: Micro-timing delay ($0$ to $200$ ms) between capsule movements.
- **Stagger Order**: Forward ($0 \to 3$), Reverse ($3 \to 0$), or Center-out.
- **Whole Shape Continuous Rotation**:
  - *Enable Rotation*: Toggle continuous assembly rotation on or off.
  - *Rotation Speed*: Revolution period in seconds ($1.0$s to $30.0$s per $360^\circ$ turn) with live degrees per second readout.
  - *Rotation Direction*: Clockwise or Counterclockwise assembly rotation.

### Easing Curve Editor
- **Preset Curves**: Ease In-Out, Ease, Ease In, Ease Out, Soft, Snappy, Smooth Cinematic, Linear.
- **Custom Cubic Bézier Sliders**: Direct control of control points $P_1(x_1, y_1)$ and $P_2(x_2, y_2)$ for `cubic-bezier(x1, y1, x2, y2)`.
- **Live Curve Graphic**: Interactive SVG visualization showing tangent handles and the mathematical curve.
- **Independent Collapse Easing**: Option to decouple the collapse return curve from the bloom curve.

### Transport and Playback
- **Play / Pause**: Freezes or resumes the animation loop.
- **Restart**: Rewinds to $t = 0$.
- **Step Collapsed (B)**: Jumps to the midpoint of the Collapsed Hold phase ($0^\circ$).
- **Step Expanded (+A)**: Jumps to State A ($+\text{Target}$).
- **Step Expanded (-C)**: Jumps to State C ($-\text{Target}$).
- **Interactive Scrubber**: Scrub across any point in the cycle ($0\%$ to $100\%$) with millisecond readouts.
- **Canvas Themes**: Quick toggles for White canvas, Dark canvas, or Checkerboard grid.
- **Stage Zoom**: Magnification slider (50% to 300%) for inspection.
- **Actual Size Previews**: Live synchronized replicas rendered at standard UI dimensions (16px, 24px, 32px, 48px, 64px, 96px, 128px).

---

## 5. Configuration Schema

The motion lab generates a strict JSON configuration representing the active state:

```json
{
  "version": 1,
  "geometry": {
    "capsuleCount": 4,
    "capsuleLength": 120,
    "capsuleHeight": 36,
    "strokeWidth": 3,
    "scale": 1,
    "offsetX": 0,
    "offsetY": 0
  },
  "appearance": {
    "strokeColor": "#B99445",
    "strokeOpacity": 1,
    "stageBgColor": "#FFFFFF",
    "overlapStrategy": "standard"
  },
  "rotation": {
    "baseAngle": 0,
    "angleSeparation": 45,
    "direction": "clockwise",
    "trajectory": "A-B-A",
    "passThroughEnabled": false,
    "overshoot": 0,
    "staggerMs": 0,
    "staggerOrder": "forward",
    "continuousRotation": {
      "enabled": false,
      "speedSeconds": 8,
      "direction": "clockwise"
    }
  },
  "timing": {
    "collapsedHoldMs": 550,
    "bloomMs": 550,
    "expandedHoldMs": 350,
    "collapseMs": 550,
    "totalCycleMs": 2000
  },
  "easing": {
    "preset": "ease-in-out",
    "independentCollapse": false,
    "bloom": [0.42, 0, 0.58, 1],
    "collapse": [0.42, 0, 0.58, 1]
  }
}
```

---

## 6. How to Report Approved Values

Once you have visually calibrated the motion lab to your satisfaction:

1. Click **Copy JSON**, **Copy Markdown**, or **Copy Compact Prompt** in the bottom right panel.
2. Paste the copied output back into our conversation.
3. In Phase 2, we will use your approved configuration to generate:
   - The production-grade SVG component.
   - Pure CSS `@keyframes` / Web Animations API implementations.
   - Comprehensive motion design specification document.
