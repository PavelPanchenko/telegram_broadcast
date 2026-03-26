import { useState, useEffect, useCallback } from 'react';
import { useChannels } from './hooks/useChannels';
import { useTokens } from './hooks/useTokens';
import ChannelManager from './components/ChannelManager';
import PostForm from './components/PostForm';
import PostsHistory from './components/PostsHistory';
import Templates from './components/Templates';
import ScheduledPosts from './components/ScheduledPosts';
import RecurringPosts from './components/RecurringPosts';
import ChannelRightsChecker from './components/ChannelRightsChecker';
import BotSelector from './components/BotSelector';
import UserManagement from './components/UserManagement';
import ToastContainer from './components/ToastContainer';
import ThemeToggle from './components/ThemeToggle';

/**
 * Главное приложение после входа: данные токенов/каналов подгружаются в фоне, UI не блокируется.
 */
export default function AuthenticatedApp({ user, onLogout, darkMode, setDarkMode }) {
  const [activeTab, setActiveTab] = useState('post');
  const [selectedToken, setSelectedToken] = useState(null);

  useTokens();

  const channelsNeedAvatars = activeTab === 'post' || activeTab === 'channels';
  const { data: channelsData = [], isLoading: channelsLoading } = useChannels(selectedToken, {
    includeAvatars: channelsNeedAvatars,
  });

  const channels = channelsData;
  const loading = channelsLoading;

  useEffect(() => {
    const handleSwitchTab = (event) => {
      const tabId = event.detail;
      if (tabId) setActiveTab(tabId);
    };
    window.addEventListener('switchTab', handleSwitchTab);
    return () => window.removeEventListener('switchTab', handleSwitchTab);
  }, []);

  useEffect(() => {
    const handleShowChannelGroups = () => setActiveTab('channels');
    window.addEventListener('showChannelGroups', handleShowChannelGroups);
    return () => window.removeEventListener('showChannelGroups', handleShowChannelGroups);
  }, []);

  const handleBotChange = useCallback((tokenId) => {
    setSelectedToken(tokenId);
  }, []);

  const handleChannelAdded = () => {};
  const handleChannelDeleted = () => {};

  const handleTemplateSelect = (text) => {
    const event = new CustomEvent('templateSelected', { detail: { text } });
    window.dispatchEvent(event);
    setActiveTab('post');
  };

  const tabs = [
    { id: 'post', label: 'Создать пост' },
    { id: 'channels', label: 'Каналы' },
    { id: 'templates', label: 'Шаблоны' },
    { id: 'scheduled', label: 'Запланированные' },
    { id: 'recurring', label: 'Автоматические' },
    { id: 'history', label: 'История' },
    { id: 'rights', label: 'Проверка прав' },
    ...(user?.role === 'admin' ? [{ id: 'users', label: 'Пользователи' }] : []),
    ...(user?.role === 'user' ? [{ id: 'users', label: 'Помощники' }] : []),
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-950">
      <div className="container mx-auto px-2 sm:px-4 py-4 sm:py-8 max-w-6xl">
        <div className="mb-4 sm:mb-8">
          <div className="flex items-center justify-between mb-3 sm:mb-0">
            <h1 className="text-xl sm:text-3xl font-bold text-gray-900 dark:text-white">
              Telegram Broadcast
            </h1>
            <button
              type="button"
              onClick={onLogout}
              className="px-3 py-1.5 text-xs sm:text-sm bg-gray-600 text-white rounded hover:bg-gray-700 dark:bg-gray-500 dark:hover:bg-gray-600 whitespace-nowrap sm:hidden"
            >
              Выйти
            </button>
          </div>

          <div className="flex items-center justify-between gap-2 sm:gap-4">
            <div className="flex items-center gap-2 sm:gap-4 flex-1 min-w-0">
              <ThemeToggle darkMode={darkMode} setDarkMode={setDarkMode} />
              <span className="text-xs sm:text-sm text-gray-600 dark:text-gray-300 truncate">
                {user.name} ({user.username})
              </span>
            </div>
            <button
              type="button"
              onClick={onLogout}
              className="px-3 py-1.5 text-xs sm:text-sm bg-gray-600 text-white rounded hover:bg-gray-700 dark:bg-gray-500 dark:hover:bg-gray-600 whitespace-nowrap hidden sm:block"
            >
              Выйти
            </button>
          </div>
        </div>

        <BotSelector onBotChange={handleBotChange} userRole={user?.role} />

        <div className="mb-4 sm:mb-6 border-b border-gray-200 dark:border-slate-700">
          <nav className="flex space-x-1 overflow-x-auto pb-1 -mb-px scrollbar-hide">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="space-y-4 sm:space-y-8">
          {activeTab === 'post' && (
            <PostForm channels={channels} token={selectedToken} channelsLoading={channelsLoading} />
          )}

          {activeTab === 'channels' && (
            <ChannelManager
              channels={channels}
              onChannelAdded={handleChannelAdded}
              onChannelDeleted={handleChannelDeleted}
              loading={loading}
              token={selectedToken}
            />
          )}

          {activeTab === 'templates' && (
            <Templates onSelectTemplate={handleTemplateSelect} token={selectedToken} />
          )}

          {activeTab === 'scheduled' && <ScheduledPosts token={selectedToken} />}

          {activeTab === 'recurring' && (
            <RecurringPosts token={selectedToken} channels={channels} />
          )}

          {activeTab === 'history' && (
            <PostsHistory
              token={selectedToken}
              onCopyPost={(post) => {
                setActiveTab('post');
                setTimeout(() => {
                  window.dispatchEvent(new CustomEvent('copyPost', { detail: post }));
                }, 100);
              }}
            />
          )}

          {activeTab === 'rights' && <ChannelRightsChecker token={selectedToken} />}

          {activeTab === 'users' && <UserManagement currentUser={user} />}
        </div>

        <ToastContainer />

        <footer className="mt-12 pt-6 border-t border-gray-200 dark:border-slate-700 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            © {new Date().getFullYear()} Сделано с душой
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Made by{' '}
            <a
              href="https://t.me/Panchenko_Pavel"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-blue-600 hover:text-blue-700 hover:underline"
            >
              Pavel Panchenko
            </a>
          </p>
        </footer>
      </div>
    </div>
  );
}
