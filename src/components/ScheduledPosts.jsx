import { useState, useEffect } from 'react';
import EditScheduledPost from './EditScheduledPost';

function ScheduledPosts({ token }) {
  const [scheduled, setScheduled] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingPost, setEditingPost] = useState(null);
  const [channels, setChannels] = useState([]);

  const getHeaders = () => {
    const headers = {};
    if (token) headers['X-Bot-Token'] = token;
    return headers;
  };

  useEffect(() => {
    if (token) {
      fetchScheduled();
      fetchChannels();
      const interval = setInterval(fetchScheduled, 30000);
      return () => clearInterval(interval);
    }
  }, [token]);

  const fetchChannels = async () => {
    if (!token) return;
    
    try {
      const response = await fetch('/api/channels', { 
        headers: getHeaders(),
        credentials: 'include',
      });
      const data = await response.json();
      setChannels(data);
    } catch (error) {
      console.error('Error fetching channels:', error);
    }
  };

  const fetchScheduled = async () => {
    if (!token) return;
    
    try {
      const response = await fetch('/api/scheduled-posts', { 
        headers: getHeaders(),
        credentials: 'include',
      });
      const data = await response.json();
      setScheduled(data);
    } catch (error) {
      console.error('Error fetching scheduled posts:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Удалить запланированный пост?')) return;

    try {
      const response = await fetch(`/api/scheduled-posts/${id}`, {
        method: 'DELETE',
        headers: getHeaders(),
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Ошибка при удалении');
      }

      fetchScheduled();
    } catch (error) {
      alert(error.message);
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
    fetchScheduled();
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-semibold text-gray-900 mb-4">
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
        <p className="text-gray-500">Загрузка...</p>
      ) : scheduled.length === 0 ? (
        <p className="text-gray-500">Нет запланированных постов</p>
      ) : (
        <div className="space-y-3">
          {scheduled.map((post) => (
            <div
              key={post.id}
              className={`p-4 border rounded-lg ${
                post.isOverdue 
                  ? 'border-red-300 bg-red-50' 
                  : 'border-gray-200'
              }`}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-gray-900">
                      {formatDate(post.scheduledAt)}
                    </p>
                    {post.timeUntilSend !== undefined && (
                      <span className={`text-xs px-2 py-1 rounded ${
                        post.isOverdue
                          ? 'bg-red-200 text-red-800'
                          : 'bg-blue-100 text-blue-800'
                      }`}>
                        {formatTimeUntil(post.timeUntilSend)}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Создан: {formatDate(post.createdAt)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setEditingPost(post)}
                    className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                  >
                    Редактировать
                  </button>
                  <button
                    onClick={() => handleDelete(post.id)}
                    className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700"
                  >
                    Удалить
                  </button>
                </div>
              </div>
              <p className="text-gray-700 text-sm whitespace-pre-wrap">
                {post.text.substring(0, 150)}
                {post.text.length > 150 && '...'}
              </p>
              <p className="text-xs text-gray-500 mt-2">
                Каналов: {post.channelIds.length}
                {post.files && post.files.length > 0 && ` • Файлов: ${post.files.length}`}
              </p>
              {post.isOverdue && (
                <p className="text-xs text-red-600 mt-1 font-medium">
                  ⚠ Пост просрочен и должен быть отправлен
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default ScheduledPosts;

