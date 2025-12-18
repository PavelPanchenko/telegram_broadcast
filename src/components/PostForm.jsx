import { useState, useEffect } from 'react';
import { toast } from '../utils/toast';
import { parseJsonResponse } from '../utils/api';
import { useTemplates } from '../hooks/useTemplates';

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
  const [isDragging, setIsDragging] = useState(false);
  const [showChannelGroups, setShowChannelGroups] = useState(false);
  const [channelGroups, setChannelGroups] = useState([]);
  const [loadingGroups, setLoadingGroups] = useState(false);

  // React Query для шаблонов
  const { data: templates = [], isLoading: loadingTemplates } = useTemplates(
    showTemplateSelector ? token : null // Загружаем только когда селектор открыт
  );

  // Загрузка групп каналов
  useEffect(() => {
    if (token && showChannelGroups) {
      fetchChannelGroups();
    }
  }, [token, showChannelGroups]);

  // Обработка копирования поста из истории
  useEffect(() => {
    const handleCopyPost = (event) => {
      const post = event.detail;
      setText(post.text || '');
      setParseMode(post.parseMode || 'HTML');
      if (post.channelIds && post.channelIds.length > 0) {
        setSelectedChannels(post.channelIds);
      }
      if (post.buttons && post.buttons.length > 0) {
        setButtons(post.buttons);
        setShowButtons(true);
      }
      // Файлы нельзя скопировать, так как они уже отправлены
      toast.info('Пост скопирован. Файлы нужно добавить заново.');
    };

    const handleSelectGroup = (event) => {
      const channelIds = event.detail;
      if (!channelIds || !Array.isArray(channelIds)) {
        toast.error('Ошибка: неверные данные группы');
        return;
      }
      setSelectedChannels(channelIds);
      toast.success(`Выбрано каналов: ${channelIds.length}`);
    };

    window.addEventListener('copyPost', handleCopyPost);
    window.addEventListener('selectChannelGroup', handleSelectGroup);
    return () => {
      window.removeEventListener('copyPost', handleCopyPost);
      window.removeEventListener('selectChannelGroup', handleSelectGroup);
    };
  }, []);


  const fetchChannelGroups = async () => {
    if (!token) return;
    
    setLoadingGroups(true);
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['X-Bot-Token'] = token;
      
      const response = await fetch('/api/channel-groups', {
        headers,
        credentials: 'include',
      });
      
      const data = await parseJsonResponse(response);
      const groupsArray = Array.isArray(data) ? data : [];
      setChannelGroups(groupsArray);
    } catch (error) {
      console.error('Error fetching channel groups:', error);
      toast.error('Ошибка при загрузке групп каналов');
    } finally {
      setLoadingGroups(false);
    }
  };

  const handleSelectGroup = (group) => {
    if (!group.channelIds || !Array.isArray(group.channelIds) || group.channelIds.length === 0) {
      toast.error('Группа не содержит каналов');
      return;
    }
    setSelectedChannels(group.channelIds);
    setShowChannelGroups(false);
    toast.success(`Выбрано каналов: ${group.channelIds.length}`);
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

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const droppedFiles = Array.from(e.dataTransfer.files);
    const validFiles = droppedFiles.filter(file => {
      const isImage = file.type.startsWith('image/');
      const isVideo = file.type.startsWith('video/');
      const isDocument = ['.pdf', '.doc', '.docx'].some(ext => 
        file.name.toLowerCase().endsWith(ext)
      );
      return isImage || isVideo || isDocument;
    });

    if (validFiles.length === 0) {
      alert('Поддерживаются только изображения, видео и документы (PDF, DOC, DOCX)');
      return;
    }

    const maxSize = 10 * 1024 * 1024; // 10 МБ
    const sizeValidFiles = validFiles.filter(file => {
      if (file.size > maxSize) {
        alert(`Файл ${file.name} превышает 10 МБ`);
        return false;
      }
      return true;
    });

    if (files.length + sizeValidFiles.length > 10) {
      alert(`Можно загрузить максимум 10 файлов. Уже выбрано: ${files.length}`);
      return;
    }

    setFiles(prev => [...prev, ...sizeValidFiles].slice(0, 10));
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
    <div className="bg-white dark:bg-slate-800/90 dark:border dark:border-slate-700/50 rounded-lg shadow dark:shadow-xl p-3 sm:p-6">
      <h2 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white mb-3 sm:mb-4">
        Создать пост
      </h2>

      <form onSubmit={handleSubmit}>
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
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
            className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 dark:focus:ring-offset-2 dark:focus:ring-offset-slate-800 bg-white dark:bg-slate-800/50 text-gray-900 dark:text-slate-100"
            placeholder="Введите текст поста или выберите шаблон..."
            required
          />
          <div className="flex items-center justify-between mt-1">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {text.length} символов
            </p>
            <select
              value={parseMode}
              onChange={(e) => setParseMode(e.target.value)}
              className="text-xs border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              <option value="">Без форматирования</option>
              <option value="HTML">HTML</option>
              <option value="MarkdownV2">MarkdownV2</option>
            </select>
          </div>
          {parseMode === 'MarkdownV2' && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Синтаксис: *жирный* _курсив_ [ссылка](url)
            </p>
          )}
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Файлы (изображения, видео, документы) - до 10 файлов
          </label>
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`relative border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              isDragging
                ? 'border-blue-500 dark:border-blue-400 bg-blue-50 dark:bg-blue-600/10'
                : 'border-gray-300 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/30 hover:border-blue-400 dark:hover:border-blue-500'
            }`}
          >
            <input
              type="file"
              accept="image/*,video/*,.pdf,.doc,.docx"
              multiple
              onChange={handleFileChange}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              id="file-input"
            />
            <div className="pointer-events-none">
              <svg
                className="mx-auto h-12 w-12 text-gray-400 dark:text-slate-500 mb-4"
                stroke="currentColor"
                fill="none"
                viewBox="0 0 48 48"
              >
                <path
                  d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <p className="text-sm text-gray-600 dark:text-slate-400 mb-2">
                {isDragging ? (
                  <span className="text-blue-600 dark:text-blue-400 font-medium">
                    Отпустите файлы здесь
                  </span>
                ) : (
                  <>
                    <span className="font-medium text-blue-600 dark:text-blue-400">
                      Нажмите для выбора
                    </span>
                    {' или перетащите файлы сюда'}
                  </>
                )}
              </p>
              <p className="text-xs text-gray-500 dark:text-slate-500">
                Поддерживаются изображения, видео, PDF, DOC, DOCX
              </p>
              {files.length > 0 && (
                <p className="text-xs text-gray-500 dark:text-slate-400 mt-2">
                  Выбрано файлов: {files.length} / 10
                </p>
              )}
            </div>
          </div>
          
          {files.length > 0 && (
            <div className="mt-3 space-y-2">
              {files.map((file, index) => (
                <div key={index} className="flex items-center justify-between p-2 bg-gray-50 dark:bg-slate-800/60 rounded border dark:border-slate-700">
                  <div className="flex items-center space-x-3">
                    {file.type.startsWith('image/') && (
                      <img
                        src={URL.createObjectURL(file)}
                        alt="Preview"
                        className="w-16 h-16 object-cover rounded"
                      />
                    )}
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">{file.name}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
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
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Кнопки под постом (опционально)
            </label>
            <button
              type="button"
              onClick={() => setShowButtons(!showButtons)}
              className="text-xs sm:text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
            >
              {showButtons ? 'Скрыть' : 'Показать'}
            </button>
          </div>
          
          {showButtons && (
            <div className="space-y-2 p-3 bg-gray-50 dark:bg-slate-800/60 rounded border dark:border-slate-700">
              {buttons.map((button, index) => (
                <div key={index} className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Текст кнопки"
                    value={button.text}
                    onChange={(e) => updateButton(index, 'text', e.target.value)}
                    className="flex-1 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  />
                  <input
                    type="url"
                    placeholder="URL"
                    value={button.url}
                    onChange={(e) => updateButton(index, 'url', e.target.value)}
                    className="flex-1 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  />
                  {buttons.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeButton(index)}
                      className="px-2 text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={addButton}
                className="text-xs sm:text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
              >
                + Добавить кнопку
              </button>
            </div>
          )}
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Запланировать отправку (опционально)
          </label>
          <input
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            min={new Date().toISOString().slice(0, 16)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 dark:focus:ring-offset-2 dark:focus:ring-offset-slate-800 bg-white dark:bg-slate-800/50 text-gray-900 dark:text-slate-100"
          />
        </div>

        <div className="mb-4 sm:mb-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mb-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Выберите каналы для отправки
            </label>
            <div className="flex gap-2 w-full sm:w-auto">
              {filteredChannels.length > 0 && (
                <button
                  type="button"
                  onClick={handleSelectAll}
                  className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
                >
                  {selectedChannels.length === filteredChannels.length ? 'Снять все' : 'Выбрать все'}
                </button>
              )}
              <div className="relative channel-groups-dropdown">
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setShowChannelGroups(!showChannelGroups);
                  }}
                  className="text-sm text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300"
                >
                  📋 Группы каналов
                </button>
                
                {showChannelGroups && (
                  <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg shadow-xl z-50 max-h-96 overflow-y-auto">
                    <div className="p-4">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                          Выберите группу каналов
                        </h3>
                        <button
                          type="button"
                          onClick={() => setShowChannelGroups(false)}
                          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                        >
                          ✕
                        </button>
                      </div>
                      
                      {loadingGroups ? (
                        <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
                          Загрузка...
                        </p>
                      ) : channelGroups.length === 0 ? (
                        <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
                          Нет созданных групп
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {channelGroups.map((group) => {
                            const groupChannels = channels.filter(c => group.channelIds.includes(c.id));
                            return (
                              <button
                                key={group.id}
                                type="button"
                                onClick={() => handleSelectGroup(group)}
                                className="w-full text-left p-3 border border-gray-200 dark:border-slate-700 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors"
                              >
                                <div className="flex items-start justify-between">
                                  <div className="flex-1">
                                    <p className="font-medium text-sm text-gray-900 dark:text-white mb-1">
                                      {group.name}
                                    </p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">
                                      Каналов: {groupChannels.length} / {group.channelIds.length}
                                    </p>
                                    {groupChannels.length > 0 && (
                                      <div className="flex flex-wrap gap-1 mt-2">
                                        {groupChannels.slice(0, 3).map(channel => (
                                          <span
                                            key={channel.id}
                                            className="px-2 py-0.5 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 rounded"
                                          >
                                            {channel.name}
                                          </span>
                                        ))}
                                        {groupChannels.length > 3 && (
                                          <span className="px-2 py-0.5 text-xs text-gray-500 dark:text-gray-400">
                                            +{groupChannels.length - 3}
                                          </span>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {channels.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400 text-sm">
              Сначала добавьте каналы в разделе "Управление каналами"
            </p>
          ) : (
            <>
              <input
                type="text"
                placeholder="Поиск каналов..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full mb-2 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
              <div className="space-y-2 max-h-48 overflow-y-auto border border-gray-200 dark:border-slate-700 rounded-md p-3 bg-white dark:bg-slate-800/60">
                {filteredChannels.length === 0 ? (
                  <p className="text-gray-500 dark:text-gray-400 text-sm text-center">Каналы не найдены</p>
                ) : (
                  filteredChannels.map((channel) => (
                    <label
                      key={channel.id}
                      className="flex items-center space-x-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-600 p-2 rounded"
                    >
                      <input
                        type="checkbox"
                        checked={selectedChannels.includes(channel.id)}
                        onChange={() => handleChannelToggle(channel.id)}
                        className="rounded border-gray-300 dark:border-gray-600 text-blue-600 dark:text-blue-400 focus:ring-blue-500 dark:focus:ring-blue-400 flex-shrink-0 bg-white dark:bg-gray-800"
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
                        <div className="w-8 h-8 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center flex-shrink-0">
                          <span className="text-gray-600 dark:text-gray-300 text-xs font-semibold">
                            {channel.name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                      )}
                      <span className="text-sm text-gray-900 dark:text-white flex-1 truncate">{channel.name}</span>
                      {channel.tags && channel.tags.length > 0 && (
                        <span className="text-xs text-gray-500 dark:text-gray-400 hidden sm:inline">
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
            <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400 mb-1">
              <span>Отправка...</span>
              <span>{progress.current} / {progress.total}</span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <div
                className="bg-blue-600 dark:bg-blue-500 h-2 rounded-full transition-all"
                style={{ width: `${(progress.current / progress.total) * 100}%` }}
              />
            </div>
          </div>
        )}

        {result && (
          <div className={`mb-4 p-4 rounded ${
            result.success
              ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
              : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
          }`}>
            {result.success ? (
              <div>
                <p className="font-semibold text-green-800 dark:text-green-400 mb-2">
                  {result.scheduled ? `Пост запланирован на ${new Date(result.scheduledAt).toLocaleString('ru-RU')}` : 'Пост успешно отправлен!'}
                </p>
                {result.results && (
                  <div className="text-sm text-green-700 dark:text-green-400">
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
              <p className="text-red-800 dark:text-red-400">{result.error}</p>
            )}
          </div>
        )}

        <button
          type="submit"
          disabled={sending || channels.length === 0}
          className="w-full px-4 py-2 bg-blue-600 dark:bg-blue-500 text-white rounded-md hover:bg-blue-700 dark:hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {sending ? 'Отправка...' : scheduledAt ? 'Запланировать' : 'Отправить пост'}
        </button>
      </form>

      {/* Модальное окно выбора шаблона */}
      {showTemplateSelector && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-slate-800 dark:border dark:border-slate-700/50 rounded-lg shadow-xl max-w-2xl w-full mx-2 sm:mx-4 max-h-[80vh] flex flex-col">
            <div className="p-3 sm:p-4 border-b border-gray-200 dark:border-slate-700 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Выберите шаблон</h3>
              <button
                onClick={() => setShowTemplateSelector(false)}
                className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
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
                      className="p-4 border border-gray-200 dark:border-slate-700 rounded-lg hover:border-blue-400 dark:hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-600/10 dark:bg-slate-800/40 transition-all cursor-pointer"
                      onClick={() => handleTemplateSelect(template.text)}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className="font-medium text-gray-900 dark:text-white mb-2">{template.name}</p>
                          <p className="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap">
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
                          className="ml-4 px-3 py-1 text-sm bg-blue-600 dark:bg-blue-500 text-white rounded hover:bg-blue-700 dark:hover:bg-blue-600"
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
