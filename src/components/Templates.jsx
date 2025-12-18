import { useState } from 'react';
import { toast } from '../utils/toast';
import { useTemplates, useCreateTemplate, useDeleteTemplate } from '../hooks/useTemplates';

function Templates({ onSelectTemplate, token }) {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [templateToDelete, setTemplateToDelete] = useState(null);

  // React Query хуки
  const { data: templates = [], isLoading: loading } = useTemplates(token);
  const createTemplate = useCreateTemplate();
  const deleteTemplate = useDeleteTemplate();

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!name || !text) {
      alert('Заполните все поля');
      return;
    }

    try {
      await createTemplate.mutateAsync({ token, name, text });
      setName('');
      setText('');
      setShowForm(false);
    } catch (error) {
      alert(error.message);
    }
  };

  const handleDeleteClick = (id) => {
    const template = templates.find(t => t.id === id);
    setTemplateToDelete({ id, name: template?.name || 'шаблон' });
    setShowDeleteConfirm(true);
  };

  const handleDeleteConfirm = async () => {
    if (!templateToDelete) return;

    try {
      await deleteTemplate.mutateAsync({ token, templateId: templateToDelete.id });
      toast.success('Шаблон удален');
      setShowDeleteConfirm(false);
      setTemplateToDelete(null);
    } catch (error) {
      console.error('[Templates] Error deleting template:', error);
      toast.error(error.message || 'Ошибка при удалении шаблона');
      setShowDeleteConfirm(false);
      setTemplateToDelete(null);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-800/90 dark:border dark:border-slate-700/50 rounded-lg shadow dark:shadow-xl p-3 sm:p-6">
      <div className="flex items-center justify-between mb-3 sm:mb-4">
        <h2 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white">
          Шаблоны постов
        </h2>
        <button
          type="button"
          onClick={() => setShowForm(!showForm)}
          className="px-2 sm:px-3 py-1 text-xs sm:text-sm bg-blue-600 dark:bg-blue-500 text-white rounded hover:bg-blue-700 dark:hover:bg-blue-600 whitespace-nowrap"
        >
          {showForm ? 'Отмена' : '+ Создать шаблон'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="mb-3 sm:mb-4 p-3 sm:p-4 bg-gray-50 dark:bg-slate-800/60 rounded border dark:border-slate-700">
          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Название шаблона
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-md bg-white dark:bg-slate-800/50 text-gray-900 dark:text-slate-100"
              required
            />
          </div>
          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Текст шаблона
            </label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-md bg-white dark:bg-slate-800/50 text-gray-900 dark:text-slate-100"
              required
            />
          </div>
          <button
            type="submit"
            className="px-3 sm:px-4 py-1.5 sm:py-2 text-sm bg-blue-600 dark:bg-blue-500 text-white rounded hover:bg-blue-700 dark:hover:bg-blue-600"
          >
            Сохранить
          </button>
        </form>
      )}

      {loading ? (
        <p className="text-gray-500 dark:text-gray-400">Загрузка...</p>
      ) : templates.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400">Нет шаблонов</p>
      ) : (
        <div className="space-y-1.5 sm:space-y-2">
          {templates.map((template) => (
            <div
              key={template.id}
              className="p-2 sm:p-3 border border-gray-200 dark:border-slate-700 rounded flex items-start justify-between bg-white dark:bg-slate-800/60"
              style={{ position: 'relative' }}
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm sm:text-base font-medium text-gray-900 dark:text-white truncate">{template.name}</p>
                <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-0.5 sm:mt-1 whitespace-pre-wrap">
                  {template.text.substring(0, 100)}
                  {template.text.length > 100 && '...'}
                </p>
              </div>
              <div className="flex gap-2 ml-4" style={{ position: 'relative', zIndex: 10 }}>
                {onSelectTemplate && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onSelectTemplate(template.text);
                    }}
                    className="px-2 py-1 text-xs bg-green-600 dark:bg-green-500 text-white rounded hover:bg-green-700 dark:hover:bg-green-600"
                  >
                    Использовать
                  </button>
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleDeleteClick(template.id);
                  }}
                  className="px-2 sm:px-3 py-1 text-xs sm:text-sm bg-red-600 dark:bg-red-500 text-white rounded hover:bg-red-700 dark:hover:bg-red-600"
                >
                  Удалить
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Модальное окно подтверждения удаления */}
      {showDeleteConfirm && templateToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 dark:border dark:border-slate-700/50 rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-4 sm:p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Удалить шаблон?
              </h3>
              <p className="text-sm text-gray-700 dark:text-gray-300 mb-6">
                Вы уверены, что хотите удалить шаблон <strong>"{templateToDelete.name}"</strong>?
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    setTemplateToDelete(null);
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

export default Templates;

