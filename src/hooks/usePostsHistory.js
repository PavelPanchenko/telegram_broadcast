import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { parseJsonResponse } from '../utils/api';

// Получить историю постов
export function usePostsHistory(token, options = {}) {
  const { limit = 50, olderThanDays } = options;
  
  return useQuery({
    queryKey: ['postsHistory', token, { limit, olderThanDays }],
    queryFn: async () => {
      if (!token) return [];
      
      const headers = {};
      if (token) headers['X-Bot-Token'] = token;
      
      let url = `/api/posts/history?limit=${limit}`;
      if (olderThanDays) {
        url += `&olderThanDays=${olderThanDays}`;
      }
      
      const response = await fetch(url, {
        headers,
        credentials: 'include',
      });
      return parseJsonResponse(response);
    },
    enabled: !!token,
  });
}

// Удалить старые посты из истории
export function useDeleteOldPosts() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ token, olderThanDays }) => {
      const headers = {};
      if (token) headers['X-Bot-Token'] = token;
      
      const url = olderThanDays
        ? `/api/posts/history?olderThanDays=${olderThanDays}`
        : '/api/posts/history';
      
      const response = await fetch(url, {
        method: 'DELETE',
        headers,
        credentials: 'include',
      });
      return parseJsonResponse(response);
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ 
        queryKey: ['postsHistory', variables.token] 
      });
    },
  });
}

