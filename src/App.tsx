import { useState } from 'react';
import { HomePage } from './pages/HomePage';
import { BoardPage } from './pages/BoardPage';
import { CategoriesPage } from './pages/CategoriesPage';
import { MyPage } from './pages/MyPage';
import { BoardIcon, HomeIcon, TagIcon, UserIcon } from './components/icons';
import { useGoogleSync } from './lib/gcalSync';
import { useCloudSync } from './lib/cloudSync';
import { dismissAccountError, useAccount } from './lib/account';
import './App.css';

type Tab = 'home' | 'board' | 'categories' | 'my';

const TABS: { id: Tab; label: string; icon: typeof HomeIcon }[] = [
  { id: 'home', label: 'Home', icon: HomeIcon },
  { id: 'board', label: 'Board', icon: BoardIcon },
  { id: 'categories', label: 'Categories', icon: TagIcon },
  { id: 'my', label: 'My', icon: UserIcon },
];

export default function App({ notice }: { notice?: string | null }) {
  const [tab, setTab] = useState<Tab>('home');
  const [banner, setBanner] = useState(notice ?? null);
  useGoogleSync();
  useCloudSync();
  const account = useAccount();

  return (
    <div className="app">
      {banner && (
        <div className="banner" role="alert">
          <span>{banner}</span>
          <button onClick={() => setBanner(null)} aria-label="Dismiss">✕</button>
        </div>
      )}
      {account.error && (
        <div className="banner" role="alert">
          <span>{account.error}</span>
          <button onClick={dismissAccountError} aria-label="Dismiss">✕</button>
        </div>
      )}
      <main className="content">
        {tab === 'home' && <HomePage />}
        {tab === 'board' && <BoardPage />}
        {tab === 'categories' && <CategoriesPage />}
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
