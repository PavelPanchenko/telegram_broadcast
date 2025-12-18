import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { parseJsonResponse } from '../utils/api';

// Получить список автоматических постов
export function useRecurringPosts(token) {
  return useQuery({
    queryKey: ['recurringPosts', token],
    queryFn: async () => {
      if (!token) return [];
      
      const headers = {};
      if (token) headers['X-Bot-Token'] = token;
      
      const response = await fetch('/api/recurring-posts', {
        headers,
        credentials: 'include',
      });
      return parseJsonResponse(response);
    },
    enabled: !!token,
  });
}

// Создать автоматический пост
export function useCreateRecurringPost() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ token, data }) => {
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['X-Bot-Token'] = token;
      
      const response = await fetch('/api/recurring-posts', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify(data),
      });
      return parseJsonResponse(response);
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ 
        queryKey: ['recurringPosts', variables.token] 
      });
    },
  });
}

// Обновить автоматический пост
export function useUpdateRecurringPost() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ token, postId, data }) => {
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['X-Bot-Token'] = token;
      
      const response = await fetch(`/api/recurring-posts/${encodeURIComponent(postId)}`, {
        method: 'PUT',
        headers,
        credentials: 'include',
        body: JSON.stringify(data),
      });
      return parseJsonResponse(response);
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ 
        queryKey: ['recurringPosts', variables.token] 
      });
    },
  });
}

// Удалить автоматический пост
export function useDeleteRecurringPost() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ token, postId }) => {
      const headers = {};
      if (token) headers['X-Bot-Token'] = token;
      
      const response = await fetch(`/api/recurring-posts/${encodeURIComponent(postId)}`, {
        method: 'DELETE',
        headers,
        credentials: 'include',
      });
      return parseJsonResponse(response);
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ 
        queryKey: ['recurringPosts', variables.token] 
      });
    },
  });
}

// Переключить статус автоматического поста (включить/выключить)
export function useToggleRecurringPost() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ token, postId, enabled }) => {
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['X-Bot-Token'] = token;
      
      const response = await fetch(`/api/recurring-posts/${encodeURIComponent(postId)}`, {
        method: 'PUT',
        headers,
        credentials: 'include',
        body: JSON.stringify({ enabled }),
      });
      return parseJsonResponse(response);
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ 
        queryKey: ['recurringPosts', variables.token] 
      });
    },
  });
}

