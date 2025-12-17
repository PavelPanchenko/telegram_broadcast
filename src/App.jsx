import { useState, useEffect } from 'react';
import ChannelManager from './components/ChannelManager';
import PostForm from './components/PostForm';
import BotStatus from './components/BotStatus';
import PostsHistory from './components/PostsHistory';
import Templates from './components/Templates';
import ScheduledPosts from './components/ScheduledPosts';
import ChannelRightsChecker from './components/ChannelRightsChecker';
import BotSelector from './components/BotSelector';
import Login from './components/Login';
import UserManagement from './components/UserManagement';
import { parseJsonResponse } from './utils/api';

function App() {
  const [user, setUser] = useState(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(false); // Начинаем с false, так как токен еще не выбран
  const [activeTab, setActiveTab] = useState('post');
  const [selectedToken, setSelectedToken] = useState(null);

  // Проверка авторизации при загрузке
  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const response = await fetch('/api/auth/me', {
        credentials: 'include',
      });
      
      if (response.ok) {
        const data = await parseJsonResponse(response);
        setUser(data.user);
      } else {
        setUser(null);
      }
    } catch (error) {
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

  useEffect(() => {
    if (selectedToken) {
      fetchChannels();
    } else {
      // Если токен не выбран, сбрасываем состояние
      setChannels([]);
      setLoading(false);
    }
  }, [selectedToken]);

  const fetchChannels = async (showLoading = true) => {
    if (!selectedToken) {
      setLoading(false);
      setChannels([]);
      return;
    }
    
    if (showLoading) {
      setLoading(true);
    }
    
    try {
      const response = await fetch('/api/channels?includeAvatars=true', {
        headers: {
          'X-Bot-Token': selectedToken,
        },
        credentials: 'include',
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      const channelsArray = Array.isArray(data) ? data : [];
      setChannels(channelsArray);
    } catch (error) {
      console.error('[App] Error fetching channels:', error);
      setChannels([]);
    } finally {
      setLoading(false);
    }
  };

  const handleBotChange = (tokenId) => {
    setSelectedToken(tokenId);
    setLoading(true);
  };

  const handleChannelAdded = () => {
    fetchChannels(false); // Не показываем loading при обновлении после добавления
  };

  const handleChannelDeleted = () => {
    fetchChannels(false); // Не показываем loading при обновлении после удаления
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
    { id: 'history', label: 'История' },
    { id: 'rights', label: 'Проверка прав' },
    ...(user?.role === 'admin' ? [{ id: 'users', label: 'Пользователи' }] : []),
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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-600">Проверка авторизации...</p>
      </div>
    );
  }

  if (!user) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold text-gray-900">
            Telegram Broadcast
          </h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">
              {user.name} ({user.username})
            </span>
            <button
              onClick={handleLogout}
              className="px-3 py-1 text-sm bg-gray-600 text-white rounded hover:bg-gray-700"
            >
              Выйти
            </button>
          </div>
        </div>

        <BotSelector onBotChange={handleBotChange} />
        <BotStatus token={selectedToken} />

        {/* Навигация */}
        <div className="mb-6 border-b border-gray-200">
          <nav className="flex space-x-1 overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Контент */}
        <div className="space-y-8">
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

          {activeTab === 'history' && (
            <PostsHistory token={selectedToken} />
          )}

          {activeTab === 'rights' && (
            <ChannelRightsChecker token={selectedToken} />
          )}

          {activeTab === 'users' && (
            <UserManagement currentUser={user} />
          )}
        </div>

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
