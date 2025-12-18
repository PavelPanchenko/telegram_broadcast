import { useState } from 'react';
import { toast } from '../utils/toast';
import { 
  useRecurringPosts, 
  useCreateRecurringPost, 
  useToggleRecurringPost, 
  useDeleteRecurringPost 
} from '../hooks/useRecurringPosts';

function RecurringPosts({ token, channels }) {
  const [showForm, setShowForm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [postToDelete, setPostToDelete] = useState(null);
  const [formData, setFormData] = useState({
    text: '',
    channelIds: [],
    recurrence: 'daily',
    time: '09:00',
    dayOfWeek: 1,
    parseMode: 'HTML',
    buttons: null
  });

  // React Query хуки
  const { data: posts = [], isLoading: loading } = useRecurringPosts(token);
  const createPost = useCreateRecurringPost();
  const togglePost = useToggleRecurringPost();
  const deletePost = useDeleteRecurringPost();

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.text.trim()) {
      toast.error('Введите текст поста');
      return;
    }

    if (formData.channelIds.length === 0) {
      toast.error('Выберите хотя бы один канал');
      return;
    }

    try {
      await createPost.mutateAsync({ token, data: formData });
      setFormData({
        text: '',
        channelIds: [],
        recurrence: 'daily',
        time: '09:00',
        dayOfWeek: 1,
        parseMode: 'HTML',
        buttons: null
      });
      setShowForm(false);
      toast.success('Автоматический пост создан');
    } catch (error) {
      console.error('Error creating recurring post:', error);
      toast.error(error.message || 'Ошибка при создании автоматического поста');
    }
  };

  const handleToggle = async (id, enabled) => {
    try {
      await togglePost.mutateAsync({ token, postId: id, enabled: !enabled });
      toast.success(enabled ? 'Автоматический пост отключен' : 'Автоматический пост включен');
    } catch (error) {
      console.error('Error toggling recurring post:', error);
      toast.error(error.message || 'Ошибка при обновлении');
    }
  };

  const handleDeleteClick = (id) => {
    setPostToDelete(id);
    setShowDeleteConfirm(true);
  };

  const handleDeleteConfirm = async () => {
    if (!postToDelete) return;

    try {
      await deletePost.mutateAsync({ token, postId: postToDelete });
      toast.success('Автоматический пост удален');
      setShowDeleteConfirm(false);
      setPostToDelete(null);
    } catch (error) {
      console.error('Error deleting recurring post:', error);
      toast.error(error.message || 'Ошибка при удалении');
      setShowDeleteConfirm(false);
      setPostToDelete(null);
    }
  };

  const handleChannelToggle = (channelId) => {
    setFormData(prev => ({
      ...prev,
      channelIds: prev.channelIds.includes(channelId)
        ? prev.channelIds.filter(id => id !== channelId)
        : [...prev.channelIds, channelId]
    }));
  };

  const daysOfWeek = [
    { value: 0, label: 'Воскресенье' },
    { value: 1, label: 'Понедельник' },
    { value: 2, label: 'Вторник' },
    { value: 3, label: 'Среда' },
    { value: 4, label: 'Четверг' },
    { value: 5, label: 'Пятница' },
    { value: 6, label: 'Суббота' },
  ];

  const formatNextDate = (dateString) => {
    return new Date(dateString).toLocaleString('ru-RU');
  };

  if (loading) {
    return (
      <div className="bg-white dark:bg-slate-800/90 dark:border dark:border-slate-700/50 rounded-lg shadow dark:shadow-xl p-6">
        <p className="text-gray-500 dark:text-gray-400">Загрузка...</p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-800/90 dark:border dark:border-slate-700/50 rounded-lg shadow dark:shadow-xl p-3 sm:p-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0 mb-3 sm:mb-4">
        <h2 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white">
          Автоматические посты ({posts.length})
        </h2>
        <button
          type="button"
          onClick={() => setShowForm(!showForm)}
          className="px-2 sm:px-3 py-1 text-xs sm:text-sm bg-blue-600 dark:bg-blue-500 text-white rounded hover:bg-blue-700 dark:hover:bg-blue-600 whitespace-nowrap w-full sm:w-auto"
        >
          {showForm ? 'Отмена' : '+ Создать автоматический пост'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="mb-4 sm:mb-6 p-3 sm:p-4 bg-gray-50 dark:bg-slate-800/60 rounded-lg border dark:border-slate-700 space-y-3 sm:space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Текст поста
            </label>
            <textarea
              value={formData.text}
              onChange={(e) => setFormData({ ...formData, text: e.target.value })}
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-md bg-white dark:bg-slate-800/50 text-gray-900 dark:text-slate-100"
              required
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Тип расписания
              </label>
              <select
                value={formData.recurrence}
                onChange={(e) => setFormData({ ...formData, recurrence: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-md bg-white dark:bg-slate-800/50 text-gray-900 dark:text-slate-100"
              >
                <option value="daily">Ежедневно</option>
                <option value="weekly">Еженедельно</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Время отправки
              </label>
              <input
                type="time"
                value={formData.time}
                onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-md bg-white dark:bg-slate-800/50 text-gray-900 dark:text-slate-100"
                required
              />
            </div>

            {formData.recurrence === 'weekly' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  День недели
                </label>
                <select
                  value={formData.dayOfWeek}
                  onChange={(e) => setFormData({ ...formData, dayOfWeek: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-md bg-white dark:bg-slate-800/50 text-gray-900 dark:text-slate-100"
                >
                  {daysOfWeek.map(day => (
                    <option key={day.value} value={day.value}>{day.label}</option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Форматирование
              </label>
              <select
                value={formData.parseMode}
                onChange={(e) => setFormData({ ...formData, parseMode: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-md bg-white dark:bg-slate-800/50 text-gray-900 dark:text-slate-100"
              >
                <option value="">Без форматирования</option>
                <option value="HTML">HTML</option>
                <option value="MarkdownV2">MarkdownV2</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Выберите каналы ({formData.channelIds.length} выбрано)
            </label>
            <div className="max-h-48 overflow-y-auto border border-gray-200 dark:border-slate-700 rounded-md p-3 bg-white dark:bg-slate-800/60">
              {channels.length === 0 ? (
                <p className="text-gray-500 dark:text-gray-400 text-sm text-center">Нет доступных каналов</p>
              ) : (
                channels.map((channel) => (
                  <label
                    key={channel.id}
                    className="flex items-center space-x-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-700/80 p-2 rounded"
                  >
                    <input
                      type="checkbox"
                      checked={formData.channelIds.includes(channel.id)}
                      onChange={() => handleChannelToggle(channel.id)}
                      className="rounded border-gray-300 dark:border-slate-600 text-blue-600 dark:text-blue-400 focus:ring-blue-500 dark:focus:ring-blue-400 flex-shrink-0 bg-white dark:bg-slate-800"
                    />
                    <span className="text-sm text-gray-900 dark:text-white flex-1 truncate">{channel.name}</span>
                  </label>
                ))
              )}
            </div>
          </div>

          <button
            type="submit"
            className="px-4 py-2 bg-blue-600 dark:bg-blue-500 text-white rounded hover:bg-blue-700 dark:hover:bg-blue-600"
          >
            Создать автоматический пост
          </button>
        </form>
      )}

      {posts.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400">Нет автоматических постов</p>
      ) : (
        <div className="space-y-2 sm:space-y-3">
          {posts.map((post) => {
            const groupChannels = channels.filter(c => post.channelIds.includes(c.id));
            return (
              <div
                key={post.id}
                className={`p-2 sm:p-4 border rounded-lg ${
                  post.enabled
                    ? 'border-green-300 dark:border-green-700/50 bg-green-50 dark:bg-green-900/20'
                    : 'border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800/60'
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                      <p className="text-sm sm:text-base font-medium text-gray-900 dark:text-white">
                        {post.recurrence === 'daily' ? '🔄 Ежедневно' : '📅 Еженедельно'}
                      </p>
                      {post.recurrence === 'weekly' && (
                        <span className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
                          {daysOfWeek.find(d => d.value === post.dayOfWeek)?.label}
                        </span>
                      )}
                      <span className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
                        в {post.time}
                      </span>
                      {!post.enabled && (
                        <span className="text-xs px-1.5 sm:px-2 py-0.5 sm:py-1 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded">
                          Отключен
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 sm:mt-1">
                      Следующая отправка: {formatNextDate(post.nextScheduledAt)}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleToggle(post.id, post.enabled)}
                      className={`px-2 sm:px-3 py-1 text-xs sm:text-sm rounded ${
                        post.enabled
                          ? 'bg-yellow-600 dark:bg-yellow-500 text-white hover:bg-yellow-700 dark:hover:bg-yellow-600'
                          : 'bg-green-600 dark:bg-green-500 text-white hover:bg-green-700 dark:hover:bg-green-600'
                      }`}
                    >
                      {post.enabled ? 'Отключить' : 'Включить'}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleDeleteClick(post.id);
                      }}
                      className="px-2 sm:px-3 py-1 text-xs sm:text-sm bg-red-600 dark:bg-red-500 text-white rounded hover:bg-red-700 dark:hover:bg-red-600"
                    >
                      Удалить
                    </button>
                  </div>
                </div>
                <p className="text-xs sm:text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap mb-1 sm:mb-2 line-clamp-2">
                  {post.text.substring(0, 150)}
                  {post.text.length > 150 && '...'}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Каналов: {groupChannels.length} / {post.channelIds.length}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {/* Модальное окно подтверждения удаления */}
      {showDeleteConfirm && postToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 dark:border dark:border-slate-700/50 rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-4 sm:p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Удалить автоматический пост?
              </h3>
              <p className="text-sm text-gray-700 dark:text-gray-300 mb-6">
                Вы уверены, что хотите удалить этот автоматический пост?
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    setPostToDelete(null);
                  }}
                  className="flex-1 px-4 py-2 bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-200 rounded hover:bg-gray-400 dark:hover:bg-gray-500"
                >
                  Отмена
                </button>
                <button
                  type="button"
                  onClick={handleDeleteConfirm}
                  className="flex-1 px-4 py-2 bg-red-600 dark:bg-red-500 text-white rounded hover:bg-red-700 dark:hover:bg-red-600"
                >
                  Удалить
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default RecurringPosts;

