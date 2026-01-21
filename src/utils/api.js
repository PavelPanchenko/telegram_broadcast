// Утилита для безопасного парсинга JSON ответов
export async function parseJsonResponse(response) {
  // Специальная обработка для 429 (Too Many Requests)
  if (response.status === 429) {
    const text = await response.text();
    throw new Error(`Слишком много запросов. Пожалуйста, подождите немного и попробуйте снова. (Статус: 429)`);
  }
  
  const contentType = response.headers.get('content-type');
  
  if (!contentType || !contentType.includes('application/json')) {
    const text = await response.text();
    throw new Error(`Ожидался JSON, получен HTML или другой формат. Статус: ${response.status}. Ответ: ${text.substring(0, 200)}`);
  }
  
  return await response.json();
}

