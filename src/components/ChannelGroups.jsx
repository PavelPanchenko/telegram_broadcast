import { useState, useEffect } from 'react';
import { parseJsonResponse } from '../utils/api';
import { toast } from '../utils/toast';

function ChannelGroups({ channels, token, onSelectGroup }) {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [selectedChannels, setSelectedChannels] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [groupToDelete, setGroupToDelete] = useState(null);

  const getHeaders = () => {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['X-Bot-Token'] = token;
    return headers;
  };

  useEffect(() => {
    if (token) {
      fetchGroups();
    }
  }, [token]);

  const fetchGroups = async () => {
    if (!token) return;
    
    setLoading(true);
    try {
      const response = await fetch('/api/channel-groups', {
        headers: getHeaders(),
        credentials: 'include',
      });
      const data = await parseJsonResponse(response);
      setGroups(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error fetching groups:', error);
      toast.error('Ошибка при загрузке групп');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    
    if (!groupName.trim()) {
      toast.error('Введите название группы');
      return;
    }

    if (selectedChannels.length === 0) {
      toast.error('Выберите хотя бы один канал');
      return;
    }

    try {
      const response = await fetch('/api/channel-groups', {
        method: 'POST',
        headers: getHeaders(),
        credentials: 'include',
        body: JSON.stringify({
          name: groupName,
          channelIds: selectedChannels
        }),
      });

      const data = await parseJsonResponse(response);

      if (!response.ok) {
        throw new Error(data.error || 'Ошибка при создании группы');
      }

      setGroupName('');
      setSelectedChannels([]);
      setShowForm(false);
      fetchGroups();
      toast.success('Группа создана');
    } catch (error) {
      console.error('Error creating group:', error);
      toast.error(error.message || 'Ошибка при создании группы');
    }
  };

  const handleDeleteClick = (id) => {
    const group = groups.find(g => g.id === id);
    setGroupToDelete({ id, name: group?.name || 'группу' });
    setShowDeleteConfirm(true);
  };

  const handleDeleteConfirm = async () => {
    if (!groupToDelete) return;

    try {
      const response = await fetch(`/api/channel-groups/${encodeURIComponent(groupToDelete.id)}`, {
        method: 'DELETE',
        headers: getHeaders(),
        credentials: 'include',
      });

      const data = await parseJsonResponse(response);

      if (!response.ok) {
        throw new Error(data.error || 'Ошибка при удалении группы');
      }

      fetchGroups();
      toast.success('Группа удалена');
      setShowDeleteConfirm(false);
      setGroupToDelete(null);
    } catch (error) {
      console.error('Error deleting group:', error);
      toast.error(error.message || 'Ошибка при удалении группы');
    }
  };

  const handleChannelToggle = (channelId) => {
    setSelectedChannels(prev =>
      prev.includes(channelId)
        ? prev.filter(id => id !== channelId)
        : [...prev, channelId]
    );
  };

  const filteredChannels = channels.filter(c =>
    !searchQuery || 
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

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
          Группы каналов
        </h2>
        <button
          type="button"
          onClick={() => setShowForm(!showForm)}
          className="px-2 sm:px-3 py-1 text-xs sm:text-sm bg-blue-600 dark:bg-blue-500 text-white rounded hover:bg-blue-700 dark:hover:bg-blue-600 whitespace-nowrap w-full sm:w-auto"
        >
          {showForm ? 'Отмена' : '+ Создать группу'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="mb-6 p-4 bg-gray-50 dark:bg-slate-800/60 rounded-lg border dark:border-slate-700">
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Название группы
            </label>
            <input
              type="text"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-md bg-white dark:bg-slate-800/50 text-gray-900 dark:text-slate-100"
              placeholder="Например: Все каналы, Важные каналы"
              required
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Выберите каналы ({selectedChannels.length} выбрано)
            </label>
            <input
              type="text"
              placeholder="Поиск каналов..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full mb-2 px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-md bg-white dark:bg-slate-800/50 text-gray-900 dark:text-slate-100"
            />
            <div className="max-h-48 overflow-y-auto border border-gray-200 dark:border-slate-700 rounded-md p-3 bg-white dark:bg-slate-800/60">
              {filteredChannels.length === 0 ? (
                <p className="text-gray-500 dark:text-gray-400 text-sm text-center">Каналы не найдены</p>
              ) : (
                filteredChannels.map((channel) => (
                  <label
                    key={channel.id}
                    className="flex items-center space-x-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-700/80 p-2 rounded"
                  >
                    <input
                      type="checkbox"
                      checked={selectedChannels.includes(channel.id)}
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
            Создать группу
          </button>
        </form>
      )}

      {groups.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400">Нет созданных групп</p>
      ) : (
        <div className="space-y-1.5 sm:space-y-2">
          {groups.map((group) => {
            const groupChannels = channels.filter(c => group.channelIds.includes(c.id));
            return (
              <div
                key={group.id}
                className="p-2 sm:p-3 border border-gray-200 dark:border-slate-700 rounded flex items-start justify-between bg-white dark:bg-slate-800/60"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm sm:text-base font-medium text-gray-900 dark:text-white truncate">{group.name}</p>
                  <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-0.5 sm:mt-1">
                    Каналов: {groupChannels.length} / {group.channelIds.length}
                  </p>
                  {groupChannels.length > 0 && (
                    <div className="flex flex-wrap gap-0.5 sm:gap-1 mt-1 sm:mt-2">
                      {groupChannels.slice(0, 5).map(channel => (
                        <span
                          key={channel.id}
                          className="px-1.5 sm:px-2 py-0.5 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 rounded"
                        >
                          {channel.name}
                        </span>
                      ))}
                      {groupChannels.length > 5 && (
                        <span className="px-1.5 sm:px-2 py-0.5 text-xs text-gray-500 dark:text-gray-400">
                          +{groupChannels.length - 5}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex gap-1.5 sm:gap-2 ml-2 sm:ml-4 flex-shrink-0">
                  {onSelectGroup && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (onSelectGroup) {
                          onSelectGroup(group.channelIds);
                        }
                      }}
                      className="px-2 sm:px-3 py-1 text-xs sm:text-sm bg-green-600 dark:bg-green-500 text-white rounded hover:bg-green-700 dark:hover:bg-green-600"
                    >
                      Выбрать
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleDeleteClick(group.id);
                    }}
                    className="px-2 sm:px-3 py-1 text-xs sm:text-sm bg-red-600 dark:bg-red-500 text-white rounded hover:bg-red-700 dark:hover:bg-red-600"
                  >
                    Удалить
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Модальное окно подтверждения удаления */}
      {showDeleteConfirm && groupToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 dark:border dark:border-slate-700/50 rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-4 sm:p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Удалить группу?
              </h3>
              <p className="text-sm text-gray-700 dark:text-gray-300 mb-6">
                Вы уверены, что хотите удалить группу <strong>"{groupToDelete.name}"</strong>?
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    setGroupToDelete(null);
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

export default ChannelGroups;

