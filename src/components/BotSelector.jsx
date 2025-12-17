import { useState, useEffect, useRef } from 'react';

function BotSelector({ onBotChange }) {
  const [tokens, setTokens] = useState([]);
  const [selectedToken, setSelectedToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [tokenInput, setTokenInput] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [adding, setAdding] = useState(false);
  const [fetchingName, setFetchingName] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [tokenToDelete, setTokenToDelete] = useState(null);
  const fetchNameTimeoutRef = useRef(null);

  useEffect(() => {
    fetchTokens();
  }, []);

  // Автоматическое получение названия при вводе токена
  useEffect(() => {
    // Очищаем предыдущий таймер
    if (fetchNameTimeoutRef.current) {
      clearTimeout(fetchNameTimeoutRef.current);
    }

    // Если токен введен и название пустое, получаем его автоматически
    const trimmedToken = tokenInput.trim();
    if (trimmedToken && !nameInput && showAddForm) {
      fetchNameTimeoutRef.current = setTimeout(() => {
        handleFetchBotName();
      }, 1000); // Задержка 1 секунда после последнего ввода
    }

    // Очистка при размонтировании
    return () => {
      if (fetchNameTimeoutRef.current) {
        clearTimeout(fetchNameTimeoutRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokenInput, showAddForm]);

  useEffect(() => {
    // Сохраняем выбранный токен в localStorage
    if (selectedToken) {
      localStorage.setItem('selectedBotToken', selectedToken);
      if (onBotChange) {
        onBotChange(selectedToken);
      }
    }
  }, [selectedToken, onBotChange]);

  useEffect(() => {
    // Загружаем сохраненный токен при загрузке
    const saved = localStorage.getItem('selectedBotToken');
    if (saved && tokens.find(t => t.id === saved)) {
      setSelectedToken(saved);
    } else if (tokens.length > 0) {
      // Выбираем токен по умолчанию
      const defaultToken = tokens.find(t => t.isDefault) || tokens[0];
      if (defaultToken) {
        setSelectedToken(defaultToken.id);
      }
    }
  }, [tokens]);

  const fetchTokens = async () => {
    try {
      const response = await fetch('/api/tokens', {
        credentials: 'include',
      });
      const data = await response.json();
      setTokens(data);
    } catch (error) {
      console.error('Error fetching tokens:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFetchBotName = async () => {
    if (!tokenInput.trim()) {
      alert('Введите токен бота');
      return;
    }

    setFetchingName(true);
    try {
      const response = await fetch('/api/tokens/validate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          token: tokenInput.trim(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Ошибка при проверке токена');
      }

      if (data.success && data.botInfo) {
        setNameInput(data.botInfo.defaultName);
      }
    } catch (error) {
      alert('Ошибка: ' + error.message);
    } finally {
      setFetchingName(false);
    }
  };

  const handleAddToken = async (e) => {
    e.preventDefault();
    if (!tokenInput.trim()) {
      alert('Введите токен бота');
      return;
    }

    setAdding(true);
    try {
      const response = await fetch('/api/tokens', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          token: tokenInput.trim(),
          name: nameInput.trim() || undefined, // Если не указано, сервер получит автоматически
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Ошибка при добавлении токена');
      }

      setTokenInput('');
      setNameInput('');
      setShowAddForm(false);
      fetchTokens();
      
      // Автоматически выбираем новый токен
      if (data.token) {
        setSelectedToken(data.token.id);
      }
    } catch (error) {
      alert('Ошибка: ' + error.message);
    } finally {
      setAdding(false);
    }
  };

  const handleDeleteClick = (id) => {
    const token = tokens.find(t => t.id === id);
    setTokenToDelete({ id, name: token?.name || 'бота' });
    setShowDeleteConfirm(true);
  };

  const handleDeleteConfirm = async () => {
    if (!tokenToDelete) return;
    
    const id = tokenToDelete.id;
    console.log('[BotSelector] User confirmed deletion, proceeding with id:', id);

    try {
      console.log('[BotSelector] Deleting token:', id);
      const response = await fetch(`/api/tokens/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      console.log('[BotSelector] Response status:', response.status);

      const data = await response.json();
      console.log('[BotSelector] Delete response:', data);

      if (!response.ok) {
        throw new Error(data.error || 'Ошибка при удалении бота');
      }

      // Если удалили выбранный токен, выбираем другой
      if (selectedToken === id) {
        const remaining = tokens.filter(t => t.id !== id);
        if (remaining.length > 0) {
          setSelectedToken(remaining[0].id);
        } else {
          setSelectedToken(null);
        }
      }

      // Обновляем список токенов
      await fetchTokens();
      console.log('[BotSelector] Tokens refreshed after delete');
      
      // Принудительно обновляем состояние, если список не обновился
      setTimeout(() => {
        fetchTokens();
      }, 100);
      
      // Закрываем модальное окно
      setShowDeleteConfirm(false);
      setTokenToDelete(null);
    } catch (error) {
      console.error('[BotSelector] Error deleting token:', error);
      alert('Ошибка: ' + error.message);
      setShowDeleteConfirm(false);
      setTokenToDelete(null);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <p className="text-gray-500">Загрузка ботов...</p>
      </div>
    );
  }

  const currentToken = tokens.find(t => t.id === selectedToken);

  return (
    <div className="bg-white rounded-lg shadow p-4 mb-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-gray-700">Активный бот:</h3>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          {showAddForm ? 'Отмена' : '+ Добавить бота'}
        </button>
      </div>

      {showAddForm && (
        <form onSubmit={handleAddToken} className="mb-3 p-3 bg-gray-50 rounded border">
          <div className="mb-2">
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Токен бота
            </label>
            <input
              type="text"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              placeholder="123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
              className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
              required
            />
          </div>
          <div className="mb-2">
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-medium text-gray-700">
                Название бота
              </label>
              <button
                type="button"
                onClick={handleFetchBotName}
                disabled={!tokenInput.trim() || fetchingName}
                className="px-2 py-0.5 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {fetchingName ? 'Получение...' : '📥 Получить название'}
              </button>
            </div>
            <input
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder="Автоматически или введите вручную"
              className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
            />
            <p className="text-xs text-gray-500 mt-1">
              Название будет получено автоматически из Telegram, если не указано
            </p>
          </div>
          <button
            type="submit"
            disabled={adding || !tokenInput.trim()}
            className="w-full px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {adding ? 'Добавление...' : 'Добавить'}
          </button>
        </form>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        {tokens.map((token) => (
          <div
            key={token.id}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg border-2 min-w-[220px] transition-all ${
              selectedToken === token.id
                ? 'bg-blue-50 border-blue-400 shadow-md'
                : 'bg-gray-50 border-gray-200 hover:bg-gray-100 hover:border-gray-300 cursor-pointer'
            }`}
            onClick={() => {
              console.log('[BotSelector] Bot card clicked:', token.id);
              setSelectedToken(token.id);
            }}
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{token.name}</p>
              <p className="text-xs text-gray-500 truncate">
                @{token.username || 'неизвестно'}
                {token.isDefault && ' • По умолчанию'}
              </p>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('[BotSelector] Delete button clicked for token:', token.id);
                handleDeleteClick(token.id);
              }}
              disabled={tokens.length === 1}
              className={`flex-shrink-0 text-base px-2 py-1.5 rounded transition-colors ${
                tokens.length === 1
                  ? 'text-gray-400 cursor-not-allowed opacity-50'
                  : 'text-red-600 hover:text-red-700 hover:bg-red-50 active:bg-red-100'
              }`}
              title={tokens.length === 1 ? 'Нельзя удалить последнего бота' : 'Удалить бота'}
            >
              🗑️
            </button>
          </div>
        ))}
      </div>

      {currentToken && (
        <p className="text-xs text-gray-500 mt-2">
          Используется бот: <span className="font-medium">{currentToken.name}</span>
        </p>
      )}

      {/* Модальное окно подтверждения удаления */}
      {showDeleteConfirm && tokenToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Удалить бота?
              </h3>
              <p className="text-sm text-gray-700 mb-4">
                Вы уверены, что хотите удалить бота <strong>"{tokenToDelete.name}"</strong>?
              </p>
              <div className="bg-red-50 border border-red-200 rounded p-3 mb-4">
                <p className="text-xs font-medium text-red-800 mb-2">
                  Все данные этого бота будут безвозвратно удалены:
                </p>
                <ul className="text-xs text-red-700 list-disc list-inside space-y-1">
                  <li>Каналы</li>
                  <li>История постов</li>
                  <li>Шаблоны</li>
                  <li>Запланированные посты</li>
                  <li>Логи</li>
                </ul>
                <p className="text-xs text-red-800 mt-2 font-medium">
                  Это действие нельзя отменить!
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleDeleteConfirm}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                >
                  Удалить
                </button>
                <button
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    setTokenToDelete(null);
                  }}
                  className="flex-1 px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
                >
                  Отмена
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default BotSelector;

