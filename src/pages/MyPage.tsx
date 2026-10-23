import { useStore } from '../store';
import { addDays, todayKey } from '../lib/date';
import { connectGoogle, disconnectGoogle, signInWithGoogleRedirect, useGoogleAuth } from '../lib/google';
import { useAccount, type SyncStatus } from '../lib/account';
import { signOut } from '../lib/cloudSync';
import { gcalState } from '../lib/gcalSync';

export function MyPage() {
  const { state, dispatch } = useStore();
  const google = useGoogleAuth();
  const account = useAccount();
  const user = account.session?.user;
  const goalsById = new Map(state.goals.map((g) => [g.id, g]));
  const pendingCount =
    state.todos.filter((t) => gcalState(t, goalsById.get(t.goalId)) === 'pending').length +
    (state.gcalDeletes?.length ?? 0);
  const done = state.todos.filter((t) => t.done).length;
  const remaining = state.todos.length - done;

  // Consecutive days (ending today, or yesterday if today isn't finished yet) where every todo was done.
  const streak = (() => {
    const byDay = new Map<string, { total: number; done: number }>();
    for (const t of state.todos) {
      const s = byDay.get(t.date) ?? { total: 0, done: 0 };
      s.total++;
      if (t.done) s.done++;
      byDay.set(t.date, s);
    }
    const complete = (k: string) => {
      const s = byDay.get(k);
      return !!s && s.total > 0 && s.done === s.total;
    };
    let day = todayKey();
    if (!complete(day)) day = addDays(day, -1);
    let n = 0;
    while (complete(day)) {
      n++;
      day = addDays(day, -1);
    }
    return n;
  })();

  return (
    <div className="page">
      <header className="topbar">
        <h1 className="page-title">My</h1>
      </header>

      <div className="profile">
        <div className="avatar">
          {user?.picture ? <img src={user.picture} alt="" referrerPolicy="no-referrer" /> : user ? initial(user) : '🙂'}
        </div>
        <div className="profile-text">
          <div className="profile-name">{user ? user.name ?? user.email : 'Not signed in'}</div>
          <div className="muted">
            {account.signingIn
              ? 'Signing in…'
              : account.session?.expired
                ? 'Signed out on the server. Sign in again to sync.'
                : user
                  ? `${user.email} · ${syncLabel(account.status)}`
                  : 'Only on this device'}
          </div>
        </div>
      </div>
      <div className="account-actions">
        {!user || account.session?.expired ? (
          <>
            <button
              className="btn primary google-btn"
              disabled={!google.configured || account.signingIn}
              onClick={signInWithGoogleRedirect}
            >
              <span className="gcal-logo" /> Sign in with Google
            </button>
            <p className="hint">Use the same account on your phone and computer. Your todos sync between them.</p>
          </>
        ) : (
          <button
            className="pill-btn"
            onClick={() =>
              confirm('Sign out on this device? Your todos stay in your account and come back when you sign in again.') &&
              signOut()
            }
          >
            Sign out
          </button>
        )}
      </div>

      <div className="stats">
        <Stat label="Completed" value={done} />
        <Stat label="Remaining" value={remaining} />
        <Stat label="Day streak" value={streak} />
      </div>

      <h2 className="section-title">Calendar sync</h2>
      <ul className="settings-list">
        <li>
          <div>
            <div>Google Calendar</div>
            <div className="muted">
              {!google.configured
                ? 'Add VITE_GOOGLE_CLIENT_ID to .env.local'
                : google.connected
                  ? (google.calendarName ?? 'Connected') +
                    (!google.valid
                      ? ' · session expired'
                      : !google.canWrite
                        ? ' · view only'
                        : !google.allCalendars
                          ? ' · main calendar only'
                          : '')
                  : 'Show your events on Home'}
            </div>
          </div>
          {google.configured && !google.connected && (
            <button className="pill-btn" onClick={connectGoogle}>Connect</button>
          )}
          {google.connected && (
            <span className="settings-actions">
              {!google.valid && <button className="pill-btn" onClick={connectGoogle}>Reconnect</button>}
              {google.valid && (!google.canWrite || !google.allCalendars) && (
                <button className="pill-btn" onClick={connectGoogle}>Update permissions</button>
              )}
              <button className="pill-btn" onClick={disconnectGoogle}>Disconnect</button>
            </span>
          )}
          {!google.configured && <span className="badge">Setup needed</span>}
        </li>
        {google.connected && (
          <li>
            <div>
              <div>Add new todos automatically</div>
              <div className="muted">
                {pendingCount > 0 ? `${pendingCount} change${pendingCount > 1 ? 's' : ''} waiting to sync` : 'All-day unless you set a time'}
              </div>
            </div>
            <input
              type="checkbox"
              className="switch"
              checked={!!state.settings?.autoGcal}
              onChange={(e) => dispatch({ type: 'settings/update', patch: { autoGcal: e.target.checked } })}
            />
          </li>
        )}
        <li>
          <span>Microsoft Outlook / Teams</span>
          <span className="badge">Coming soon</span>
        </li>
      </ul>

      <h2 className="section-title">Data</h2>
      <ul className="settings-list">
        <li>
          <button
            className="link-danger"
            onClick={() => confirm(
                user
                  ? 'Delete all categories and todos? This also deletes them from your account on your other devices.'
                  : 'Delete all categories and todos on this device?',
              ) && dispatch({ type: 'reset' })}
          >
            Reset all data
          </button>
        </li>
      </ul>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="stat">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

const initial = (u: { name?: string; email: string }) => (u.name ?? u.email).trim().charAt(0).toUpperCase();

function syncLabel(status: SyncStatus): string {
  if (status.state === 'offline') return 'Offline, will sync later';
  if (status.state === 'error') return `Sync problem: ${status.error}`;
  if (!status.lastSyncAt) return 'Syncing…';
  const secs = Math.round((Date.now() - status.lastSyncAt) / 1000);
  return secs < 60 ? 'Synced just now' : `Synced ${Math.round(secs / 60)} min ago`;
}
