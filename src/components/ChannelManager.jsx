import { useState, useRef, useEffect } from 'react';

function ChannelManager({ channels, onChannelAdded, onChannelDeleted, loading, token }) {
  const getHeaders = () => {
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['X-Bot-Token'] = token;
    }
    return headers;
  };
  const [channelId, setChannelId] = useState('');
  const [channelName, setChannelName] = useState('');
  const [tags, setTags] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [importData, setImportData] = useState('');
  const [fetchingName, setFetchingName] = useState(false);

  // Получаем все уникальные теги
  const allTags = [...new Set(channels.flatMap(c => c.tags || []))];

  // Фильтрация каналов
  const getFilteredChannels = () => {
    let filtered = channels;
    
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(c => 
        c.name.toLowerCase().includes(query) || 
        c.id.toLowerCase().includes(query) ||
        (c.tags && c.tags.some(tag => tag.toLowerCase().includes(query)))
      );
    }
    
    if (selectedTag) {
      filtered = filtered.filter(c => c.tags && c.tags.includes(selectedTag));
    }
    
    return filtered;
  };

  const fetchNameTimeoutRef = useRef(null);

  const handleChannelIdChange = (e) => {
    const id = e.target.value;
    setChannelId(id);
    setChannelName(''); // Сбрасываем название при изменении ID
    
    // Очищаем предыдущий таймер
    if (fetchNameTimeoutRef.current) {
      clearTimeout(fetchNameTimeoutRef.current);
    }
    
    // Если ID введен и название пустое, пытаемся получить название из чата с задержкой
    const trimmedId = id.trim();
    if (trimmedId && token) {
      fetchNameTimeoutRef.current = setTimeout(async () => {
        setFetchingName(true);
        try {
          const headers = {};
          if (token) headers['X-Bot-Token'] = token;
          
          const response = await fetch(`/api/channels/get-info/${encodeURIComponent(trimmedId)}`, { headers });
          const data = await response.json();
          
          if (response.ok && data.success) {
            setChannelName(data.name);
          }
        } catch (err) {
          // Игнорируем ошибки при получении названия
          console.log('Could not fetch channel name:', err);
        } finally {
          setFetchingName(false);
        }
      }, 500); // Задержка 500мс после последнего ввода
    }
  };

  // Очистка таймера при размонтировании
  useEffect(() => {
    return () => {
      if (fetchNameTimeoutRef.current) {
        clearTimeout(fetchNameTimeoutRef.current);
      }
    };
  }, []);

  const handleAddChannel = async (e) => {
    e.preventDefault();
    setError('');
    setAdding(true);

    try {
      const channelTags = tags.split(',').map(t => t.trim()).filter(t => t);
      
      const response = await fetch('/api/channels', {
        method: 'POST',
        headers: getHeaders(),
        credentials: 'include',
        body: JSON.stringify({
          channelId: channelId.trim(),
          channelName: channelName.trim() || undefined, // Если пустое, сервер получит из чата
          tags: channelTags,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Ошибка при добавлении канала');
      }

      setChannelId('');
      setChannelName('');
      setTags('');
      onChannelAdded();
    } catch (err) {
      setError(err.message);
    } finally {
      setAdding(false);
    }
  };

  const handleDeleteChannel = async (channelIdToDelete) => {
    if (!confirm('Вы уверены, что хотите удалить этот канал?')) {
      return;
    }

    try {
      const headers = {};
      if (token) headers['X-Bot-Token'] = token;
      
      const response = await fetch(`/api/channels/${channelIdToDelete}`, {
        method: 'DELETE',
        headers,
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Ошибка при удалении канала');
      }

      onChannelDeleted();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleExport = async () => {
    try {
      const headers = {};
      if (token) headers['X-Bot-Token'] = token;
      
      const response = await fetch('/api/channels/export', { 
        headers,
        credentials: 'include',
      });
      const data = await response.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `channels-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      alert('Ошибка при экспорте: ' + err.message);
    }
  };

  const handleImport = async () => {
    try {
      const data = JSON.parse(importData);
      const response = await fetch('/api/channels/import', {
        method: 'POST',
        headers: getHeaders(),
        credentials: 'include',
        body: JSON.stringify({ channels: data }),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Ошибка при импорте');
      }

      alert(`Импортировано каналов: ${result.imported}`);
      if (result.errors && result.errors.length > 0) {
        console.warn('Ошибки при импорте:', result.errors);
      }
      setImportData('');
      setShowImport(false);
      onChannelAdded();
    } catch (err) {
      alert('Ошибка при импорте: ' + err.message);
    }
  };

  const handleFileImport = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setImportData(event.target.result);
      };
      reader.readAsText(file);
    }
  };

  const filteredChannels = getFilteredChannels();

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-gray-900">
          Управление каналами
        </h2>
        <div className="flex gap-2">
          <button
            onClick={handleExport}
            className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700"
          >
            Экспорт
          </button>
          <button
            onClick={() => setShowImport(!showImport)}
            className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Импорт
          </button>
        </div>
      </div>

      {showImport && (
        <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
          <h3 className="text-sm font-medium text-gray-900 mb-2">Импорт каналов</h3>
          <div className="space-y-2">
            <input
              type="file"
              accept=".json"
              onChange={handleFileImport}
              className="text-sm"
            />
            <textarea
              value={importData}
              onChange={(e) => setImportData(e.target.value)}
              placeholder="Или вставьте JSON данные..."
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            />
            <div className="flex gap-2">
              <button
                onClick={handleImport}
                disabled={!importData}
                className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              >
                Импортировать
              </button>
              <button
                onClick={() => {
                  setShowImport(false);
                  setImportData('');
                }}
                className="px-3 py-1 text-sm bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleAddChannel} className="mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              ID канала или username
            </label>
            <div className="relative">
              <input
                type="text"
                value={channelId}
                onChange={handleChannelIdChange}
                placeholder="@channel или -1001234567890"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
              {fetchingName && (
                <div className="absolute right-2 top-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                </div>
              )}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Название канала {fetchingName && <span className="text-xs text-gray-500">(получение...)</span>}
            </label>
            <input
              type="text"
              value={channelName}
              onChange={(e) => setChannelName(e.target.value)}
              placeholder="Автоматически или введите вручную"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Теги (через запятую)
            </label>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="новости, важное"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={adding}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {adding ? 'Добавление...' : 'Добавить канал'}
        </button>
      </form>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-medium text-gray-900">
            Список каналов ({filteredChannels.length} / {channels.length})
          </h3>
        </div>

        {/* Фильтры */}
        <div className="mb-3 space-y-2">
          <input
            type="text"
            placeholder="Поиск каналов..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {allTags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setSelectedTag('')}
                className={`px-2 py-1 text-xs rounded ${
                  selectedTag === '' 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                Все
              </button>
              {allTags.map(tag => (
                <button
                  key={tag}
                  onClick={() => setSelectedTag(tag)}
                  className={`px-2 py-1 text-xs rounded ${
                    selectedTag === tag 
                      ? 'bg-blue-600 text-white' 
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          )}
        </div>

        {!token ? (
          <p className="text-gray-500">Выберите бота для просмотра каналов</p>
        ) : loading && channels.length === 0 ? (
          <p className="text-gray-500">Загрузка...</p>
        ) : filteredChannels.length === 0 ? (
          <p className="text-gray-500">
            {channels.length === 0 ? 'Нет добавленных каналов' : 'Каналы не найдены'}
          </p>
        ) : (
          <div className="space-y-2">
            {filteredChannels.map((channel) => (
              <div
                key={channel.id}
                className="flex items-center justify-between p-3 bg-gray-50 rounded border border-gray-200"
              >
                <div className="flex items-center space-x-3 flex-1">
                  {channel.avatarUrl ? (
                    <img
                      src={channel.avatarUrl}
                      alt={channel.name}
                      className="w-12 h-12 rounded-full object-cover flex-shrink-0"
                      onError={(e) => {
                        e.target.style.display = 'none';
                      }}
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-gray-300 flex items-center justify-center flex-shrink-0">
                      <span className="text-gray-600 text-lg font-semibold">
                        {channel.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">{channel.name}</p>
                    <p className="text-sm text-gray-500 truncate">{channel.id}</p>
                    {channel.tags && channel.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {channel.tags.map(tag => (
                          <span
                            key={tag}
                            className="px-2 py-0.5 text-xs bg-blue-100 text-blue-800 rounded"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => handleDeleteChannel(channel.id)}
                  className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700 ml-2 flex-shrink-0"
                >
                  Удалить
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default ChannelManager;
