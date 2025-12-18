import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { parseJsonResponse } from '../utils/api';

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
      // Инвалидируем кеш токенов после успешного добавления
      queryClient.invalidateQueries({ queryKey: ['tokens'] });
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

