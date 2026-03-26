import { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import Login from './components/Login';
import AuthenticatedApp from './AuthenticatedApp';
import { parseJsonResponse } from './utils/api';

function App() {
  const [user, setUser] = useState(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('darkMode');
    return saved ? JSON.parse(saved) : false;
  });

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('darkMode', JSON.stringify(darkMode));
  }, [darkMode]);

  const checkAuth = async () => {
    try {
      const response = await fetch('/api/auth/me', {
        credentials: 'include',
      });

      if (response.ok) {
        const data = await parseJsonResponse(response);
        setUser(data.user);
        queryClient.invalidateQueries({ queryKey: ['tokens'] });
      } else if (response.status === 401) {
        setUser(null);
        queryClient.setQueryData(['tokens'], []);
      } else {
        console.error('Auth check failed:', response.status, response.statusText);
        setUser(null);
        queryClient.setQueryData(['tokens'], []);
      }
    } catch (error) {
      console.error('Auth check error:', error);
      setUser(null);
      queryClient.setQueryData(['tokens'], []);
    } finally {
      setCheckingAuth(false);
    }
  };

  const handleLogin = (userData) => {
    setUser(userData);
    queryClient.invalidateQueries({ queryKey: ['tokens'] });
    navigate('/', { replace: true });
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setUser(null);
      queryClient.setQueryData(['tokens'], []);
      navigate('/login', { replace: true });
    }
  };

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-slate-950 flex items-center justify-center">
        <p className="text-gray-600 dark:text-gray-400">Загрузка…</p>
      </div>
    );
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={
          user ? (
            <Navigate to="/" replace />
          ) : (
            <Login onLogin={handleLogin} darkMode={darkMode} />
          )
        }
      />
      <Route
        path="/"
        element={
          !user ? (
            <Navigate to="/login" replace />
          ) : (
            <AuthenticatedApp
              user={user}
              onLogout={handleLogout}
              darkMode={darkMode}
              setDarkMode={setDarkMode}
            />
          )
        }
      />
      <Route path="*" element={<Navigate to={user ? '/' : '/login'} replace />} />
    </Routes>
  );
}

export default App;
