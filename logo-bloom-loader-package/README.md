# Logo Bloom Loader Package

This package contains an implementation of the capsule-to-rosette loading animation described in the conversation.

## Files

- `logo-bloom-loader-motion-lab.html` — standalone interactive tuning lab.
- `LogoBloomLoader.jsx` — reusable React component.
- `MOTION_SPEC.md` — geometry, timing, and motion specification.

## Run the motion lab

No install or server is required.

Open:

`logo-bloom-loader-motion-lab.html`

directly in Chrome or Edge.

## Recommended comparison process

Use this implementation and the Antigravity implementation side by side.

Judge them on:

- whether the collapsed state truly reads as one capsule
- whether all capsules remain centered while unfolding
- smoothness of acceleration/deceleration
- readability of the expanded rosette
- quality at small sizes such as 24–48 px
- whether the hold durations feel intentional rather than frozen
- whether the loop has any visible reset or jump
- how easy it is to export the final chosen values

The preferred design should then become the canonical motion specification for later projects.
