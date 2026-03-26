import { useState, useEffect, useRef } from 'react';
import { toast } from '../utils/toast';
import {
  useTokens,
  useValidateToken,
  useAddToken,
  useDeleteToken,
  useReplaceBotTokenSecret,
  useBotsOnlineStatus,
} from '../hooks/useTokens';

function BotOnlineBadge({ status, loading }) {
  if (loading) {
    return (
      <span className="inline-flex shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-400">
        …
      </span>
    );
  }
  const online = status?.online === true;
  return (
    <span
      className={`inline-flex shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium ${
        online
          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
          : 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300'
      }`}
    >
      {online ? 'В сети' : 'Не в сети'}
    </span>
  );
}

function BotSelector({ onBotChange, userRole }) {
  const [selectedToken, setSelectedToken] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [tokenInput, setTokenInput] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [tokenToDelete, setTokenToDelete] = useState(null);
  const [replaceTarget, setReplaceTarget] = useState(null);
  const [replaceTokenInput, setReplaceTokenInput] = useState('');
  const fetchNameTimeoutRef = useRef(null);
  const tokensInitializedRef = useRef(false);
  const prevSelectedTokenRef = useRef(null);

  // React Query хуки
  const { data: tokens = [], isLoading: loading } = useTokens();
  const { data: botStatuses = {}, isLoading: statusLoading } = useBotsOnlineStatus(
    Array.isArray(tokens) && tokens.length > 0
  );
  const validateToken = useValidateToken();
  const addToken = useAddToken();
  const deleteToken = useDeleteToken();
  const replaceSecret = useReplaceBotTokenSecret();

  // Токены уже доступны через React Query в родительском компоненте

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
    if (selectedToken && selectedToken !== prevSelectedTokenRef.current) {
      localStorage.setItem('selectedBotToken', selectedToken);
      onBotChange?.(selectedToken);
      prevSelectedTokenRef.current = selectedToken;
    }
  }, [selectedToken]); // onBotChange стабилен благодаря useCallback в родителе

  useEffect(() => {
    // Проверяем, что tokens - это массив
    if (!Array.isArray(tokens) || tokens.length === 0) {
      return;
    }
    
    // Инициализируем токен только один раз при первой загрузке
    if (!tokensInitializedRef.current) {
      const saved = localStorage.getItem('selectedBotToken');
      if (saved && tokens.find(t => t.id === saved)) {
        setSelectedToken(saved);
      } else {
        const defaultToken = tokens.find(t => t.isDefault) || tokens[0];
        if (defaultToken) {
          setSelectedToken(defaultToken.id);
        }
      }
      tokensInitializedRef.current = true;
    } else {
      // Если токен был удален, выбираем другой
      if (selectedToken && !tokens.find(t => t.id === selectedToken)) {
        const defaultToken = tokens.find(t => t.isDefault) || tokens[0];
        if (defaultToken) {
          setSelectedToken(defaultToken.id);
        } else {
          setSelectedToken(null);
        }
      }
    }
  }, [tokens, selectedToken]);

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

  const handleReplaceTokenSubmit = async (e) => {
    e.preventDefault();
    if (!replaceTarget || !replaceTokenInput.trim()) return;

    try {
      const data = await replaceSecret.mutateAsync({
        id: replaceTarget.id,
        newToken: replaceTokenInput.trim(),
      });
      if (data.token && selectedToken === replaceTarget.id) {
        setSelectedToken(data.token.id);
        localStorage.setItem('selectedBotToken', data.token.id);
      }
      setReplaceTarget(null);
      setReplaceTokenInput('');
      toast.success('Токен бота обновлён. Каналы и история сохранены.');
    } catch (error) {
      toast.error(error.message || 'Ошибка смены токена');
    }
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
          className="flex items-stretch gap-2 overflow-x-auto overflow-y-visible pb-3 pt-0.5 scrollbar-thin"
          style={{
            WebkitOverflowScrolling: 'touch'
          }}>
          {Array.isArray(tokens) && tokens.map((token) => (
            <div
              key={token.id}
              className={`flex h-full min-h-0 items-start gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg border flex-shrink-0 w-[calc(100vw-3rem)] sm:min-w-[260px] sm:max-w-[340px] overflow-visible transition-colors ${
                selectedToken === token.id
                  ? 'border-slate-400 dark:border-slate-500 bg-slate-50 dark:bg-slate-700/50 shadow-sm ring-1 ring-slate-300/80 dark:ring-slate-600/80'
                  : 'border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/60 hover:bg-gray-100 dark:hover:bg-slate-700/80 hover:border-gray-300 dark:hover:border-slate-600 cursor-pointer'
              }`}
              onClick={() => {
                setSelectedToken(token.id);
              }}
            >
              {/* Аватар бота */}
              <div className="flex-shrink-0 self-start">
                {token.avatarUrl ? (
                  <>
                    <img
                      src={token.avatarUrl}
                      alt={token.name}
                      className="w-10 h-10 sm:w-12 sm:h-12 rounded-full object-cover border-2 border-gray-200 dark:border-slate-600"
                      onError={(e) => {
                        // Если фото не загрузилось, скрываем его и показываем дефолтный аватар
                        e.target.style.display = 'none';
                        const fallback = e.target.nextElementSibling;
                        if (fallback) {
                          fallback.style.display = 'flex';
                        }
                      }}
                    />
                    <div
                      className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-semibold text-sm sm:text-base hidden"
                    >
                      {token.name ? token.name.charAt(0).toUpperCase() : 'B'}
                    </div>
                  </>
                ) : (
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-semibold text-sm sm:text-base">
                    {token.name ? token.name.charAt(0).toUpperCase() : 'B'}
                  </div>
                )}
              </div>
              <div className="flex min-h-0 min-w-0 flex-1 flex-col space-y-1">
                <p className="text-sm font-medium leading-tight text-gray-900 dark:text-white break-words">
                  {token.name}
                </p>
                <p
                  className="truncate text-xs leading-tight text-gray-500 dark:text-gray-400"
                  title={`@${token.username || 'неизвестно'}`}
                >
                  @{token.username || 'неизвестно'}
                </p>
                {token.owner && (
                  <p className="text-xs leading-tight text-gray-400 dark:text-gray-500 break-words">
                    Владелец: {token.owner.name || token.owner.username}
                  </p>
                )}
              </div>
              <div className="flex w-[4.25rem] flex-shrink-0 flex-col items-end gap-1 pl-0.5">
                <span className="flex-shrink-0">
                  <BotOnlineBadge status={botStatuses[token.id]} loading={statusLoading} />
                </span>
                <div className="flex items-center gap-0.5">
                  {userRole !== 'assistant' && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setReplaceTarget({ id: token.id, name: token.name });
                        setReplaceTokenInput('');
                      }}
                      className="flex-shrink-0 rounded px-1.5 py-1 text-base transition-colors text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/30"
                      title="Сменить токен (каналы и история сохраняются)"
                    >
                      🔑
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleDeleteClick(token.id);
                    }}
                    disabled={userRole !== 'admin' && tokens.length === 1}
                    className={`flex-shrink-0 rounded px-1.5 py-1 text-base transition-colors ${
                      (userRole !== 'admin' && tokens.length === 1)
                        ? 'cursor-not-allowed text-gray-400 opacity-50'
                        : 'text-red-600 hover:bg-red-50 active:bg-red-100 dark:text-red-300 dark:hover:bg-white/10 dark:active:bg-white/[0.14]'
                    }`}
                    title={
                      userRole === 'admin' 
                        ? 'Удалить бота' 
                        : tokens.length === 1 
                          ? 'Нельзя удалить последнего бота' 
                          : 'Удалить бота'
                    }
                  >
                    🗑️
                  </button>
                </div>
              </div>
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

      {replaceTarget && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 dark:border dark:border-slate-700/50 rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <form onSubmit={handleReplaceTokenSubmit} className="p-4 sm:p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                Сменить токен бота
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                <strong className="text-gray-900 dark:text-slate-200">{replaceTarget.name}</strong>
                {' — вставьте новый токен из @BotFather. Каналы, история постов, шаблоны и расписание сохраняются. Меняется только секрет для доступа к API.'}
              </p>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Новый токен
              </label>
              <input
                type="password"
                autoComplete="off"
                value={replaceTokenInput}
                onChange={(e) => setReplaceTokenInput(e.target.value)}
                placeholder="123456789:ABC..."
                className="w-full px-2 py-2 text-sm border border-gray-300 dark:border-slate-700 rounded bg-white dark:bg-slate-800/50 text-gray-900 dark:text-slate-100 mb-4 font-mono"
              />
              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={replaceSecret.isPending || !replaceTokenInput.trim()}
                  className="flex-1 px-4 py-2 bg-amber-600 dark:bg-amber-600 text-white rounded hover:bg-amber-700 disabled:opacity-50"
                >
                  {replaceSecret.isPending ? 'Сохранение...' : 'Сохранить'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setReplaceTarget(null);
                    setReplaceTokenInput('');
                  }}
                  className="flex-1 px-4 py-2 bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-200 rounded hover:bg-gray-400 dark:hover:bg-gray-500"
                >
                  Отмена
                </button>
              </div>
            </form>
          </div>
        </div>
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

