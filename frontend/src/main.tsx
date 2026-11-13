import { createRoot } from 'react-dom/client';
import '@fontsource/be-vietnam-pro/400.css';
import '@fontsource/be-vietnam-pro/500.css';
import '@fontsource/be-vietnam-pro/600.css';
import '@fontsource/be-vietnam-pro/700.css';
import '@fontsource/be-vietnam-pro/800.css';
import './shared/styles/tokens.css';
import './shared/styles/liquid-glass.css';
import './shared/styles/app.css';
import './shared/styles/editorial.css';
import './shared/styles/cinematic.css';
import './shared/styles/components.css';
import './shared/styles/preferences.css';
import App from './app/App';

createRoot(document.getElementById('root')!).render(<App />);
