import { useState, useEffect } from 'react';

function PostForm({ channels, token }) {
  const [text, setText] = useState('');
  const [selectedChannels, setSelectedChannels] = useState([]);
  const [files, setFiles] = useState([]);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);
  const [parseMode, setParseMode] = useState('HTML');
  const [showButtons, setShowButtons] = useState(false);
  const [buttons, setButtons] = useState([{ text: '', url: '' }]);
  const [scheduledAt, setScheduledAt] = useState('');
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [searchQuery, setSearchQuery] = useState('');
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);

  // Загрузка шаблонов
  useEffect(() => {
    if (token && showTemplateSelector) {
      fetchTemplates();
    }
  }, [token, showTemplateSelector]);

  const fetchTemplates = async () => {
    if (!token) return;
    
    setLoadingTemplates(true);
    try {
      const headers = {};
      if (token) headers['X-Bot-Token'] = token;
      
      const response = await fetch('/api/templates', { 
        headers,
        credentials: 'include',
      });
      const data = await response.json();
      setTemplates(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error fetching templates:', error);
    } finally {
      setLoadingTemplates(false);
    }
  };

  const handleTemplateSelect = (templateText) => {
    setText(templateText);
    setShowTemplateSelector(false);
  };

  // Загрузка черновика из localStorage
  useEffect(() => {
    const draft = localStorage.getItem('postDraft');
    if (draft) {
      try {
        const parsed = JSON.parse(draft);
        setText(parsed.text || '');
        setSelectedChannels(parsed.selectedChannels || []);
      } catch (e) {
        console.error('Error loading draft:', e);
      }
    }
  }, []);

  // Автосохранение черновика
  useEffect(() => {
    const draft = { text, selectedChannels };
    localStorage.setItem('postDraft', JSON.stringify(draft));
  }, [text, selectedChannels]);

  // Обработчик выбора шаблона
  useEffect(() => {
    const handleTemplateSelect = (event) => {
      setText(event.detail.text);
    };
    window.addEventListener('templateSelected', handleTemplateSelect);
    return () => window.removeEventListener('templateSelected', handleTemplateSelect);
  }, []);

  const handleFileChange = (e) => {
    const newFiles = Array.from(e.target.files);
    const validFiles = newFiles.filter(file => {
      const maxSize = 10 * 1024 * 1024; // 10 МБ
      if (file.size > maxSize) {
        alert(`Файл ${file.name} превышает 10 МБ`);
        return false;
      }
      return true;
    });

    setFiles(prev => [...prev, ...validFiles].slice(0, 10)); // Максимум 10 файлов
  };

  const removeFile = (index) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleChannelToggle = (channelId) => {
    setSelectedChannels((prev) =>
      prev.includes(channelId)
        ? prev.filter((id) => id !== channelId)
        : [...prev, channelId]
    );
  };

  const handleSelectAll = () => {
    const filtered = getFilteredChannels();
    if (selectedChannels.length === filtered.length) {
      setSelectedChannels([]);
    } else {
      setSelectedChannels(filtered.map((c) => c.id));
    }
  };

  const getFilteredChannels = () => {
    if (!searchQuery) return channels;
    const query = searchQuery.toLowerCase();
    return channels.filter(c => 
      c.name.toLowerCase().includes(query) || 
      c.id.toLowerCase().includes(query)
    );
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
    
    if (!text.trim()) {
      alert('Введите текст поста');
      return;
    }

    if (selectedChannels.length === 0) {
      alert('Выберите хотя бы один канал');
      return;
    }

    setSending(true);
    setResult(null);
    setProgress({ current: 0, total: selectedChannels.length });

    try {
      const formData = new FormData();
      formData.append('text', text);
      formData.append('channelIds', JSON.stringify(selectedChannels));
      formData.append('parseMode', parseMode);
      
      if (scheduledAt) {
        formData.append('scheduledAt', scheduledAt);
      }

      // Добавляем файлы
      files.forEach(file => {
        formData.append('files', file);
      });

      // Добавляем кнопки если есть
      const validButtons = buttons.filter(b => b.text && b.url);
      if (validButtons.length > 0) {
        formData.append('buttons', JSON.stringify(validButtons.map(b => [{ text: b.text, url: b.url }])));
      }

      const headers = {};
      if (token) headers['X-Bot-Token'] = token;
      
      const response = await fetch('/api/send-post', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Ошибка при отправке поста');
      }

      setResult(data);
      setText('');
      setFiles([]);
      setSelectedChannels([]);
      setButtons([{ text: '', url: '' }]);
      setScheduledAt('');
      localStorage.removeItem('postDraft');
      
      // Сброс input файла
      const fileInput = document.querySelector('input[type="file"]');
      if (fileInput) fileInput.value = '';
    } catch (error) {
      setResult({ success: false, error: error.message });
    } finally {
      setSending(false);
      setProgress({ current: 0, total: 0 });
    }
  };

  const filteredChannels = getFilteredChannels();

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-semibold text-gray-900 mb-4">
        Создать пост
      </h2>

      <form onSubmit={handleSubmit}>
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-gray-700">
              Текст поста
            </label>
            <button
              type="button"
              onClick={() => setShowTemplateSelector(true)}
              className="px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 flex items-center gap-1"
            >
              <span>📝</span>
              Выбрать шаблон
            </button>
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Введите текст поста или выберите шаблон..."
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
            Файлы (изображения, видео, документы) - до 10 файлов
          </label>
          <input
            type="file"
            accept="image/*,video/*,.pdf,.doc,.docx"
            multiple
            onChange={handleFileChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          
          {files.length > 0 && (
            <div className="mt-3 space-y-2">
              {files.map((file, index) => (
                <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded border">
                  <div className="flex items-center space-x-3">
                    {file.type.startsWith('image/') && (
                      <img
                        src={URL.createObjectURL(file)}
                        alt="Preview"
                        className="w-16 h-16 object-cover rounded"
                      />
                    )}
                    <div>
                      <p className="text-sm font-medium text-gray-900">{file.name}</p>
                      <p className="text-xs text-gray-500">
                        {(file.size / 1024 / 1024).toFixed(2)} МБ
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeFile(index)}
                    className="text-red-600 hover:text-red-700 text-sm"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-gray-700">
              Кнопки под постом (опционально)
            </label>
            <button
              type="button"
              onClick={() => setShowButtons(!showButtons)}
              className="text-sm text-blue-600 hover:text-blue-700"
            >
              {showButtons ? 'Скрыть' : 'Показать'}
            </button>
          </div>
          
          {showButtons && (
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
          )}
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Запланировать отправку (опционально)
          </label>
          <input
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            min={new Date().toISOString().slice(0, 16)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-gray-700">
              Выберите каналы для отправки
            </label>
            {filteredChannels.length > 0 && (
              <button
                type="button"
                onClick={handleSelectAll}
                className="text-sm text-blue-600 hover:text-blue-700"
              >
                {selectedChannels.length === filteredChannels.length ? 'Снять все' : 'Выбрать все'}
              </button>
            )}
          </div>

          {channels.length === 0 ? (
            <p className="text-gray-500 text-sm">
              Сначала добавьте каналы в разделе "Управление каналами"
            </p>
          ) : (
            <>
              <input
                type="text"
                placeholder="Поиск каналов..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full mb-2 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <div className="space-y-2 max-h-48 overflow-y-auto border border-gray-200 rounded-md p-3">
                {filteredChannels.length === 0 ? (
                  <p className="text-gray-500 text-sm text-center">Каналы не найдены</p>
                ) : (
                  filteredChannels.map((channel) => (
                    <label
                      key={channel.id}
                      className="flex items-center space-x-2 cursor-pointer hover:bg-gray-50 p-2 rounded"
                    >
                      <input
                        type="checkbox"
                        checked={selectedChannels.includes(channel.id)}
                        onChange={() => handleChannelToggle(channel.id)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 flex-shrink-0"
                      />
                      {channel.avatarUrl ? (
                        <img
                          src={channel.avatarUrl}
                          alt={channel.name}
                          className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                          onError={(e) => {
                            e.target.style.display = 'none';
                          }}
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center flex-shrink-0">
                          <span className="text-gray-600 text-xs font-semibold">
                            {channel.name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                      )}
                      <span className="text-sm text-gray-900 flex-1 truncate">{channel.name}</span>
                      {channel.tags && channel.tags.length > 0 && (
                        <span className="text-xs text-gray-500 hidden sm:inline">
                          ({channel.tags.join(', ')})
                        </span>
                      )}
                    </label>
                  ))
                )}
              </div>
            </>
          )}
        </div>

        {sending && progress.total > 0 && (
          <div className="mb-4">
            <div className="flex items-center justify-between text-sm text-gray-600 mb-1">
              <span>Отправка...</span>
              <span>{progress.current} / {progress.total}</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all"
                style={{ width: `${(progress.current / progress.total) * 100}%` }}
              />
            </div>
          </div>
        )}

        {result && (
          <div className={`mb-4 p-4 rounded ${
            result.success
              ? 'bg-green-50 border border-green-200'
              : 'bg-red-50 border border-red-200'
          }`}>
            {result.success ? (
              <div>
                <p className="font-semibold text-green-800 mb-2">
                  {result.scheduled ? `Пост запланирован на ${new Date(result.scheduledAt).toLocaleString('ru-RU')}` : 'Пост успешно отправлен!'}
                </p>
                {result.results && (
                  <div className="text-sm text-green-700">
                    <p>Результаты:</p>
                    <ul className="list-disc list-inside mt-1">
                      {result.results.map((r, idx) => (
                        <li key={idx}>
                          {r.success ? '✓' : '✗'} {r.channelId}
                          {r.error && ` - ${r.error}`}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-red-800">{result.error}</p>
            )}
          </div>
        )}

        <button
          type="submit"
          disabled={sending || channels.length === 0}
          className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {sending ? 'Отправка...' : scheduledAt ? 'Запланировать' : 'Отправить пост'}
        </button>
      </form>

      {/* Модальное окно выбора шаблона */}
      {showTemplateSelector && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Выберите шаблон</h3>
              <button
                onClick={() => setShowTemplateSelector(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4">
              {loadingTemplates ? (
                <p className="text-gray-500 text-center py-4">Загрузка шаблонов...</p>
              ) : templates.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-500 mb-2">Нет сохраненных шаблонов</p>
                  <p className="text-sm text-gray-400">
                    Создайте шаблон на вкладке "Шаблоны"
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {templates.map((template) => (
                    <div
                      key={template.id}
                      className="p-4 border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-colors cursor-pointer"
                      onClick={() => handleTemplateSelect(template.text)}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className="font-medium text-gray-900 mb-2">{template.name}</p>
                          <p className="text-sm text-gray-600 whitespace-pre-wrap">
                            {template.text.length > 200 
                              ? template.text.substring(0, 200) + '...' 
                              : template.text}
                          </p>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleTemplateSelect(template.text);
                          }}
                          className="ml-4 px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                        >
                          Использовать
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default PostForm;
