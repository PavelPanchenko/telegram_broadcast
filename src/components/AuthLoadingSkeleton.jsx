/**
 * Скелетон при проверке сессии (до показа логина или приложения)
 */
function AuthLoadingSkeleton() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-950 flex items-center justify-center p-4">
      <div
        className="w-full max-w-md rounded-lg shadow-xl border border-gray-200 dark:border-slate-700/80 bg-white dark:bg-slate-800/90 p-8 animate-pulse"
        role="status"
        aria-busy="true"
        aria-label="Загрузка"
      >
        <div className="h-8 bg-gray-200 dark:bg-slate-600 rounded w-3/4 mx-auto mb-8" />
        <div className="space-y-6">
          <div>
            <div className="h-4 bg-gray-200 dark:bg-slate-600 rounded w-1/3 mb-2" />
            <div className="h-10 bg-gray-100 dark:bg-slate-700 rounded-md" />
          </div>
          <div>
            <div className="h-4 bg-gray-200 dark:bg-slate-600 rounded w-1/4 mb-2" />
            <div className="h-10 bg-gray-100 dark:bg-slate-700 rounded-md" />
          </div>
          <div className="h-11 bg-gray-200 dark:bg-slate-600 rounded-md w-full" />
        </div>
        <p className="mt-6 text-center text-xs text-gray-400 dark:text-slate-500">
          Проверка авторизации…
        </p>
      </div>
    </div>
  );
}

export default AuthLoadingSkeleton;
