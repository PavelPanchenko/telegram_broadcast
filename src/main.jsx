import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App.jsx'
import './index.css'

// Настройка QueryClient с разумными дефолтами
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 минут - данные считаются свежими
      cacheTime: 10 * 60 * 1000, // 10 минут - кеш хранится
      retry: 2, // Повторять запросы 2 раза при ошибке
      refetchOnWindowFocus: false, // Не обновлять при фокусе окна
      refetchOnReconnect: true, // Обновлять при восстановлении соединения
    },
    mutations: {
      retry: 1, // Повторять мутации 1 раз при ошибке
    },
  },
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
)

