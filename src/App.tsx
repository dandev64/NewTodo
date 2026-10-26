import { useState } from 'react';
import { HomePage } from './pages/HomePage';
import { BoardPage } from './pages/BoardPage';
import { CategoriesPage } from './pages/CategoriesPage';
import { MyPage } from './pages/MyPage';
import { BoardIcon, HomeIcon, TagIcon, UserIcon } from './components/icons';
import { useGoogleSync } from './lib/gcalSync';
import { useCloudSync } from './lib/cloudSync';
import { dismissAccountError, useAccount } from './lib/account';
import { LoginPage } from './pages/LoginPage';
import './App.css';

type Tab = 'home' | 'board' | 'categories' | 'my';

const TABS: { id: Tab; label: string; icon: typeof HomeIcon }[] = [
  { id: 'home', label: 'Home', icon: HomeIcon },
  { id: 'board', label: 'Board', icon: BoardIcon },
  { id: 'categories', label: 'Categories', icon: TagIcon },
  { id: 'my', label: 'My', icon: UserIcon },
];

export default function App({ notice }: { notice?: string | null }) {
  const account = useAccount();
  const [banner, setBanner] = useState(notice ?? null);
  const signedIn = !!account.session && !account.session.expired;

  if (!signedIn) {
    return (
      <LoginPage
        notice={account.error ?? banner}
        onDismissNotice={() => {
          setBanner(null);
          dismissAccountError();
        }}
      />
    );
  }
  return <SignedInApp banner={banner} onDismissBanner={() => setBanner(null)} />;
}

function SignedInApp({ banner, onDismissBanner }: { banner: string | null; onDismissBanner: () => void }) {
  const [tab, setTab] = useState<Tab>('home');
  useGoogleSync();
  useCloudSync();
  const account = useAccount();

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="brand-mark">✓</span>
          <span>TODO mate</span>
        </div>
        <nav className="sidebar-nav">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={`sidebar-tab ${tab === id ? 'active' : ''}`}
              onClick={() => setTab(id)}
            >
              <Icon size={20} strokeWidth={tab === id ? 2.4 : 1.8} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
      </aside>
      <div className="app-main">
        {banner && (
          <div className="banner" role="alert">
            <span>{banner}</span>
            <button onClick={onDismissBanner} aria-label="Dismiss">✕</button>
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
      </div>

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
