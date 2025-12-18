import { useState, useEffect, useMemo } from 'react';
import { toast } from '../utils/toast';
import { usePostsHistory, useDeleteOldPosts } from '../hooks/usePostsHistory';

function PostsHistory({ token, onCopyPost }) {
  const [limit, setLimit] = useState(20);
  const [showClearMenu, setShowClearMenu] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchAuthor, setSearchAuthor] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // React Query хуки
  const { data: history = [], isLoading: loading } = usePostsHistory(token, { limit });
  const deleteOldPosts = useDeleteOldPosts();

  // Фильтрация истории (вычисляется на клиенте)
  const filteredHistory = useMemo(() => {
    let filtered = [...history];

    if (searchQuery.trim()) {
      filtered = filtered.filter(post => 
        post.text.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    if (searchAuthor.trim()) {
      filtered = filtered.filter(post => 
        post.author && (
          post.author.name.toLowerCase().includes(searchAuthor.toLowerCase()) ||
          post.author.username.toLowerCase().includes(searchAuthor.toLowerCase())
        )
      );
    }

    if (dateFrom) {
      const fromDate = new Date(dateFrom).getTime();
      filtered = filtered.filter(post => 
        new Date(post.timestamp).getTime() >= fromDate
      );
    }

    if (dateTo) {
      const toDate = new Date(dateTo).getTime() + 24 * 60 * 60 * 1000;
      filtered = filtered.filter(post => 
        new Date(post.timestamp).getTime() < toDate
      );
    }

    return filtered;
  }, [history, searchQuery, searchAuthor, dateFrom, dateTo]);


  const handleClearClick = (olderThanDays = null) => {
    // Используем 'all' для полного удаления, чтобы отличить от null (не показывать модальное окно)
    setConfirmDelete(olderThanDays === null ? 'all' : olderThanDays);
    setShowClearMenu(false);
  };

  const handleClearConfirm = async () => {
    if (confirmDelete === null || confirmDelete === undefined) return;

    const olderThanDays = confirmDelete === 'all' ? null : confirmDelete;
    setConfirmDelete(null);

    try {
      const data = await deleteOldPosts.mutateAsync({ token, olderThanDays });
      
      toast.success(olderThanDays 
        ? `Удалено записей: ${data.removed}. Осталось: ${data.remaining}`
        : `История полностью очищена. Удалено записей: ${data.removed}`
      );
    } catch (error) {
      console.error('[PostsHistory] Clear history error:', error);
      toast.error('Ошибка: ' + error.message);
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString('ru-RU');
  };

  return (
    <div className="bg-white dark:bg-slate-800/90 dark:border dark:border-slate-700/50 rounded-lg shadow dark:shadow-xl p-3 sm:p-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mb-3 sm:mb-4">
        <h2 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white">
          История отправок
        </h2>
        <div className="flex items-center gap-2">
          <select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          >
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
          
          <div className="relative">
            <button
              onClick={() => setShowClearMenu(!showClearMenu)}
              disabled={deleteOldPosts.isPending || history.length === 0}
              className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {deleteOldPosts.isPending ? 'Очистка...' : 'Очистить'}
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
                disabled={deleteOldPosts.isPending}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
              >
                {deleteOldPosts.isPending ? 'Удаление...' : 'Удалить'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Поиск и фильтры */}
      <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-gray-50 dark:bg-slate-800/60 rounded-lg space-y-2 sm:space-y-3 border dark:border-slate-700/50">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Поиск по тексту
            </label>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Введите текст для поиска..."
              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-md text-sm bg-white dark:bg-slate-800/50 text-gray-900 dark:text-slate-100"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Поиск по автору
            </label>
            <input
              type="text"
              value={searchAuthor}
              onChange={(e) => setSearchAuthor(e.target.value)}
              placeholder="Имя или username автора..."
              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-md text-sm bg-white dark:bg-slate-800/50 text-gray-900 dark:text-slate-100"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                От
              </label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-md text-sm bg-white dark:bg-slate-800/50 text-gray-900 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                До
              </label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-md text-sm bg-white dark:bg-slate-800/50 text-gray-900 dark:text-slate-100"
              />
            </div>
          </div>
        </div>
        {(searchQuery || searchAuthor || dateFrom || dateTo) && (
          <button
            onClick={() => {
              setSearchQuery('');
              setSearchAuthor('');
              setDateFrom('');
              setDateTo('');
            }}
            className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
          >
            Сбросить фильтры
          </button>
        )}
        {filteredHistory.length !== history.length && (
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Найдено: {filteredHistory.length} из {history.length}
          </p>
        )}
      </div>

      {loading ? (
        <p className="text-gray-500 dark:text-gray-400">Загрузка...</p>
      ) : filteredHistory.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400">
          {history.length === 0 ? 'История пуста' : 'Ничего не найдено'}
        </p>
      ) : (
        <div className="space-y-2 sm:space-y-3">
          {filteredHistory.map((post, index) => (
            <div
              key={index}
              className="p-2 sm:p-3 border border-gray-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800/60"
            >
              <div className="flex items-start justify-between mb-1.5 sm:mb-2">
                <div className="flex-1 min-w-0">
                  <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                    {formatDate(post.timestamp)}
                  </p>
                  {post.author && (
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 sm:mt-1">
                      Автор: {post.author.name} (@{post.author.username})
                    </p>
                  )}
                </div>
                <span className="text-xs text-gray-400 dark:text-gray-500 ml-2 flex-shrink-0">
                  {post.channelIds.length} каналов
                </span>
              </div>
              <p className="text-sm sm:text-base text-gray-900 dark:text-white mb-1.5 sm:mb-2 whitespace-pre-wrap">
                {post.text.substring(0, 200)}
                {post.text.length > 200 && '...'}
              </p>
              {post.files && post.files.length > 0 && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1.5 sm:mb-2">
                  Файлов: {post.files.length}
                </p>
              )}
              <div className="text-xs flex gap-3 sm:gap-4">
                <p className="text-green-600 dark:text-green-400">
                  Успешно: {post.results.filter(r => r.success).length}
                </p>
                <p className="text-red-600 dark:text-red-400">
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

