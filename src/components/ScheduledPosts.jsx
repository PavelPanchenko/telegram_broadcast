import { useState } from 'react';
import EditScheduledPost from './EditScheduledPost';
import { toast } from '../utils/toast';
import { useScheduledPosts, useDeleteScheduledPost } from '../hooks/useScheduledPosts';
import { useChannels } from '../hooks/useChannels';

function ScheduledPosts({ token }) {
  const [editingPost, setEditingPost] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [postToDelete, setPostToDelete] = useState(null);

  // React Query хуки
  const { data: scheduled = [], isLoading: loading } = useScheduledPosts(token);
  const { data: channels = [] } = useChannels(token);
  const deletePost = useDeleteScheduledPost();

  const handleDeleteClick = (id) => {
    setPostToDelete(id);
    setShowDeleteConfirm(true);
  };

  const handleDeleteConfirm = async () => {
    if (!postToDelete) return;

    try {
      await deletePost.mutateAsync({ token, postId: postToDelete });
      toast.success('Запланированный пост удален');
      setShowDeleteConfirm(false);
      setPostToDelete(null);
    } catch (error) {
      console.error('Error deleting scheduled post:', error);
      toast.error(error.message || 'Ошибка при удалении');
      setShowDeleteConfirm(false);
      setPostToDelete(null);
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString('ru-RU');
  };

  const formatTimeUntil = (minutes) => {
    if (minutes < 0) return 'Просрочен';
    if (minutes < 60) return `через ${minutes} мин`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `через ${hours} ч ${mins} мин`;
  };

  const handleSave = () => {
    setEditingPost(null);
    // React Query автоматически обновит данные после мутации
  };

  return (
    <div className="bg-white dark:bg-slate-800/90 dark:border dark:border-slate-700/50 rounded-lg shadow dark:shadow-xl p-3 sm:p-6">
      <h2 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white mb-3 sm:mb-4">
        Запланированные посты ({scheduled.length})
      </h2>

      {editingPost && (
        <EditScheduledPost
          post={editingPost}
          channels={channels}
          onSave={handleSave}
          onCancel={() => setEditingPost(null)}
          token={token}
        />
      )}

      {loading ? (
        <p className="text-gray-500 dark:text-gray-400">Загрузка...</p>
      ) : scheduled.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400">Нет запланированных постов</p>
      ) : (
        <div className="space-y-1.5 sm:space-y-2">
          {scheduled.map((post) => (
            <div
              key={post.id}
              className={`p-2 sm:p-3 border rounded-lg ${
                post.isOverdue 
                  ? 'border-red-300 dark:border-red-600/50 bg-red-50 dark:bg-red-900/20' 
                  : 'border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800/60'
              }`}
            >
              <div className="flex items-start justify-between mb-1.5 sm:mb-2">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                    <p className="text-xs sm:text-sm font-medium text-gray-900 dark:text-white">
                      {formatDate(post.scheduledAt)}
                    </p>
                    {post.timeUntilSend !== undefined && (
                      <span className={`text-xs px-1.5 sm:px-2 py-0.5 sm:py-1 rounded ${
                        post.isOverdue
                          ? 'bg-red-200 dark:bg-red-800 text-red-800 dark:text-red-300'
                          : 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300'
                      }`}>
                        {formatTimeUntil(post.timeUntilSend)}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 sm:mt-1">
                    Создан: {formatDate(post.createdAt)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setEditingPost(post)}
                    className="px-2 sm:px-3 py-1 text-xs sm:text-sm bg-blue-600 dark:bg-blue-500 text-white rounded hover:bg-blue-700 dark:hover:bg-blue-600"
                  >
                    Редактировать
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleDeleteClick(post.id);
                    }}
                    className="px-2 py-1 text-xs bg-red-600 dark:bg-red-500 text-white rounded hover:bg-red-700 dark:hover:bg-red-600"
                  >
                    Удалить
                  </button>
                </div>
              </div>
              <p className="text-xs sm:text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap line-clamp-2 mt-1 sm:mt-2">
                {post.text.substring(0, 150)}
                {post.text.length > 150 && '...'}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                Каналов: {post.channelIds.length}
                {post.files && post.files.length > 0 && ` • Файлов: ${post.files.length}`}
              </p>
              {post.isOverdue && (
                <p className="text-xs text-red-600 dark:text-red-400 mt-1 font-medium">
                  ⚠ Пост просрочен и должен быть отправлен
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Модальное окно подтверждения удаления */}
      {showDeleteConfirm && postToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 dark:border dark:border-slate-700/50 rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-4 sm:p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Удалить запланированный пост?
              </h3>
              <p className="text-sm text-gray-700 dark:text-gray-300 mb-6">
                Вы уверены, что хотите удалить этот запланированный пост?
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

export default ScheduledPosts;

