import { useState, useEffect } from 'react';
import { useChannels } from './hooks/useChannels';
import ChannelManager from './components/ChannelManager';
import PostForm from './components/PostForm';
import BotStatus from './components/BotStatus';
import PostsHistory from './components/PostsHistory';
import Templates from './components/Templates';
import ScheduledPosts from './components/ScheduledPosts';
import RecurringPosts from './components/RecurringPosts';
import ChannelRightsChecker from './components/ChannelRightsChecker';
import ChannelGroups from './components/ChannelGroups';
import BotSelector from './components/BotSelector';
import Login from './components/Login';
import UserManagement from './components/UserManagement';
import ToastContainer from './components/ToastContainer';
import ThemeToggle from './components/ThemeToggle';
import { parseJsonResponse } from './utils/api';

function App() {
  const [user, setUser] = useState(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(false); // Начинаем с false, так как токен еще не выбран
  const [activeTab, setActiveTab] = useState('post');
  const [selectedToken, setSelectedToken] = useState(null);
  const [tokens, setTokens] = useState([]);
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('darkMode');
    return saved ? JSON.parse(saved) : false;
  });

  // Проверка авторизации при загрузке
  useEffect(() => {
    checkAuth();
  }, []);

  // Применение темы
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('darkMode', JSON.stringify(darkMode));
  }, [darkMode]);

  const checkAuth = async () => {
    try {
      const response = await fetch('/api/auth/me', {
        credentials: 'include',
      });
      
      if (response.ok) {
        const data = await parseJsonResponse(response);
        setUser(data.user);
      } else if (response.status === 401) {
        // 401 - не авторизован, это нормально
        setUser(null);
      } else {
        // Другие ошибки
        console.error('Auth check failed:', response.status, response.statusText);
        setUser(null);
      }
    } catch (error) {
      // Сетевые ошибки или ошибки парсинга
      console.error('Auth check error:', error);
      setUser(null);
    } finally {
      setCheckingAuth(false);
    }
  };

  const handleLogin = (userData) => {
    setUser(userData);
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
      setUser(null);
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  // Используем React Query для каналов
  const { data: channelsData = [], isLoading: channelsLoading } = useChannels(selectedToken, { includeAvatars: true });
  
  useEffect(() => {
    setChannels(channelsData);
    setLoading(channelsLoading);
  }, [channelsData, channelsLoading]);

  // Обработка события показа групп каналов из PostForm
  useEffect(() => {
    const handleShowChannelGroups = () => {
      setActiveTab('channels');
    };

    window.addEventListener('showChannelGroups', handleShowChannelGroups);
    return () => {
      window.removeEventListener('showChannelGroups', handleShowChannelGroups);
    };
  }, []);

  const handleBotChange = (tokenId) => {
    setSelectedToken(tokenId);
  };

  const handleChannelAdded = () => {
    // React Query автоматически обновит данные после мутации
  };

  const handleChannelDeleted = () => {
    // React Query автоматически обновит данные после мутации
  };

  const handleTemplateSelect = (text) => {
    // Передаем текст шаблона в форму поста
    const event = new CustomEvent('templateSelected', { detail: { text } });
    window.dispatchEvent(event);
    setActiveTab('post');
  };

  // Загружаем каналы при переключении на вкладку "Каналы", если они еще не загружены
  useEffect(() => {
    if (activeTab === 'channels' && selectedToken && channels.length === 0 && !loading) {
      fetchChannels();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

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

  // Функция для получения заголовков с токеном
  const getHeaders = () => {
    const headers = {};
    if (selectedToken) {
      headers['X-Bot-Token'] = selectedToken;
    }
    return headers;
  };

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <p className="text-gray-600 dark:text-gray-400">Проверка авторизации...</p>
      </div>
    );
  }

  if (!user) {
    return <Login onLogin={handleLogin} darkMode={darkMode} />;
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-950">
      <div className="container mx-auto px-2 sm:px-4 py-4 sm:py-8 max-w-6xl">
        {/* Шапка */}
        <div className="mb-4 sm:mb-8">
          {/* Заголовок и кнопка выхода в одной строке на мобильных */}
          <div className="flex items-center justify-between mb-3 sm:mb-0">
            <h1 className="text-xl sm:text-3xl font-bold text-gray-900 dark:text-white">
              Telegram Broadcast
            </h1>
            <button
              onClick={handleLogout}
              className="px-3 py-1.5 text-xs sm:text-sm bg-gray-600 text-white rounded hover:bg-gray-700 dark:bg-gray-500 dark:hover:bg-gray-600 whitespace-nowrap sm:hidden"
            >
              Выйти
            </button>
          </div>
          
          {/* Информация о пользователе и элементы управления - отдельная строка на мобильных */}
          <div className="flex items-center justify-between gap-2 sm:gap-4">
            <div className="flex items-center gap-2 sm:gap-4 flex-1 min-w-0">
              <ThemeToggle darkMode={darkMode} setDarkMode={setDarkMode} />
              <span className="text-xs sm:text-sm text-gray-600 dark:text-gray-300 truncate">
                {user.name} ({user.username})
              </span>
            </div>
            <button
              onClick={handleLogout}
              className="px-3 py-1.5 text-xs sm:text-sm bg-gray-600 text-white rounded hover:bg-gray-700 dark:bg-gray-500 dark:hover:bg-gray-600 whitespace-nowrap hidden sm:block"
            >
              Выйти
            </button>
          </div>
        </div>

        <BotSelector onBotChange={handleBotChange} onTokensChange={setTokens} />
        <BotStatus token={selectedToken} hasTokens={tokens && tokens.length > 0} />

        {/* Навигация */}
        <div className="mb-4 sm:mb-6 border-b border-gray-200 dark:border-slate-700">
          <nav className="flex space-x-1 overflow-x-auto pb-1 -mb-px scrollbar-hide">
            {tabs.map((tab) => (
              <button
                key={tab.id}
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

        {/* Контент */}
        <div className="space-y-4 sm:space-y-8">
          {activeTab === 'post' && (
            <PostForm channels={channels} token={selectedToken} />
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

          {activeTab === 'scheduled' && (
            <ScheduledPosts token={selectedToken} />
          )}

          {activeTab === 'recurring' && (
            <RecurringPosts token={selectedToken} channels={channels} />
          )}

          {activeTab === 'history' && (
            <PostsHistory 
              token={selectedToken} 
              onCopyPost={(post) => {
                // Переключаемся на вкладку создания поста
                setActiveTab('post');
                // Передаем данные поста в форму (нужно будет добавить пропс в PostForm)
                setTimeout(() => {
                  const event = new CustomEvent('copyPost', { detail: post });
                  window.dispatchEvent(event);
                }, 100);
              }}
            />
          )}

          {activeTab === 'rights' && (
            <ChannelRightsChecker token={selectedToken} />
          )}

          {activeTab === 'users' && (
            <UserManagement currentUser={user} />
          )}
        </div>

        <ToastContainer />

        {/* Футер с копирайтом */}
        <footer className="mt-12 pt-6 border-t border-gray-200 text-center">
          <p className="text-sm text-gray-500">
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

export default App;
