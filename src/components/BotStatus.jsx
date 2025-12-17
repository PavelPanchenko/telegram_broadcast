import { useState, useEffect } from 'react';

function BotStatus({ token }) {
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
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <p className="text-gray-600">Проверка статуса бота...</p>
      </div>
    );
  }

  return (
    <div className={`rounded-lg shadow p-4 mb-6 ${
      status.initialized ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
    }`}>
      <div className="flex items-center justify-between">
        <div>
          <p className={`font-semibold ${
            status.initialized ? 'text-green-800' : 'text-red-800'
          }`}>
            {status.initialized 
              ? `✓ Бот инициализирован (@${status.username})`
              : '✗ Бот не инициализирован'
            }
          </p>
          {status.error && (
            <p className="text-sm text-red-600 mt-1">{status.error}</p>
          )}
        </div>
        <button
          onClick={checkBotStatus}
          className="px-3 py-1 text-sm bg-white border border-gray-300 rounded hover:bg-gray-50"
        >
          Обновить
        </button>
      </div>
      {!status.initialized && (
        <p className="text-sm text-gray-600 mt-2">
          Убедитесь, что вы добавили TELEGRAM_BOT_TOKEN в файл .env
        </p>
      )}
    </div>
  );
}

export default BotStatus;

