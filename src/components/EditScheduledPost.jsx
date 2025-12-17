import { useState, useEffect } from 'react';

function EditScheduledPost({ post, channels, onSave, onCancel, token }) {
  const getHeaders = () => {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['X-Bot-Token'] = token;
    return headers;
  };
  const [text, setText] = useState(post.text || '');
  const [selectedChannels, setSelectedChannels] = useState(post.channelIds || []);
  const [scheduledAt, setScheduledAt] = useState(
    post.scheduledAt ? new Date(post.scheduledAt).toISOString().slice(0, 16) : ''
  );
  const [parseMode, setParseMode] = useState(post.parseMode || 'HTML');
  const [buttons, setButtons] = useState(
    post.buttons ? post.buttons.flat() : [{ text: '', url: '' }]
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    // Выбираем все каналы по умолчанию если они были выбраны
    if (post.channelIds && post.channelIds.length > 0) {
      setSelectedChannels(post.channelIds);
    }
  }, [post]);

  const handleChannelToggle = (channelId) => {
    setSelectedChannels((prev) =>
      prev.includes(channelId)
        ? prev.filter((id) => id !== channelId)
        : [...prev, channelId]
    );
  };

  const handleSelectAll = () => {
    if (selectedChannels.length === channels.length) {
      setSelectedChannels([]);
    } else {
      setSelectedChannels(channels.map((c) => c.id));
    }
  };

  const addButton = () => {
    setButtons(prev => [...prev, { text: '', url: '' }]);
  };

  const removeButton = (index) => {
    setButtons(prev => prev.filter((_, i) => i !== index));
  };

  const updateButton = (index, field, value) => {
    setButtons(prev => prev.map((btn, i) => 
      i === index ? { ...btn, [field]: value } : btn
    ));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!text.trim()) {
      setError('Введите текст поста');
      return;
    }

    if (selectedChannels.length === 0) {
      setError('Выберите хотя бы один канал');
      return;
    }

    if (!scheduledAt) {
      setError('Укажите время отправки');
      return;
    }

    setSaving(true);

    try {
      const validButtons = buttons.filter(b => b.text && b.url);
      const buttonsData = validButtons.length > 0 
        ? validButtons.map(b => [{ text: b.text, url: b.url }])
        : null;

      const response = await fetch(`/api/scheduled-posts/${post.id}`, {
        method: 'PUT',
        headers: getHeaders(),
        credentials: 'include',
        body: JSON.stringify({
          text,
          channelIds: selectedChannels,
          scheduledAt,
          parseMode,
          buttons: buttonsData
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Ошибка при обновлении поста');
      }

      onSave();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            Редактировать запланированный пост
          </h2>

          <form onSubmit={handleSubmit}>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Текст поста
              </label>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={6}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
              <div className="flex items-center justify-between mt-1">
                <p className="text-xs text-gray-500">
                  {text.length} символов
                </p>
                <select
                  value={parseMode}
                  onChange={(e) => setParseMode(e.target.value)}
                  className="text-xs border border-gray-300 rounded px-2 py-1"
                >
                  <option value="">Без форматирования</option>
                  <option value="HTML">HTML</option>
                  <option value="MarkdownV2">MarkdownV2</option>
                </select>
              </div>
              {parseMode === 'MarkdownV2' && (
                <p className="text-xs text-gray-500 mt-1">
                  Синтаксис: *жирный* _курсив_ [ссылка](url)
                </p>
              )}
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Время отправки
              </label>
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                min={new Date().toISOString().slice(0, 16)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700">
                  Каналы для отправки
                </label>
                <button
                  type="button"
                  onClick={handleSelectAll}
                  className="text-sm text-blue-600 hover:text-blue-700"
                >
                  {selectedChannels.length === channels.length ? 'Снять все' : 'Выбрать все'}
                </button>
              </div>
              <div className="space-y-2 max-h-32 overflow-y-auto border border-gray-200 rounded-md p-3">
                {channels.map((channel) => (
                  <label
                    key={channel.id}
                    className="flex items-center space-x-2 cursor-pointer hover:bg-gray-50 p-1 rounded"
                  >
                    <input
                      type="checkbox"
                      checked={selectedChannels.includes(channel.id)}
                      onChange={() => handleChannelToggle(channel.id)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-900">{channel.name}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700">
                  Кнопки под постом (опционально)
                </label>
              </div>
              <div className="space-y-2 p-3 bg-gray-50 rounded border">
                {buttons.map((button, index) => (
                  <div key={index} className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Текст кнопки"
                      value={button.text}
                      onChange={(e) => updateButton(index, 'text', e.target.value)}
                      className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded"
                    />
                    <input
                      type="url"
                      placeholder="URL"
                      value={button.url}
                      onChange={(e) => updateButton(index, 'url', e.target.value)}
                      className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded"
                    />
                    {buttons.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeButton(index)}
                        className="px-2 text-red-600"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addButton}
                  className="text-sm text-blue-600 hover:text-blue-700"
                >
                  + Добавить кнопку
                </button>
              </div>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
                {error}
              </div>
            )}

            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={onCancel}
                className="px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
              >
                Отмена
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? 'Сохранение...' : 'Сохранить'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default EditScheduledPost;

