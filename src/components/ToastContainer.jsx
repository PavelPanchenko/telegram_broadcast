import { useState, useEffect } from 'react';
import Toast from './Toast';
import { toast as toastUtil } from '../utils/toast';

function ToastContainer() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    const unsubscribe = toastUtil.subscribe((message, type, duration) => {
      const id = Date.now() + Math.random();
      setToasts(prev => [...prev, { id, message, type, duration }]);
    });

    return unsubscribe;
  }, []);

  const removeToast = (id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2">
      {toasts.map(toast => (
        <Toast
          key={toast.id}
          message={toast.message}
          type={toast.type}
          duration={toast.duration}
          onClose={() => removeToast(toast.id)}
        />
      ))}
    </div>
  );
}

export default ToastContainer;

