import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { StoreProvider } from './store.tsx';
import { handleGoogleRedirect } from './lib/google.ts';
import { completeSignIn } from './lib/account.ts';
import { trackVisualViewport } from './lib/viewport.ts';

trackVisualViewport();

// Must run before render so the token Google put in the URL hash is consumed exactly once.
const redirect = handleGoogleRedirect();
if (redirect.signIn) void completeSignIn(redirect.signIn.idToken, redirect.signIn.nonce);
const notice = redirect.error ?? null;

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  const hadController = !!navigator.serviceWorker.controller;
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || refreshing) return;
    refreshing = true;
    window.location.reload();
  });

  window.addEventListener('load', async () => {
    const reg = await navigator.serviceWorker.register('/sw.js');
    const check = () => reg.update().catch(() => {});
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') check();
    });
    setInterval(() => {
      if (document.visibilityState === 'visible') check();
    }, 60_000);
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreProvider>
      <App notice={notice} />
    </StoreProvider>
  </StrictMode>,
);
