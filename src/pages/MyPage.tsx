import { useStore } from '../store';
import { addDays, todayKey } from '../lib/date';
import { connectGoogle, disconnectGoogle, useGoogleAuth } from '../lib/google';

export function MyPage() {
  const { state, dispatch } = useStore();
  const google = useGoogleAuth();
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
        <div className="avatar">🙂</div>
        <div>
          <div className="profile-name">Me</div>
          <div className="muted">Stored on this device</div>
        </div>
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
                  ? (google.calendarName ?? 'Connected') + (google.valid ? '' : ' · session expired')
                  : 'Show your events on Home'}
            </div>
          </div>
          {google.configured && !google.connected && (
            <button className="pill-btn" onClick={connectGoogle}>Connect</button>
          )}
          {google.connected && (
            <span className="settings-actions">
              {!google.valid && <button className="pill-btn" onClick={connectGoogle}>Reconnect</button>}
              <button className="pill-btn" onClick={disconnectGoogle}>Disconnect</button>
            </span>
          )}
          {!google.configured && <span className="badge">Setup needed</span>}
        </li>
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
            onClick={() => confirm('Delete all goals and todos on this device?') && dispatch({ type: 'reset' })}
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
