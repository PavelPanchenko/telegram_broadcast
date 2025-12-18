import { useState } from 'react';

function ChannelRightsChecker({ token }) {
  const [checking, setChecking] = useState(false);
  const [results, setResults] = useState(null);

  const handleCheck = async () => {
    if (!token) {
      alert('Выберите бота');
      return;
    }
    
    setChecking(true);
    setResults(null);

    try {
      const headers = {};
      if (token) headers['X-Bot-Token'] = token;
      
      const response = await fetch('/api/channels/check-rights', {
        method: 'POST',
        headers,
        credentials: 'include',
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Ошибка при проверке');
      }

      setResults(data.results);
    } catch (error) {
      alert('Ошибка: ' + error.message);
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-800/90 dark:border dark:border-slate-700/50 rounded-lg shadow dark:shadow-xl p-3 sm:p-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0 mb-3 sm:mb-4">
        <h2 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white">
          Проверка прав бота
        </h2>
        <button
          type="button"
          onClick={handleCheck}
          disabled={checking}
          className="px-2 sm:px-4 py-1 sm:py-2 text-xs sm:text-sm bg-blue-600 dark:bg-blue-500 text-white rounded hover:bg-blue-700 dark:hover:bg-blue-600 disabled:opacity-50 w-full sm:w-auto"
        >
          {checking ? 'Проверка...' : 'Проверить права'}
        </button>
      </div>

      {results && (
        <div className="space-y-2">
          {results.map((result, index) => (
            <div
              key={index}
              className={`p-3 rounded border ${
                result.hasRights
                  ? 'bg-green-50 dark:bg-emerald-900/20 border-green-200 dark:border-emerald-700/50'
                  : 'bg-red-50 dark:bg-rose-900/20 border-red-200 dark:border-rose-700/50'
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">{result.channelName}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{result.channelId}</p>
                </div>
                <div className="text-sm">
                  {result.hasRights ? (
                    <span className="text-green-700 dark:text-green-400">✓ Администратор</span>
                  ) : (
                    <span className="text-red-700 dark:text-red-400">✗ Нет прав</span>
                  )}
                </div>
              </div>
              {result.error && (
                <p className="text-xs text-red-600 dark:text-red-400 mt-1">{result.error}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default ChannelRightsChecker;

