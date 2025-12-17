import { useState, useEffect } from 'react';

function Templates({ onSelectTemplate, token }) {
  const getHeaders = () => {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['X-Bot-Token'] = token;
    return headers;
  };
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [text, setText] = useState('');

  useEffect(() => {
    if (token) {
      fetchTemplates();
    }
  }, [token]);

  const fetchTemplates = async () => {
    if (!token) return;
    
    try {
      const headers = {};
      if (token) headers['X-Bot-Token'] = token;
      
      const response = await fetch('/api/templates', { 
        headers,
        credentials: 'include',
      });
      const data = await response.json();
      setTemplates(data);
    } catch (error) {
      console.error('Error fetching templates:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!name || !text) {
      alert('Заполните все поля');
      return;
    }

    try {
      const response = await fetch('/api/templates', {
        method: 'POST',
        headers: getHeaders(),
        credentials: 'include',
        body: JSON.stringify({ name, text }),
      });

      if (!response.ok) {
        throw new Error('Ошибка при создании шаблона');
      }

      setName('');
      setText('');
      setShowForm(false);
      fetchTemplates();
    } catch (error) {
      alert(error.message);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Удалить шаблон?')) return;

    try {
      const headers = {};
      if (token) headers['X-Bot-Token'] = token;
      
      const response = await fetch(`/api/templates/${id}`, {
        method: 'DELETE',
        headers,
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Ошибка при удалении шаблона');
      }

      fetchTemplates();
    } catch (error) {
      alert(error.message);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-gray-900">
          Шаблоны постов
        </h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          {showForm ? 'Отмена' : '+ Создать шаблон'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="mb-4 p-4 bg-gray-50 rounded border">
          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Название шаблона
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
              required
            />
          </div>
          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Текст шаблона
            </label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
              required
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Сохранить
          </button>
        </form>
      )}

      {loading ? (
        <p className="text-gray-500">Загрузка...</p>
      ) : templates.length === 0 ? (
        <p className="text-gray-500">Нет шаблонов</p>
      ) : (
        <div className="space-y-2">
          {templates.map((template) => (
            <div
              key={template.id}
              className="p-3 border border-gray-200 rounded flex items-start justify-between"
            >
              <div className="flex-1">
                <p className="font-medium text-gray-900">{template.name}</p>
                <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap">
                  {template.text.substring(0, 100)}
                  {template.text.length > 100 && '...'}
                </p>
              </div>
              <div className="flex gap-2 ml-4">
                {onSelectTemplate && (
                  <button
                    onClick={() => onSelectTemplate(template.text)}
                    className="px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700"
                  >
                    Использовать
                  </button>
                )}
                <button
                  onClick={() => handleDelete(template.id)}
                  className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700"
                >
                  Удалить
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default Templates;

