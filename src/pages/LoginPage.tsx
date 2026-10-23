import { useEffect, useState } from 'react';
import { useAccount } from '../lib/account';
import { signInWithGoogleRedirect, useGoogleAuth } from '../lib/google';
import { CheckIcon } from '../components/icons';

type Props = {
  notice: string | null;
  onDismissNotice: () => void;
};

// The little row of day icons from the Home calendar, as a decoration.
const PREVIEW = [
  { color: '#3d7cf5', done: true },
  { color: '#ff6b6b', done: true },
  { color: '', count: 2 },
  { color: '#2ecc71', done: true },
  { color: '#f7c548', done: true },
  { color: '', count: 1 },
  { color: '#7b61ff', done: true },
];

function useOnline() {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  return online;
}

export function LoginPage({ notice, onDismissNotice }: Props) {
  const account = useAccount();
  const google = useGoogleAuth();
  const online = useOnline();
  const expired = !!account.session?.expired;

  return (
    <div className="app login">
      <div className="login-hero">
        <div className="login-mark">
          <CheckIcon size={30} strokeWidth={3.2} />
        </div>
        <h1 className="login-title">TODO mate</h1>
        <p className="login-tagline">Plan your day, check it off, and watch your calendar fill up.</p>
        <div className="login-days" aria-hidden="true">
          {PREVIEW.map((d, i) => (
            <span key={i} className={`day-icon ${d.done ? 'complete' : 'pending'}`} style={d.done ? { background: d.color } : undefined}>
              {d.done ? <CheckIcon size={14} strokeWidth={3.5} /> : d.count}
            </span>
          ))}
        </div>
      </div>

      <div className="login-card">
        {account.signingIn ? (
          <p className="login-status">
            <span className="spinner" /> Signing in…
          </p>
        ) : (
          <>
            {expired && (
              <p className="login-note">
                You were signed out. Sign in again to keep syncing. Your todos on this device are kept.
              </p>
            )}
            {notice && (
              <p className="login-error" role="alert">
                {notice}
                <button onClick={onDismissNotice} aria-label="Dismiss">✕</button>
              </p>
            )}
            {!online && <p className="login-note">You're offline. Connect to the internet to sign in.</p>}
            <button
              className="google-signin"
              disabled={!google.configured || !online}
              onClick={signInWithGoogleRedirect}
            >
              <GoogleG />
              Continue with Google
            </button>
            {!google.configured && (
              <p className="hint">Sign-in isn't set up on this build (VITE_GOOGLE_CLIENT_ID is missing).</p>
            )}
            <p className="hint login-hint">
              Use the same account on your phone and computer. Your todos and categories sync between them.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function GoogleG() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 38.2 44 33 44 24c0-1.2-.1-2.4-.4-3.5z" />
    </svg>
  );
}
