import { useState, useEffect, useMemo } from 'react';
import { toast } from '../utils/toast';
import { usePostsHistory, useDeleteOldPosts } from '../hooks/usePostsHistory';
import { useChannels } from '../hooks/useChannels';

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
  const { data: channels = [], isLoading: channelsLoading } = useChannels(token);
  const [expandedPosts, setExpandedPosts] = useState(new Set());
  const [showErrorDetails, setShowErrorDetails] = useState(new Set());

  // Фильтрация истории (вычисляется на клиенте)
  const filteredHistory = useMemo(() => {
    if (!Array.isArray(history)) return [];
    let filtered = [...history];

    if (searchQuery.trim()) {
      filtered = filtered.filter(post => 
        post.text && post.text.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    if (searchAuthor.trim()) {
      filtered = filtered.filter(post => 
        post.author && (
          (post.author.name && post.author.name.toLowerCase().includes(searchAuthor.toLowerCase())) ||
          (post.author.username && post.author.username.toLowerCase().includes(searchAuthor.toLowerCase()))
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

  const toggleExpand = (postId) => {
    setExpandedPosts(prev => {
      const newSet = new Set(prev);
      if (newSet.has(postId)) {
        newSet.delete(postId);
      } else {
        newSet.add(postId);
      }
      return newSet;
    });
  };

  const toggleErrorDetails = (postId) => {
    setShowErrorDetails(prev => {
      const newSet = new Set(prev);
      if (newSet.has(postId)) {
        newSet.delete(postId);
      } else {
        newSet.add(postId);
      }
      return newSet;
    });
  };

  const getChannelName = (channelId) => {
    const channel = channels.find(c => c.id === channelId);
    return channel ? (channel.name || channel.username || channelId) : channelId;
  };

  const handleResend = (post) => {
    console.log('[PostsHistory] handleResend called with post:', post);
    console.log('[PostsHistory] Available channels:', channels);
    console.log('[PostsHistory] Channels loading:', channelsLoading);
    
    // Если каналы еще загружаются, ждем
    if (channelsLoading) {
      toast.info('Загрузка каналов...');
      // Ждем загрузки каналов
      const checkChannels = setInterval(() => {
        if (!channelsLoading) {
          clearInterval(checkChannels);
          handleResend(post); // Повторяем попытку
        }
      }, 100);
      setTimeout(() => clearInterval(checkChannels), 5000); // Таймаут 5 секунд
      return;
    }
    
    const channelIds = Array.isArray(post.channels) ? post.channels : (post.channelIds || []);
    console.log('[PostsHistory] Channel IDs from post:', channelIds);
    
    // Проверяем, что каналы все еще существуют
    const existingChannels = channelIds.filter(id => channels.some(c => c.id === id));
    console.log('[PostsHistory] Existing channels after filter:', existingChannels);
    
    if (existingChannels.length === 0) {
      toast.error('Каналы из этого поста больше не доступны');
      return;
    }

    // Обрабатываем кнопки: если это массив массивов, преобразуем в плоский массив
    let processedButtons = [];
    if (post.buttons && Array.isArray(post.buttons)) {
      if (post.buttons.length > 0 && Array.isArray(post.buttons[0])) {
        // Формат [[{text, url}]] - преобразуем в [{text, url}]
        processedButtons = post.buttons.flat();
      } else {
        // Формат [{text, url}]
        processedButtons = post.buttons;
      }
    }

    const postData = {
      text: post.text || '',
      channelIds: existingChannels,
      parseMode: post.parseMode || 'HTML',
      buttons: processedButtons
    };

    console.log('[PostsHistory] Sending copyPost event with data:', postData);

    // Отправляем событие для копирования поста
    // Используем задержку, чтобы убедиться, что обработчик зарегистрирован
    // Также отправляем событие несколько раз с небольшой задержкой для надежности
    const sendEvent = () => {
      const event = new CustomEvent('copyPost', {
        detail: postData,
        bubbles: true,
        cancelable: true
      });
      const dispatched = window.dispatchEvent(event);
      console.log('[PostsHistory] Event dispatched:', dispatched);
    };
    
    // Отправляем сразу и с задержкой для надежности
    sendEvent();
    setTimeout(sendEvent, 200);
    setTimeout(sendEvent, 500);
    
    toast.success('Пост скопирован в форму отправки. Файлы нужно добавить заново.');
    
    // Переключаемся на вкладку отправки поста
    setTimeout(() => {
      const tabEvent = new CustomEvent('switchTab', { detail: 'post' });
      window.dispatchEvent(tabEvent);
    }, 200);
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
              disabled={deleteOldPosts.isPending || !Array.isArray(history) || history.length === 0}
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
        {Array.isArray(history) && filteredHistory.length !== history.length && (
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Найдено: {filteredHistory.length} из {history.length}
          </p>
        )}
      </div>

      {loading ? (
        <p className="text-gray-500 dark:text-gray-400">Загрузка...</p>
      ) : filteredHistory.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400">
          {!Array.isArray(history) || history.length === 0 ? 'История пуста' : 'Ничего не найдено'}
        </p>
      ) : (
        <div className="space-y-2 sm:space-y-3">
          {filteredHistory.map((post, index) => {
            const postId = post.id || `post-${index}`;
            const isExpanded = expandedPosts.has(postId);
            const showErrors = showErrorDetails.has(postId);
            const channelIds = Array.isArray(post.channels) ? post.channels : (post.channelIds || []);
            const successCount = post.results && Array.isArray(post.results) 
              ? post.results.filter(r => r && r.success).length 
              : 0;
            const errorCount = post.results && Array.isArray(post.results)
              ? post.results.filter(r => r && !r.success).length
              : 0;
            const hasErrors = errorCount > 0;
            const hasButtons = post.buttons && Array.isArray(post.buttons) && post.buttons.length > 0;
            const hasFiles = post.files && Array.isArray(post.files) && post.files.length > 0;
            const fullText = post.text || '';
            const showFullText = isExpanded || fullText.length <= 200;

            return (
              <div
                key={postId}
                className="p-3 sm:p-4 border border-gray-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800/60 hover:shadow-md transition-shadow"
              >
                {/* Заголовок поста */}
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 font-medium">
                        {formatDate(post.timestamp)}
                      </p>
                      {post.author && (
                        <span className="text-xs text-gray-400 dark:text-gray-500">
                          • {post.author.name || post.author.username}
                        </span>
                      )}
                      {post.parseMode && (
                        <span className="text-xs px-2 py-0.5 bg-gray-200 dark:bg-slate-700 text-gray-600 dark:text-gray-300 rounded">
                          {post.parseMode}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => handleResend(post)}
                      className="px-3 py-1.5 text-xs sm:text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                      title="Повторить отправку"
                    >
                      ↻ Повторить
                    </button>
                    <button
                      onClick={() => toggleExpand(postId)}
                      className="px-2 py-1 text-xs text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                      title={isExpanded ? 'Свернуть' : 'Развернуть'}
                    >
                      {isExpanded ? '▼' : '▶'}
                    </button>
                  </div>
                </div>

                {/* Текст поста */}
                {fullText && (
                  <div className="mb-3">
                    <p className="text-sm sm:text-base text-gray-900 dark:text-white whitespace-pre-wrap break-words">
                      {showFullText ? fullText : `${fullText.substring(0, 200)}...`}
                    </p>
                    {!showFullText && (
                      <button
                        onClick={() => toggleExpand(postId)}
                        className="text-xs text-blue-600 dark:text-blue-400 hover:underline mt-1"
                      >
                        Показать полностью
                      </button>
                    )}
                  </div>
                )}

                {/* Информация о каналах */}
                {channelIds.length > 0 && (
                  <div className="mb-2">
                    <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                      Каналы ({channelIds.length}):
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {channelIds.slice(0, isExpanded ? channelIds.length : 5).map((channelId) => (
                        <span
                          key={channelId}
                          className="text-xs px-2 py-1 bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300 rounded"
                        >
                          {getChannelName(channelId)}
                        </span>
                      ))}
                      {!isExpanded && channelIds.length > 5 && (
                        <span className="text-xs px-2 py-1 text-gray-500 dark:text-gray-400">
                          +{channelIds.length - 5} ещё
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Кнопки */}
                {hasButtons && (() => {
                  // Обрабатываем кнопки: могут быть в формате [[{text, url}]] или [{text, url}]
                  const buttonsList = Array.isArray(post.buttons[0]) 
                    ? post.buttons.flat() 
                    : post.buttons;
                  const buttonsCount = buttonsList.length;
                  
                  return (
                    <div className="mb-2">
                      <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                        Кнопки ({buttonsCount}):
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {buttonsList.map((button, btnIndex) => (
                          button && button.url && (
                            <a
                              key={btnIndex}
                              href={button.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded hover:bg-blue-200 dark:hover:bg-blue-900/50"
                            >
                              {button.text || 'Кнопка'} →
                            </a>
                          )
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {/* Файлы */}
                {hasFiles && (
                  <div className="mb-2">
                    <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                      Файлы ({post.files.length}):
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {post.files.map((file, fileIndex) => (
                        <span
                          key={fileIndex}
                          className="text-xs px-2 py-1 bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300 rounded"
                        >
                          {typeof file === 'string' ? file : (file.originalname || file.name || 'Файл')}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Результаты отправки */}
                {post.results && Array.isArray(post.results) && post.results.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-gray-200 dark:border-slate-700">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3 text-xs">
                        <span className="text-green-600 dark:text-green-400 font-medium">
                          ✓ Успешно: {successCount}
                        </span>
                        {hasErrors && (
                          <span className="text-red-600 dark:text-red-400 font-medium">
                            ✗ Ошибок: {errorCount}
                          </span>
                        )}
                      </div>
                      {hasErrors && (
                        <button
                          onClick={() => toggleErrorDetails(postId)}
                          className="text-xs text-red-600 dark:text-red-400 hover:underline"
                        >
                          {showErrors ? 'Скрыть детали' : 'Показать детали ошибок'}
                        </button>
                      )}
                    </div>

                    {/* Детали ошибок */}
                    {showErrors && hasErrors && (
                      <div className="mt-2 space-y-1">
                        {post.results
                          .filter(r => r && !r.success)
                          .map((result, resultIndex) => (
                            <div
                              key={resultIndex}
                              className="text-xs p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded"
                            >
                              <p className="font-medium text-red-800 dark:text-red-300">
                                {getChannelName(result.channelId || result.channel || 'Неизвестный канал')}:
                              </p>
                              <p className="text-red-600 dark:text-red-400 mt-0.5">
                                {result.error || result.message || 'Неизвестная ошибка'}
                              </p>
                            </div>
                          ))}
                      </div>
                    )}

                    {/* Детали успешных отправок (только в развернутом виде) */}
                    {isExpanded && successCount > 0 && (
                      <div className="mt-2 space-y-1">
                        {post.results
                          .filter(r => r && r.success)
                          .slice(0, 10)
                          .map((result, resultIndex) => (
                            <div
                              key={resultIndex}
                              className="text-xs p-1.5 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded"
                            >
                              <span className="text-green-700 dark:text-green-300">
                                ✓ {getChannelName(result.channelId || result.channel || 'Неизвестный канал')}
                                {result.messageId && ` (ID: ${result.messageId})`}
                              </span>
                            </div>
                          ))}
                        {successCount > 10 && (
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            ... и ещё {successCount - 10} успешных отправок
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default PostsHistory;

