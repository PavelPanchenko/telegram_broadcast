import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { parseJsonResponse } from '../utils/api';

// Получить список каналов
export function useChannels(token, options = {}) {
  const { includeAvatars = false } = options;
  
  return useQuery({
    queryKey: ['channels', token, { includeAvatars }],
    queryFn: async () => {
      if (!token) return [];
      
      const url = `/api/channels${includeAvatars ? '?includeAvatars=true' : ''}`;
      const response = await fetch(url, {
        headers: {
          'X-Bot-Token': token,
        },
        credentials: 'include',
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      return parseJsonResponse(response);
    },
    enabled: !!token, // Запрос выполняется только если есть token
    staleTime: 2 * 60 * 1000, // 2 минуты для каналов
  });
}

// Получить информацию о канале
export function useChannelInfo(token, channelId) {
  return useQuery({
    queryKey: ['channelInfo', token, channelId],
    queryFn: async () => {
      if (!token || !channelId) return null;
      
      const headers = {};
      if (token) headers['X-Bot-Token'] = token;
      
      const response = await fetch(`/api/channels/get-info/${encodeURIComponent(channelId)}`, {
        headers,
        credentials: 'include',
      });
      return parseJsonResponse(response);
    },
    enabled: !!token && !!channelId,
  });
}

// Добавить канал
export function useAddChannel() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ token, channelId, channelName, tags }) => {
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['X-Bot-Token'] = token;
      
      const response = await fetch('/api/channels', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          channelId: channelId.trim(),
          channelName: channelName.trim() || undefined,
          tags: tags || [],
        }),
      });
      
      if (!response.ok) {
        const errorData = await parseJsonResponse(response).catch(() => ({ 
          error: `HTTP error! status: ${response.status}` 
        }));
        throw new Error(errorData.error || `Ошибка ${response.status}`);
      }
      
      return parseJsonResponse(response);
    },
    onSuccess: (data, variables) => {
      // Инвалидируем кеш каналов для конкретного токена
      queryClient.invalidateQueries({ 
        queryKey: ['channels', variables.token] 
      });
    },
  });
}

// Удалить канал
export function useDeleteChannel() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ token, channelId }) => {
      const headers = {};
      if (token) headers['X-Bot-Token'] = token;
      
      const response = await fetch(`/api/channels/${encodeURIComponent(channelId)}`, {
        method: 'DELETE',
        headers,
        credentials: 'include',
      });
      return parseJsonResponse(response);
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ 
        queryKey: ['channels', variables.token] 
      });
    },
  });
}

// Обновить канал
export function useUpdateChannel() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ token, channelId, name, tags }) => {
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['X-Bot-Token'] = token;
      
      const response = await fetch(`/api/channels/${encodeURIComponent(channelId)}`, {
        method: 'PUT',
        headers,
        credentials: 'include',
        body: JSON.stringify({ name, tags }),
      });
      return parseJsonResponse(response);
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ 
        queryKey: ['channels', variables.token] 
      });
    },
  });
}

// Импорт каналов
export function useImportChannels() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ token, channels }) => {
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['X-Bot-Token'] = token;
      
      const response = await fetch('/api/channels/import', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({ channels }),
      });
      return parseJsonResponse(response);
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ 
        queryKey: ['channels', variables.token] 
      });
    },
  });
}

