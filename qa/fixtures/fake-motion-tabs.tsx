// Stand-in for src/components/studio/motion-tabs.tsx in qa/motion-ribbons.cjs: the tab bar to the studio asks who is
// signed in, and the fixture has nobody signed in. The templates page is drawn exactly as for a person without the studio.
export function MotionTabs(_: { active: 'templates' | 'studio' }) {
  return null;
}
