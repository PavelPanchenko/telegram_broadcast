import { useState, useRef, useEffect } from 'react';
import ChannelGroups from './ChannelGroups';
import { toast } from '../utils/toast';
import { parseJsonResponse } from '../utils/api';
import { useAddChannel, useDeleteChannel, useChannelInfo } from '../hooks/useChannels';

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
  const [activeSection, setActiveSection] = useState('channels'); // 'channels' или 'groups'
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [channelToDelete, setChannelToDelete] = useState(null);

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

  // Обработка события показа групп каналов из PostForm
  useEffect(() => {
    const handleShowChannelGroups = () => {
      setActiveSection('groups');
    };

    window.addEventListener('showChannelGroups', handleShowChannelGroups);
    return () => {
      window.removeEventListener('showChannelGroups', handleShowChannelGroups);
    };
  }, []);

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

  // React Query хуки
  const addChannel = useAddChannel();
  const deleteChannel = useDeleteChannel();

  const handleAddChannel = async (e) => {
    e.preventDefault();
    setError('');

    try {
      const channelTags = tags.split(',').map(t => t.trim()).filter(t => t);
      
      await addChannel.mutateAsync({
        token,
        channelId: channelId.trim(),
        channelName: channelName.trim() || undefined,
        tags: channelTags,
      });

      setChannelId('');
      setChannelName('');
      setTags('');
      onChannelAdded();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDeleteChannelClick = (channelIdToDelete) => {
    const channel = channels.find(c => c.id === channelIdToDelete);
    setChannelToDelete({ id: channelIdToDelete, name: channel?.name || channelIdToDelete });
    setShowDeleteConfirm(true);
  };

  const handleDeleteChannelConfirm = async () => {
    if (!channelToDelete) return;

    try {
      await deleteChannel.mutateAsync({
        token,
        channelId: channelToDelete.id,
      });

      onChannelDeleted();
      toast.success('Канал удален');
      setShowDeleteConfirm(false);
      setChannelToDelete(null);
    } catch (err) {
      console.error('Error deleting channel:', err);
      toast.error(err.message || 'Ошибка при удалении канала');
      setShowDeleteConfirm(false);
      setChannelToDelete(null);
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
    <div className="bg-white dark:bg-slate-800/90 dark:border dark:border-slate-700/50 rounded-lg shadow dark:shadow-xl p-3 sm:p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
          Управление каналами
        </h2>
      </div>

      {/* Переключатель секций */}
      <div className="mb-6 border-b border-gray-200 dark:border-slate-700">
        <nav className="flex space-x-1">
          <button
            onClick={() => setActiveSection('channels')}
            className={`px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              activeSection === 'channels'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:border-gray-300 dark:hover:border-gray-600'
            }`}
          >
            Каналы
          </button>
          <button
            onClick={() => setActiveSection('groups')}
            className={`px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              activeSection === 'groups'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:border-gray-300 dark:hover:border-gray-600'
            }`}
          >
            Группы каналов
          </button>
        </nav>
      </div>

      {activeSection === 'groups' ? (
        <ChannelGroups
          channels={channels}
          token={token}
          onSelectGroup={(channelIds) => {
            if (!channelIds || !Array.isArray(channelIds) || channelIds.length === 0) {
              toast.error('Группа не содержит каналов');
              return;
            }
            toast.success(`Выбрано каналов: ${channelIds.length}`);
            // Отправляем событие для выбора группы в форме поста
            const event = new CustomEvent('selectChannelGroup', { detail: channelIds });
            window.dispatchEvent(event);
          }}
        />
      ) : (
        <>
          <div className="flex items-center justify-between mb-4">
            <div className="flex gap-2">
          <button
            onClick={handleExport}
            className="px-3 py-1 text-sm bg-green-600 dark:bg-green-500 text-white rounded hover:bg-green-700 dark:hover:bg-green-600"
          >
            Экспорт
          </button>
          <button
            onClick={() => setShowImport(!showImport)}
            className="px-3 py-1 text-sm bg-blue-600 dark:bg-blue-500 text-white rounded hover:bg-blue-700 dark:hover:bg-blue-600"
          >
            Импорт
          </button>
        </div>
      </div>

      {showImport && (
        <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-600/10 rounded-lg border border-blue-200 dark:border-blue-500/30">
          <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-2">Импорт каналов</h3>
          <div className="space-y-2">
            <input
              type="file"
              accept=".json"
              onChange={handleFileImport}
              className="text-sm file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 dark:file:bg-blue-900/20 file:text-blue-700 dark:file:text-blue-300 hover:file:bg-blue-100 dark:hover:file:bg-blue-900/30"
            />
            <textarea
              value={importData}
              onChange={(e) => setImportData(e.target.value)}
              placeholder="Или вставьте JSON данные..."
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
            <div className="flex gap-2">
              <button
                onClick={handleImport}
                disabled={!importData}
                className="px-3 py-1 text-sm bg-blue-600 dark:bg-blue-500 text-white rounded hover:bg-blue-700 dark:hover:bg-blue-600 disabled:opacity-50"
              >
                Импортировать
              </button>
              <button
                onClick={() => {
                  setShowImport(false);
                  setImportData('');
                }}
                className="px-3 py-1 text-sm bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-200 rounded hover:bg-gray-400 dark:hover:bg-gray-500"
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
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              ID канала или username
            </label>
            <div className="relative">
              <input
                type="text"
                value={channelId}
                onChange={handleChannelIdChange}
                placeholder="@channel или -1001234567890"
                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 dark:focus:ring-offset-2 dark:focus:ring-offset-slate-800 bg-white dark:bg-slate-800/50 text-gray-900 dark:text-slate-100"
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
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Название канала {fetchingName && <span className="text-xs text-gray-500 dark:text-gray-400">(получение...)</span>}
            </label>
            <input
              type="text"
              value={channelName}
              onChange={(e) => setChannelName(e.target.value)}
              placeholder="Автоматически или введите вручную"
              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 dark:focus:ring-offset-2 dark:focus:ring-offset-slate-800 bg-white dark:bg-slate-800/50 text-gray-900 dark:text-slate-100"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Теги (через запятую)
            </label>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="новости, важное"
              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 dark:focus:ring-offset-2 dark:focus:ring-offset-slate-800 bg-white dark:bg-slate-800/50 text-gray-900 dark:text-slate-100"
            />
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-red-700 dark:text-red-400 text-sm">
            {error}
          </div>
        )}

        <button
          type="submit"
            disabled={addChannel.isPending}
          className="px-4 py-2 bg-blue-600 dark:bg-blue-500 text-white rounded-md hover:bg-blue-700 dark:hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {adding ? 'Добавление...' : 'Добавить канал'}
        </button>
      </form>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base sm:text-lg font-medium text-gray-900 dark:text-white">
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
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          />
          {allTags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setSelectedTag('')}
                className={`px-2 py-1 text-xs rounded ${
                  selectedTag === '' 
                    ? 'bg-blue-600 dark:bg-blue-500 text-white' 
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
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
                      ? 'bg-blue-600 dark:bg-blue-500 text-white' 
                      : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          )}
        </div>

        {!token ? (
          <p className="text-gray-500 dark:text-gray-400">Выберите бота для просмотра каналов</p>
        ) : loading && channels.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400">Загрузка...</p>
        ) : filteredChannels.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400">
            {channels.length === 0 ? 'Нет добавленных каналов' : 'Каналы не найдены'}
          </p>
        ) : (
          <div className="space-y-1.5 sm:space-y-2">
            {filteredChannels.map((channel) => (
              <div
                key={channel.id}
                className="flex items-center justify-between p-2 sm:p-3 bg-gray-50 dark:bg-slate-800/60 rounded border border-gray-200 dark:border-slate-700"
              >
                <div className="flex items-center space-x-2 sm:space-x-3 flex-1 min-w-0">
                  {channel.avatarUrl ? (
                    <img
                      src={channel.avatarUrl}
                      alt={channel.name}
                      className="w-8 h-8 sm:w-12 sm:h-12 rounded-full object-cover flex-shrink-0"
                      onError={(e) => {
                        e.target.style.display = 'none';
                      }}
                    />
                  ) : (
                    <div className="w-8 h-8 sm:w-12 sm:h-12 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center flex-shrink-0">
                      <span className="text-gray-600 dark:text-gray-300 text-sm sm:text-lg font-semibold">
                        {channel.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm sm:text-base font-medium text-gray-900 dark:text-white truncate">{channel.name}</p>
                    <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 truncate">{channel.id}</p>
                    {channel.owner && (
                      <p className="text-xs text-gray-400 dark:text-gray-500 truncate mt-0.5">
                        Владелец: {channel.owner.name || channel.owner.username}
                      </p>
                    )}
                    {channel.tags && channel.tags.length > 0 && (
                      <div className="flex flex-wrap gap-0.5 sm:gap-1 mt-0.5 sm:mt-1">
                        {channel.tags.map(tag => (
                          <span
                            key={tag}
                            className="px-1.5 sm:px-2 py-0.5 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 rounded"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleDeleteChannelClick(channel.id);
                  }}
                  className="px-2 sm:px-3 py-1 text-xs sm:text-sm bg-red-600 dark:bg-red-500 text-white rounded hover:bg-red-700 dark:hover:bg-red-600 ml-2 flex-shrink-0"
                >
                  Удалить
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
        </>
      )}

      {/* Модальное окно подтверждения удаления канала */}
      {showDeleteConfirm && channelToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 dark:border dark:border-slate-700/50 rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-4 sm:p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Удалить канал?
              </h3>
              <p className="text-sm text-gray-700 dark:text-gray-300 mb-6">
                Вы уверены, что хотите удалить канал <strong>"{channelToDelete.name}"</strong>?
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    setChannelToDelete(null);
                  }}
                  className="flex-1 px-4 py-2 bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-200 rounded hover:bg-gray-400 dark:hover:bg-gray-500"
                >
                  Отмена
                </button>
                <button
                  type="button"
                  onClick={handleDeleteChannelConfirm}
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

export default ChannelManager;
