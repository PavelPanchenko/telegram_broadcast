// Утилита для безопасного парсинга JSON ответов
export async function parseJsonResponse(response) {
  const contentType = response.headers.get('content-type');
  
  if (!contentType || !contentType.includes('application/json')) {
    const text = await response.text();
    throw new Error(`Ожидался JSON, получен HTML или другой формат. Статус: ${response.status}. Ответ: ${text.substring(0, 200)}`);
  }
  
  return await response.json();
}

