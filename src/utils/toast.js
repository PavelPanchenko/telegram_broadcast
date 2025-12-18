// Простая система toast уведомлений
let toastListeners = [];

export const toast = {
  show: (message, type = 'info', duration = 3000) => {
    toastListeners.forEach(listener => listener(message, type, duration));
  },
  success: (message, duration = 3000) => {
    toast.show(message, 'success', duration);
  },
  error: (message, duration = 5000) => {
    toast.show(message, 'error', duration);
  },
  warning: (message, duration = 4000) => {
    toast.show(message, 'warning', duration);
  },
  info: (message, duration = 3000) => {
    toast.show(message, 'info', duration);
  },
  subscribe: (listener) => {
    toastListeners.push(listener);
    return () => {
      toastListeners = toastListeners.filter(l => l !== listener);
    };
  },
};

