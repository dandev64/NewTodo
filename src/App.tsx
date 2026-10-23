import { useState } from 'react';
import { HomePage } from './pages/HomePage';
import { BoardPage } from './pages/BoardPage';
import { GoalsPage } from './pages/GoalsPage';
import { MyPage } from './pages/MyPage';
import { BoardIcon, FlagIcon, HomeIcon, UserIcon } from './components/icons';
import { useGoogleSync } from './lib/gcalSync';
import './App.css';

type Tab = 'home' | 'board' | 'goals' | 'my';

const TABS: { id: Tab; label: string; icon: typeof HomeIcon }[] = [
  { id: 'home', label: 'Home', icon: HomeIcon },
  { id: 'board', label: 'Board', icon: BoardIcon },
  { id: 'goals', label: 'Goals', icon: FlagIcon },
  { id: 'my', label: 'My', icon: UserIcon },
];

export default function App({ notice }: { notice?: string | null }) {
  const [tab, setTab] = useState<Tab>('home');
  const [banner, setBanner] = useState(notice ?? null);
  useGoogleSync();

  return (
    <div className="app">
      {banner && (
        <div className="banner" role="alert">
          <span>{banner}</span>
          <button onClick={() => setBanner(null)} aria-label="Dismiss">✕</button>
        </div>
      )}
      <main className="content">
        {tab === 'home' && <HomePage onGoToGoals={() => setTab('goals')} />}
        {tab === 'board' && <BoardPage />}
        {tab === 'goals' && <GoalsPage />}
        {tab === 'my' && <MyPage />}
      </main>

      <nav className="tabbar">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} className={`tab ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>
            <Icon size={22} strokeWidth={tab === id ? 2.4 : 1.8} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
