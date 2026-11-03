// The circled "!" of a guide, open, on its own (qa/guide-modal.cjs): the Google guide, or the one named by ?guide=.
import { createRoot } from 'react-dom/client';
import { SetupGuide } from '@/components/setup-guide';

const guide = new URLSearchParams(window.location.search).get('guide') ?? 'google';

createRoot(document.getElementById('root')!).render(
  <main>
    <SetupGuide guide={guide} provider={guide} initialOpen />
  </main>,
);
