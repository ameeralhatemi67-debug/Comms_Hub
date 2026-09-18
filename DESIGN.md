# Selected design for MVP 0.1

User decision, 2026-09-19: **Direction A is the selected foundation. Direction B contributes only its larger media-preview treatment on media-centric surfaces.**

A governs information architecture, right sidebar, top bar, dashboard, hierarchy, density, panels, workflows, responsive behavior and identity. Do not adopt B's horizontal navigation, campaign-first global layout, editorial composition, or alternative information architecture. The gallery is reference material only.

Implementation tokens: Arabic Segoe UI/Tahoma, 14px body, 12px metadata, 18px panel titles, 30px page titles; 4/8/12/16/24/32 spacing; 224px sidebar, 76px collapsed sidebar, 72px header; 32px desktop and 16px mobile gutters; 1560px maximum content width; 12px panels, 7px controls; forest green primary, off-white background, white panels and subdued borders. Status text accompanies color. Desktop at 1100px+, tablet at 700–1099px, mobile below 700px uses cards and bottom navigation.

One reusable MediaPreview provides a large canvas on Work detail, Create, review and asset detail. Forms use explicit labels, visible focus and validation. Native modal dialogs trap focus and support Escape. Empty, pending, warning and failure states explain next actions. All entities and results are local simulations.
