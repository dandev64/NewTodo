import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { StoreProvider } from './store.tsx';
import { handleGoogleRedirect } from './lib/google.ts';
import { completeSignIn } from './lib/account.ts';

// Must run before render so the token Google put in the URL hash is consumed exactly once.
const redirect = handleGoogleRedirect();
if (redirect.signIn) void completeSignIn(redirect.signIn.idToken, redirect.signIn.nonce);
const notice = redirect.error ?? null;

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js'));
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreProvider>
      <App notice={notice} />
    </StoreProvider>
  </StrictMode>,
);
