# Многоступенчатая сборка
FROM node:20-alpine AS builder

WORKDIR /app

# Копируем файлы зависимостей
COPY package*.json ./

# Устанавливаем зависимости
RUN npm ci

# Копируем исходный код
COPY . .

# Собираем frontend
RUN npm run build

# Продакшн образ
FROM node:20-alpine

WORKDIR /app

# Копируем package.json для установки только production зависимостей
COPY package*.json ./

# Устанавливаем только production зависимости
RUN npm ci --only=production

# Копируем собранный frontend из builder
COPY --from=builder /app/dist ./dist

# Копируем server и другие необходимые файлы
COPY server ./server
COPY index.html ./

# Создаем директории для данных и загрузок
RUN mkdir -p server/data uploads

# Открываем порт
EXPOSE 5001

# Запускаем приложение
CMD ["node", "server/index.js"]

