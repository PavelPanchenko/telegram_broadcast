import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { parseJsonResponse } from '../utils/api';

// Получить список запланированных постов
export function useScheduledPosts(token) {
  return useQuery({
    queryKey: ['scheduledPosts', token],
    queryFn: async () => {
      if (!token) return [];
      
      const headers = {};
      if (token) headers['X-Bot-Token'] = token;
      
      const response = await fetch('/api/scheduled-posts', {
        headers,
        credentials: 'include',
      });
      return parseJsonResponse(response);
    },
    enabled: !!token,
    refetchInterval: 30000, // Обновлять каждые 30 секунд
    staleTime: 10 * 1000, // 10 секунд
  });
}

// Получить один запланированный пост
export function useScheduledPost(token, postId) {
  return useQuery({
    queryKey: ['scheduledPost', token, postId],
    queryFn: async () => {
      if (!token || !postId) return null;
      
      const headers = {};
      if (token) headers['X-Bot-Token'] = token;
      
      const response = await fetch(`/api/scheduled-posts/${encodeURIComponent(postId)}`, {
        headers,
        credentials: 'include',
      });
      return parseJsonResponse(response);
    },
    enabled: !!token && !!postId,
  });
}

// Обновить запланированный пост
export function useUpdateScheduledPost() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ token, postId, data }) => {
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['X-Bot-Token'] = token;
      
      const response = await fetch(`/api/scheduled-posts/${encodeURIComponent(postId)}`, {
        method: 'PUT',
        headers,
        credentials: 'include',
        body: JSON.stringify(data),
      });
      return parseJsonResponse(response);
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ 
        queryKey: ['scheduledPosts', variables.token] 
      });
      queryClient.invalidateQueries({ 
        queryKey: ['scheduledPost', variables.token, variables.postId] 
      });
    },
  });
}

// Удалить запланированный пост
export function useDeleteScheduledPost() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ token, postId }) => {
      const headers = {};
      if (token) headers['X-Bot-Token'] = token;
      
      const response = await fetch(`/api/scheduled-posts/${encodeURIComponent(postId)}`, {
        method: 'DELETE',
        headers,
        credentials: 'include',
      });
      return parseJsonResponse(response);
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ 
        queryKey: ['scheduledPosts', variables.token] 
      });
    },
  });
}

