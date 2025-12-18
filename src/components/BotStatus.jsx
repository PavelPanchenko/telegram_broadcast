import { useState, useEffect } from 'react';

function BotStatus({ token, hasTokens = false }) {
  const [status, setStatus] = useState({ initialized: false, loading: true });

  useEffect(() => {
    if (token) {
      checkBotStatus();
    } else {
      setStatus({ initialized: false, loading: false });
    }
  }, [token]);

  const checkBotStatus = async () => {
    if (!token) return;
    
    try {
      const headers = {};
      if (token) {
        headers['X-Bot-Token'] = token;
      }
      
      const response = await fetch('/api/bot-status', { 
        headers,
        credentials: 'include',
      });
      const data = await response.json();
      setStatus({ ...data, loading: false });
    } catch (error) {
      setStatus({ initialized: false, loading: false, error: error.message });
    }
  };

  if (status.loading) {
    return (
      <div className="bg-white dark:bg-slate-800/90 dark:border dark:border-slate-700/50 rounded-lg shadow dark:shadow-xl p-4 mb-6">
        <p className="text-gray-600 dark:text-gray-400">Проверка статуса бота...</p>
      </div>
    );
  }

  // Если токен не выбран
  if (!token) {
    if (!hasTokens) {
      // У пользователя нет токенов
      return (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700/50 rounded-lg shadow p-4 mb-6">
          <p className="font-semibold text-blue-800 dark:text-blue-400">
            Добавьте бота для начала работы
          </p>
          <p className="text-sm text-blue-600 dark:text-blue-400 mt-2">
            Нажмите кнопку "Добавить бота" выше, чтобы добавить своего Telegram бота
          </p>
        </div>
      );
    }
    // У пользователя есть токены, но ни один не выбран
    return null; // Не показываем сообщение, если есть токены
  }

  return (
    <div className={`rounded-lg shadow p-4 mb-6 ${
      status.initialized 
        ? 'bg-green-50 dark:bg-emerald-900/20 border border-green-200 dark:border-emerald-700/50' 
        : 'bg-red-50 dark:bg-rose-900/20 border border-red-200 dark:border-rose-700/50'
    }`}>
      <div className="flex items-center justify-between">
        <div>
          <p className={`font-semibold ${
            status.initialized 
              ? 'text-green-800 dark:text-green-400' 
              : 'text-red-800 dark:text-red-400'
          }`}>
            {status.initialized 
              ? `✓ Бот инициализирован (@${status.username})`
              : '✗ Бот не инициализирован'
            }
          </p>
          {status.error && (
            <p className="text-sm text-red-600 dark:text-red-400 mt-1">{status.error}</p>
          )}
        </div>
        <button
          onClick={checkBotStatus}
          className="px-3 py-1 text-sm bg-white dark:bg-slate-800/50 border border-gray-300 dark:border-slate-700 rounded hover:bg-gray-50 dark:hover:bg-slate-700/80 text-gray-900 dark:text-slate-100"
        >
          Обновить
        </button>
      </div>
      {!status.initialized && token && (
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
          Убедитесь, что вы добавили TELEGRAM_BOT_TOKEN в файл .env
        </p>
      )}
    </div>
  );
}

export default BotStatus;

