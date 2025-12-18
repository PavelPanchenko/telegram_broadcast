import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { parseJsonResponse } from '../utils/api';

// Получить список шаблонов
export function useTemplates(token) {
  return useQuery({
    queryKey: ['templates', token],
    queryFn: async () => {
      if (!token) return [];
      
      const headers = {};
      if (token) headers['X-Bot-Token'] = token;
      
      const response = await fetch('/api/templates', {
        headers,
        credentials: 'include',
      });
      return parseJsonResponse(response);
    },
    enabled: !!token,
  });
}

// Создать шаблон
export function useCreateTemplate() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ token, name, text }) => {
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['X-Bot-Token'] = token;
      
      const response = await fetch('/api/templates', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({ name, text }),
      });
      return parseJsonResponse(response);
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ 
        queryKey: ['templates', variables.token] 
      });
    },
  });
}

// Удалить шаблон
export function useDeleteTemplate() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ token, templateId }) => {
      const headers = {};
      if (token) headers['X-Bot-Token'] = token;
      
      const response = await fetch(`/api/templates/${encodeURIComponent(templateId)}`, {
        method: 'DELETE',
        headers,
        credentials: 'include',
      });
      return parseJsonResponse(response);
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ 
        queryKey: ['templates', variables.token] 
      });
    },
  });
}

