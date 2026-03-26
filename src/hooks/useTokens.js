import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { parseJsonResponse } from '../utils/api';

/** Онлайн-статус ботов по id (хеш), для бейджей на карточках */
export function useBotsOnlineStatus(hasAnyToken = true) {
  return useQuery({
    queryKey: ['botsStatus'],
    queryFn: async () => {
      const response = await fetch('/api/bots-status', { credentials: 'include' });
      if (!response.ok) {
        throw new Error(`Статус ботов: ${response.status}`);
      }
      return parseJsonResponse(response);
    },
    enabled: hasAnyToken,
    staleTime: 60 * 1000,
    refetchInterval: 2 * 60 * 1000,
  });
}

// Получить список токенов
export function useTokens() {
  return useQuery({
    queryKey: ['tokens'],
    queryFn: async () => {
      const response = await fetch('/api/tokens', {
        credentials: 'include',
      });
      
      // Если 401, возвращаем пустой массив вместо ошибки
      if (response.status === 401) {
        return [];
      }
      
      if (!response.ok) {
        throw new Error(`Failed to fetch tokens: ${response.status}`);
      }
      
      const data = await parseJsonResponse(response);
      // Убеждаемся, что возвращаем массив
      return Array.isArray(data) ? data : [];
    },
    retry: false, // Не повторяем запрос при 401
    staleTime: 2 * 60 * 1000, // Кэш 2 мин — список ботов меняется редко; после логина/мутаций делаем invalidateQueries
    refetchOnMount: true,
  });
}

// Валидация токена (без сохранения)
export function useValidateToken() {
  return useMutation({
    mutationFn: async (token) => {
      const response = await fetch('/api/tokens/validate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ token }),
      });
      return parseJsonResponse(response);
    },
  });
}

// Добавить токен
export function useAddToken() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ token, name }) => {
      const response = await fetch('/api/tokens', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ token, name }),
      });
      return parseJsonResponse(response);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tokens'] });
      queryClient.invalidateQueries({ queryKey: ['botsStatus'] });
    },
  });
}

// Удалить токен
export function useDeleteToken() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (tokenId) => {
      const response = await fetch(`/api/tokens/${encodeURIComponent(tokenId)}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      return parseJsonResponse(response);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tokens'] });
      queryClient.invalidateQueries({ queryKey: ['botsStatus'] });
    },
  });
}

// Обновить токен
export function useUpdateToken() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, name }) => {
      const response = await fetch(`/api/tokens/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ name }),
      });
      return parseJsonResponse(response);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tokens'] });
    },
  });
}

/** Смена секрета бота (каналы, история и остальное сохраняются) */
export function useReplaceBotTokenSecret() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, newToken }) => {
      const response = await fetch(`/api/tokens/${encodeURIComponent(id)}/secret`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ newToken }),
      });
      const data = await parseJsonResponse(response);
      if (!response.ok) {
        throw new Error(data.error || `Ошибка ${response.status}`);
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tokens'] });
      queryClient.invalidateQueries({ queryKey: ['channels'] });
      queryClient.invalidateQueries({ queryKey: ['botsStatus'] });
      queryClient.invalidateQueries({ queryKey: ['scheduledPosts'] });
      queryClient.invalidateQueries({ queryKey: ['scheduledPost'] });
      queryClient.invalidateQueries({ queryKey: ['recurringPosts'] });
      queryClient.invalidateQueries({ queryKey: ['postsHistory'] });
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      queryClient.invalidateQueries({ queryKey: ['channelInfo'] });
    },
  });
}

