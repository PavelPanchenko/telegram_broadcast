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
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-gray-900">
          Проверка прав бота
        </h2>
        <button
          onClick={handleCheck}
          disabled={checking}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
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
                  ? 'bg-green-50 border-green-200'
                  : 'bg-red-50 border-red-200'
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900">{result.channelName}</p>
                  <p className="text-sm text-gray-500">{result.channelId}</p>
                </div>
                <div className="text-sm">
                  {result.hasRights ? (
                    <span className="text-green-700">✓ Администратор</span>
                  ) : (
                    <span className="text-red-700">✗ Нет прав</span>
                  )}
                </div>
              </div>
              {result.error && (
                <p className="text-xs text-red-600 mt-1">{result.error}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default ChannelRightsChecker;

