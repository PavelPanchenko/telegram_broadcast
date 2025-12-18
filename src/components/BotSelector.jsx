import { useState, useEffect, useRef } from 'react';
import { toast } from '../utils/toast';
import { useTokens, useValidateToken, useAddToken, useDeleteToken } from '../hooks/useTokens';

function BotSelector({ onBotChange, onTokensChange }) {
  const [selectedToken, setSelectedToken] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [tokenInput, setTokenInput] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [tokenToDelete, setTokenToDelete] = useState(null);
  const fetchNameTimeoutRef = useRef(null);

  // React Query хуки
  const { data: tokens = [], isLoading: loading } = useTokens();
  const validateToken = useValidateToken();
  const addToken = useAddToken();
  const deleteToken = useDeleteToken();

  // Уведомляем родительский компонент об изменении токенов
  useEffect(() => {
    if (onTokensChange && tokens.length > 0) {
      onTokensChange(tokens);
    }
  }, [tokens, onTokensChange]);

  // Автоматическое получение названия при вводе токена
  useEffect(() => {
    if (fetchNameTimeoutRef.current) {
      clearTimeout(fetchNameTimeoutRef.current);
    }

    const trimmedToken = tokenInput.trim();
    if (trimmedToken && !nameInput && showAddForm) {
      fetchNameTimeoutRef.current = setTimeout(() => {
        handleFetchBotName();
      }, 1000);
    }

    return () => {
      if (fetchNameTimeoutRef.current) {
        clearTimeout(fetchNameTimeoutRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokenInput, showAddForm]);

  useEffect(() => {
    if (selectedToken) {
      localStorage.setItem('selectedBotToken', selectedToken);
      if (onBotChange) {
        onBotChange(selectedToken);
      }
    }
  }, [selectedToken, onBotChange]);

  useEffect(() => {
    // Проверяем, что tokens - это массив
    if (!Array.isArray(tokens)) {
      return;
    }
    
    const saved = localStorage.getItem('selectedBotToken');
    if (saved && tokens.find(t => t.id === saved)) {
      setSelectedToken(saved);
    } else if (tokens.length > 0) {
      const defaultToken = tokens.find(t => t.isDefault) || tokens[0];
      if (defaultToken) {
        setSelectedToken(defaultToken.id);
      }
    }
  }, [tokens]);

  const handleFetchBotName = async () => {
    if (!tokenInput.trim()) {
      alert('Введите токен бота');
      return;
    }

    try {
      const data = await validateToken.mutateAsync(tokenInput.trim());
      if (data.success && data.botInfo) {
        setNameInput(data.botInfo.defaultName);
      }
    } catch (error) {
      alert('Ошибка: ' + error.message);
    }
  };

  const handleAddToken = async (e) => {
    e.preventDefault();
    if (!tokenInput.trim()) {
      alert('Введите токен бота');
      return;
    }

    try {
      const data = await addToken.mutateAsync({
        token: tokenInput.trim(),
        name: nameInput.trim() || undefined,
      });

      setTokenInput('');
      setNameInput('');
      setShowAddForm(false);
      
      if (data.token) {
        setSelectedToken(data.token.id);
      }
    } catch (error) {
      alert('Ошибка: ' + error.message);
    }
  };

  const handleDeleteClick = (id) => {
    if (!Array.isArray(tokens)) {
      return;
    }
    const token = tokens.find(t => t.id === id);
    setTokenToDelete({ id, name: token?.name || 'бота' });
    setShowDeleteConfirm(true);
  };

  const handleDeleteConfirm = async () => {
    if (!tokenToDelete) return;
    
    const id = tokenToDelete.id;

    try {
      await deleteToken.mutateAsync(id);

      if (selectedToken === id) {
        const remaining = tokens.filter(t => t.id !== id);
        if (remaining.length > 0) {
          setSelectedToken(remaining[0].id);
        } else {
          setSelectedToken(null);
        }
      }

      setShowDeleteConfirm(false);
      setTokenToDelete(null);
      toast.success('Бот удален');
    } catch (error) {
      console.error('[BotSelector] Error deleting token:', error);
      toast.error('Ошибка: ' + error.message);
      setShowDeleteConfirm(false);
      setTokenToDelete(null);
    }
  };

  if (loading) {
    return (
      <div className="bg-white dark:bg-slate-800/90 dark:border dark:border-slate-700/50 rounded-lg shadow dark:shadow-xl p-4 mb-6">
        <p className="text-gray-500 dark:text-gray-400">Загрузка ботов...</p>
      </div>
    );
  }

  const currentToken = Array.isArray(tokens) ? tokens.find(t => t.id === selectedToken) : null;

  return (
    <div className="bg-white dark:bg-slate-800/90 dark:border dark:border-slate-700/50 rounded-lg shadow dark:shadow-xl p-3 sm:p-4 mb-4 sm:mb-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0 mb-3">
        <h3 className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300">Активный бот:</h3>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="px-3 py-1 text-xs bg-blue-600 dark:bg-blue-500 text-white rounded hover:bg-blue-700 dark:hover:bg-blue-600 w-full sm:w-auto"
        >
          {showAddForm ? 'Отмена' : '+ Добавить бота'}
        </button>
      </div>

      {showAddForm && (
        <form onSubmit={handleAddToken} className="mb-3 p-3 bg-gray-50 dark:bg-slate-800/60 rounded border dark:border-slate-700">
          <div className="mb-2">
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Токен бота
            </label>
            <input
              type="text"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              placeholder="123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
              className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-slate-700 rounded bg-white dark:bg-slate-800/50 text-gray-900 dark:text-slate-100"
              required
            />
          </div>
          <div className="mb-2">
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                Название бота
              </label>
              <button
                type="button"
                onClick={handleFetchBotName}
                disabled={!tokenInput.trim() || validateToken.isPending}
                className="px-2 py-0.5 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {validateToken.isPending ? 'Получение...' : '📥 Получить название'}
              </button>
            </div>
            <input
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder="Автоматически или введите вручную"
              className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-slate-700 rounded bg-white dark:bg-slate-800/50 text-gray-900 dark:text-slate-100"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Название будет получено автоматически из Telegram, если не указано
            </p>
          </div>
          <button
            type="submit"
            disabled={addToken.isPending || !tokenInput.trim()}
            className="w-full px-3 py-1 text-sm bg-blue-600 dark:bg-blue-500 text-white rounded hover:bg-blue-700 dark:hover:bg-blue-600 disabled:opacity-50"
          >
            {addToken.isPending ? 'Добавление...' : 'Добавить'}
          </button>
        </form>
      )}

      {/* Контейнер с горизонтальным скроллом для большого количества ботов */}
      <div className="relative">
        <div 
          className="flex items-center gap-2 overflow-x-auto overflow-y-hidden pb-2 scrollbar-thin"
          style={{
            WebkitOverflowScrolling: 'touch'
          }}>
          {Array.isArray(tokens) && tokens.map((token) => (
            <div
              key={token.id}
              className={`flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-3 rounded-lg border-2 flex-shrink-0 w-[calc(100vw-3rem)] sm:min-w-[220px] sm:max-w-[280px] transition-all ${
                selectedToken === token.id
                  ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-400 dark:border-blue-500 shadow-md'
                  : 'bg-gray-50 dark:bg-slate-800/60 border-gray-200 dark:border-slate-700 hover:bg-gray-100 dark:hover:bg-slate-700/80 hover:border-gray-300 dark:hover:border-slate-600 cursor-pointer'
              }`}
              onClick={() => {
                setSelectedToken(token.id);
              }}
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{token.name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                  @{token.username || 'неизвестно'}
                  {token.isDefault && ' • По умолчанию'}
                </p>
                {token.owner && (
                  <p className="text-xs text-gray-400 dark:text-gray-500 truncate mt-0.5">
                    Владелец: {token.owner.name || token.owner.username}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
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
        {/* Индикатор количества ботов, если их много */}
        {tokens.length > 3 && (
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-2 text-center">
            Всего ботов: {tokens.length} {tokens.length > 5 && '(прокрутите для просмотра всех)'}
          </div>
        )}
      </div>

      {currentToken && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
          Используется бот: <span className="font-medium">{currentToken.name}</span>
        </p>
      )}

      {/* Модальное окно подтверждения удаления */}
      {showDeleteConfirm && tokenToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 dark:border dark:border-slate-700/50 rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-4 sm:p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Удалить бота?
              </h3>
              <p className="text-sm text-gray-700 dark:text-gray-300 mb-4">
                Вы уверены, что хотите удалить бота <strong>"{tokenToDelete.name}"</strong>?
              </p>
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded p-3 mb-4">
                <p className="text-xs font-medium text-red-800 dark:text-red-400 mb-2">
                  Все данные этого бота будут безвозвратно удалены:
                </p>
                <ul className="text-xs text-red-700 dark:text-red-400 list-disc list-inside space-y-1">
                  <li>Каналы</li>
                  <li>История постов</li>
                  <li>Шаблоны</li>
                  <li>Запланированные посты</li>
                  <li>Логи</li>
                </ul>
                <p className="text-xs text-red-800 dark:text-red-400 mt-2 font-medium">
                  Это действие нельзя отменить!
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleDeleteConfirm}
                  className="flex-1 px-4 py-2 bg-red-600 dark:bg-red-500 text-white rounded hover:bg-red-700 dark:hover:bg-red-600"
                >
                  Удалить
                </button>
                <button
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    setTokenToDelete(null);
                  }}
                  className="flex-1 px-4 py-2 bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-200 rounded hover:bg-gray-400 dark:hover:bg-gray-500"
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

