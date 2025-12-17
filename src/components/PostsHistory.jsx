import { useState, useEffect } from 'react';
import { parseJsonResponse } from '../utils/api';

function PostsHistory({ token }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [limit, setLimit] = useState(20);
  const [showClearMenu, setShowClearMenu] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const getHeaders = () => {
    const headers = {};
    if (token) headers['X-Bot-Token'] = token;
    return headers;
  };

  useEffect(() => {
    if (token) {
      fetchHistory();
    }
  }, [limit, token]);

  const fetchHistory = async () => {
    if (!token) return;
    
    try {
      const response = await fetch(`/api/posts/history?limit=${limit}`, { 
        headers: getHeaders(),
        credentials: 'include',
      });
      const data = await parseJsonResponse(response);
      setHistory(data);
    } catch (error) {
      console.error('Error fetching history:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleClearClick = (olderThanDays = null) => {
    console.log('[PostsHistory] handleClearClick called with:', olderThanDays);
    // Используем 'all' для полного удаления, чтобы отличить от null (не показывать модальное окно)
    setConfirmDelete(olderThanDays === null ? 'all' : olderThanDays);
    setShowClearMenu(false);
  };

  const handleClearConfirm = async () => {
    if (confirmDelete === null || confirmDelete === undefined) return;

    // Если 'all', то olderThanDays = null, иначе используем число
    const olderThanDays = confirmDelete === 'all' ? null : confirmDelete;
    setClearing(true);
    setConfirmDelete(null);

    try {
      const url = olderThanDays 
        ? `/api/posts/history?olderThanDays=${olderThanDays}`
        : '/api/posts/history';
      
      console.log('[PostsHistory] Clearing history, URL:', url);
      
      const response = await fetch(url, {
        method: 'DELETE',
        headers: getHeaders(),
        credentials: 'include',
      });

      console.log('[PostsHistory] Response status:', response.status);
      console.log('[PostsHistory] Response ok:', response.ok);

      const data = await parseJsonResponse(response);
      console.log('[PostsHistory] Response data:', data);
      
      if (!response.ok) {
        throw new Error(data.error || 'Ошибка при очистке истории');
      }

      alert(olderThanDays 
        ? `Удалено записей: ${data.removed}. Осталось: ${data.remaining}`
        : `История полностью очищена. Удалено записей: ${data.removed}`
      );
      
      fetchHistory();
    } catch (error) {
      console.error('[PostsHistory] Clear history error:', error);
      alert('Ошибка: ' + error.message);
    } finally {
      setClearing(false);
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString('ru-RU');
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-gray-900">
          История отправок
        </h2>
        <div className="flex items-center gap-2">
          <select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="px-3 py-1 border border-gray-300 rounded-md text-sm"
          >
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
          
          <div className="relative">
            <button
              onClick={() => setShowClearMenu(!showClearMenu)}
              disabled={clearing || history.length === 0}
              className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {clearing ? 'Очистка...' : 'Очистить'}
            </button>
            
            {showClearMenu && (
              <div className="absolute right-0 mt-1 w-48 bg-white border border-gray-200 rounded-md shadow-lg z-10">
                <button
                  type="button"
                  onClick={() => handleClearClick(7)}
                  className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100"
                >
                  Удалить старше 7 дней
                </button>
                <button
                  type="button"
                  onClick={() => handleClearClick(30)}
                  className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100"
                >
                  Удалить старше 30 дней
                </button>
                <button
                  type="button"
                  onClick={() => handleClearClick(90)}
                  className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100"
                >
                  Удалить старше 90 дней
                </button>
                <hr className="my-1" />
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('[PostsHistory] Delete all button clicked');
                    handleClearClick(null);
                  }}
                  className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                >
                  Удалить всё
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      
      {showClearMenu && (
        <div 
          className="fixed inset-0 z-0" 
          onClick={() => setShowClearMenu(false)}
        />
      )}

      {/* Модальное окно подтверждения удаления */}
      {confirmDelete !== null && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Подтверждение удаления
            </h3>
            <p className="text-gray-700 mb-6">
              {confirmDelete === 'all' || confirmDelete === null
                ? 'Вы уверены, что хотите удалить всю историю?'
                : `Вы уверены, что хотите удалить записи старше ${confirmDelete} дней?`
              }
            </p>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                className="px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={handleClearConfirm}
                disabled={clearing}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
              >
                {clearing ? 'Удаление...' : 'Удалить'}
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-gray-500">Загрузка...</p>
      ) : history.length === 0 ? (
        <p className="text-gray-500">История пуста</p>
      ) : (
        <div className="space-y-4">
          {history.map((post, index) => (
            <div
              key={index}
              className="p-4 border border-gray-200 rounded-lg"
            >
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="text-sm text-gray-500">
                    {formatDate(post.timestamp)}
                  </p>
                  {post.author && (
                    <p className="text-xs text-gray-400 mt-1">
                      Автор: {post.author.name} (@{post.author.username})
                    </p>
                  )}
                </div>
                <span className="text-xs text-gray-400">
                  {post.channelIds.length} каналов
                </span>
              </div>
              <p className="text-gray-900 mb-2 whitespace-pre-wrap">
                {post.text.substring(0, 200)}
                {post.text.length > 200 && '...'}
              </p>
              {post.files && post.files.length > 0 && (
                <p className="text-xs text-gray-500 mb-2">
                  Файлов: {post.files.length}
                </p>
              )}
              <div className="text-xs">
                <p className="text-green-600">
                  Успешно: {post.results.filter(r => r.success).length}
                </p>
                <p className="text-red-600">
                  Ошибок: {post.results.filter(r => !r.success).length}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default PostsHistory;

