// The circled "!" of the Google guide, open, on its own (qa/guide-modal.cjs).
import { createRoot } from 'react-dom/client';
import { SetupGuide } from '@/components/setup-guide';

createRoot(document.getElementById('root')!).render(
  <main>
    <SetupGuide guide="google" provider="google" initialOpen />
  </main>,
);
