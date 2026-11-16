// «قوالب الحركة» on a fixture, for qa/motion-ribbons.cjs: the real MotionStudio page with the site's own fonts. The page
// needs a signed-in person only for its tab bar to the studio (MotionTabs), which is replaced by fake-motion-tabs.tsx.
import { createRoot } from 'react-dom/client';
import '@fontsource/ibm-plex-sans-arabic/400.css';
import '@fontsource/ibm-plex-sans-arabic/500.css';
import '@fontsource/ibm-plex-sans-arabic/600.css';
import '@fontsource/ibm-plex-sans-arabic/700.css';
import '@fontsource/reem-kufi/500.css';
import '@fontsource/reem-kufi/600.css';
import '@fontsource/aref-ruqaa/700.css';
import MotionStudio from '../../src/components/motion-studio';

createRoot(document.getElementById('root')!).render(<main id="main"><MotionStudio /></main>);
