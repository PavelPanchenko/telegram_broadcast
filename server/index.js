import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import TelegramBot from 'node-telegram-bot-api';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import rateLimit from 'express-rate-limit';
import basicAuth from 'express-basic-auth';
import cron from 'node-cron';
import crypto from 'crypto';
import session from 'express-session';
import { 
  initDatabase,
  getUsers, getUserById, getUserByUsername, createUser, updateUser, deleteUser,
  getTokens, getTokenByHash as dbGetTokenByHash, getTokenByToken, createToken, updateToken, deleteToken,
  getChannels, getChannelById, createChannel, updateChannel, deleteChannel,
  getPostsHistory, addPostsHistory, deleteAllPostsHistory, deleteOldPostsHistory, markPostMessagesAsDeleted,
  getTemplates, createTemplate, deleteTemplate,
  getScheduledPosts, getScheduledPostById, createScheduledPost, updateScheduledPost, deleteScheduledPost,
  getRecurringPosts, getRecurringPostById, createRecurringPost, updateRecurringPost, deleteRecurringPost,
  getChannelGroups, createChannelGroup, updateChannelGroup, deleteChannelGroup,
  getLogs, addLog
} from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5001;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 МБ
const MAX_IMAGES = 10;
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/quicktime'];
const ALLOWED_DOC_TYPES = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];

// CORS должен быть первым, чтобы preflight запросы проходили
app.use(cors({
  origin: true,
  credentials: true
}));

// Парсинг JSON
app.use(express.json({ limit: '50mb' }));

// Настройка сессий
// secure: true только если явно указано в переменных окружения или используется HTTPS
const isSecure = process.env.COOKIE_SECURE === 'true' || 
                 (process.env.NODE_ENV === 'production' && process.env.COOKIE_SECURE !== 'false');
app.use(session({
  secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: isSecure,
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000, // 24 часа
    sameSite: 'lax' // Помогает с CORS и cookie в разных сценариях
  }
}));

// Rate limiting (после CORS, чтобы не блокировать preflight запросы)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 100, // максимум 100 запросов
  skip: (req) => {
    // Пропускаем preflight запросы и логин (для него отдельный limiter)
    if (req.method === 'OPTIONS') return true;
    if (req.path === '/api/auth/login' || req.originalUrl === '/api/auth/login') return true;
    return false;
  },
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests, please try again later.'
});

// Более мягкий лимит для логина (чтобы избежать блокировки при ошибках ввода)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 100, // максимум 100 попыток входа за 15 минут (увеличено для избежания ложных срабатываний)
  skip: (req) => req.method === 'OPTIONS',
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many login attempts, please try again later.',
  keyGenerator: (req) => {
    // Используем IP адрес для идентификации пользователя
    return req.ip || req.connection.remoteAddress || req.socket.remoteAddress || 'unknown';
  },
  handler: (req, res) => {
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    console.warn(`[RateLimit] Too many login attempts from IP: ${ip}`);
    res.status(429).json({ 
      error: 'Too many login attempts, please try again later.',
      retryAfter: Math.ceil(15 * 60) // секунды до сброса
    });
  }
});

// Применяем loginLimiter ПЕРЕД общим limiter, чтобы он имел приоритет
app.use('/api/auth/login', loginLimiter);
app.use('/api/', limiter);

// Настройка multer для загрузки файлов
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (req, file, cb) => {
    const fileType = file.mimetype;
    if (ALLOWED_IMAGE_TYPES.includes(fileType) || 
        ALLOWED_VIDEO_TYPES.includes(fileType) || 
        ALLOWED_DOC_TYPES.includes(fileType)) {
      cb(null, true);
    } else {
      cb(new Error('Неподдерживаемый тип файла'));
    }
  }
});

// Хранение ботов по токенам
const bots = new Map(); // token -> bot instance

// Инициализация БД
initDatabase();

// Боты инициализируются динамически при использовании
// Больше не создаем бота по умолчанию из .env

// Функция для получения хэша токена (для имен файлов)
function getTokenHashSync(token) {
  return crypto.createHash('md5').update(token).digest('hex').substring(0, 8);
}

// Получить токен по хэшу
function getTokenByHash(hash) {
  const tokenData = dbGetTokenByHash(hash);
  return tokenData ? tokenData.token : null;
}

// Получить текущий бот из запроса
function getBotFromRequest(req) {
  const userId = req.session?.user?.id;
  const users = getUsers();
  const user = userId ? users.find(u => u.id === userId) : null;
  
  // Сначала проверяем, передан ли хэш токена
  const tokenHashOrToken = req.headers['x-bot-token'] || req.body.tokenHash || req.body.token;
  let token = null;
  
  if (tokenHashOrToken) {
    // Пробуем найти токен по хэшу
    token = getTokenByHash(tokenHashOrToken);
    
    if (!token) {
      // Если не нашли по хэшу, проверяем, может это полный токен
      if (tokenHashOrToken.includes(':')) {
        token = tokenHashOrToken;
      }
    }
    
    // Проверяем доступ к токену для обычных пользователей
    if (userId && token && user?.role !== 'admin') {
      const tokenId = token.includes(':') ? getTokenHashSync(token) : tokenHashOrToken;
      if (!canAccessToken(userId, tokenId)) {
        token = null; // Нет доступа к этому токену
      }
    }
  }
  
  // Если токен не найден, используем первый доступный токен пользователя
  if (!token && userId) {
    const userTokens = getUserTokens(userId);
    if (userTokens.length > 0) {
      const defaultToken = userTokens.find(t => t.isDefault) || userTokens[0];
      token = defaultToken.token;
    }
  }
  
  // Fallback для admin - используем токен по умолчанию
  if (!token && user?.role === 'admin') {
    const tokens = getTokens();
    const defaultToken = tokens.find(t => t.isDefault);
    token = defaultToken ? defaultToken.token : null;
  }
  
  if (!token) return null;
  
  if (!bots.has(token)) {
    try {
      // Увеличиваем таймауты для больших файлов
      bots.set(token, new TelegramBot(token, { 
        polling: false,
        request: {
          agentOptions: {
            keepAlive: true,
            keepAliveMsecs: 30000
          },
          timeout: 60000, // 60 секунд для больших файлов
          forever: true
        }
      }));
    } catch (error) {
      console.error('Error creating bot:', error);
      return null;
    }
  }
  
  return bots.get(token);
}

// Получить хэш токена из запроса
function getTokenHashFromRequest(req) {
  const tokenHashOrToken = req.headers['x-bot-token'] || req.body.tokenHash || req.body.token;
  const userId = req.session?.user?.id;
  
  if (tokenHashOrToken) {
    // Определяем tokenId (хэш или вычисляем)
    let tokenId;
    if (!tokenHashOrToken.includes(':') && tokenHashOrToken.length <= 32) {
      // Проверяем, есть ли токен с таким хэшем
      const token = getTokenByHash(tokenHashOrToken);
      if (token) {
        tokenId = getTokenHashSync(token);
      } else {
        // Если не нашли, возможно это уже хэш
        tokenId = tokenHashOrToken;
      }
    } else if (tokenHashOrToken.includes(':')) {
      // Если это полный токен, вычисляем хэш
      tokenId = getTokenHashSync(tokenHashOrToken);
    }
    
    // Проверяем доступ к токену, если есть пользователь
    if (userId && tokenId && !canAccessToken(userId, tokenId)) {
      // Если нет доступа, возвращаем первый доступный токен пользователя
      const userTokens = getUserTokens(userId);
      if (userTokens.length > 0) {
        const defaultToken = userTokens.find(t => t.isDefault) || userTokens[0];
        return getTokenHashSync(defaultToken.token);
      }
      return 'default';
    }
    
    if (tokenId) {
      return tokenId;
    }
  }
  
  // Если ничего не найдено, используем первый доступный токен пользователя
  if (userId) {
    const userTokens = getUserTokens(userId);
    if (userTokens.length > 0) {
      const defaultToken = userTokens.find(t => t.isDefault) || userTokens[0];
      return getTokenHashSync(defaultToken.token);
    }
  }
  
  // Fallback для старых токенов без userId (только для admin)
  if (userId) {
    const users = getUsers();
    const user = users.find(u => u.id === userId);
    if (user?.role === 'admin') {
      const tokens = getTokens();
      // Admin может видеть токены без userId
      const defaultToken = tokens.find(t => t.isDefault);
      if (defaultToken) {
        return getTokenHashSync(defaultToken.token);
      }
    }
    // Для обычных пользователей возвращаем 'default' если нет своих токенов
  }
  
  return 'default';
}

// Старые функции для работы с файлами больше не нужны - данные в БД

// Утилиты для работы с токенами
async function getBotInfo(token) {
  try {
    const bot = new TelegramBot(token, { polling: false });
    const me = await bot.getMe();
    
    // Пробуем получить фото профиля бота
    let avatarUrl = null;
    try {
      const photos = await bot.getUserProfilePhotos(me.id, { limit: 1 });
      if (photos.total_count > 0 && photos.photos && photos.photos.length > 0) {
        // Берем самое большое фото (последнее в массиве размеров)
        const photoSizes = photos.photos[0];
        if (photoSizes && photoSizes.length > 0) {
          const largestPhoto = photoSizes[photoSizes.length - 1];
          const file = await bot.getFile(largestPhoto.file_id);
          avatarUrl = `https://api.telegram.org/file/bot${token}/${file.file_path}`;
        }
      }
    } catch (photoError) {
      // Игнорируем ошибки получения фото (для ботов фото может быть недоступно)
      console.log(`[Tokens] Could not get bot photo for ${me.id}:`, photoError.message);
    }
    
    return {
      username: me.username || null,
      first_name: me.first_name || null,
      id: me.id,
      avatarUrl: avatarUrl
    };
  } catch (error) {
    console.error('[Tokens] Error getting bot info:', error);
    return null;
  }
}

// Функции getTokens и saveTokens теперь используют БД напрямую
// getTokens() - импортирована из db.js
// saveTokens() больше не нужна, используем createToken, updateToken, deleteToken

// Функции getUsers и saveUsers теперь используют БД напрямую
// getUsers() - импортирована из db.js
// saveUsers() больше не нужна, используем createUser, updateUser, deleteUser

// Создаем дефолтного пользователя при первом запуске, если БД пустая
const users = getUsers();
if (users.length === 0) {
  const defaultUser = {
    id: crypto.randomBytes(16).toString('hex'),
    username: 'admin',
    password: crypto.createHash('sha256').update('admin').digest('hex'), // пароль: admin
    name: 'Администратор',
    role: 'admin',
    createdAt: new Date().toISOString()
  };
  createUser(defaultUser);
  console.log('[DB] Created default admin user (username: admin, password: admin)');
}

// Middleware для проверки авторизации
function requireAuth(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  }
  return res.status(401).json({ error: 'Unauthorized' });
}

// Функции для проверки доступа к данным
function getUserTokens(userId) {
  const users = getUsers();
  const user = users.find(u => u.id === userId);
  
  if (!user) return [];
  
  const allTokens = getTokens();
  
  // Admin видит все токены (включая старые без userId)
  if (user.role === 'admin') {
    return allTokens;
  }
  
  // Assistant видит токены своего владельца (только с userId)
  if (user.role === 'assistant' && user.ownerId) {
    return allTokens.filter(t => t.userId && t.userId === user.ownerId);
  }
  
  // User видит только свои токены (строго с userId === userId, игнорируем токены без userId)
  return allTokens.filter(t => t.userId && t.userId === userId);
}

function canAccessToken(userId, tokenId) {
  const userTokens = getUserTokens(userId);
  return userTokens.some(t => getTokenHashSync(t.token) === tokenId);
}


// Утилиты для работы с файлами (с поддержкой токенов)
// Функции getChannels и saveChannels теперь используют БД
// getChannels() - импортирована из db.js
// saveChannels() больше не нужна, используем createChannel, updateChannel, deleteChannel

// Функции getPostsHistory и savePostsHistory теперь используют БД
// getPostsHistory() - импортирована из db.js
// savePostsHistory() - используем addPostsHistory из db.js (очистка происходит автоматически)

// Функции getTemplates и saveTemplates теперь используют БД
// getTemplates() - импортирована из db.js
// saveTemplates() больше не нужна, используем createTemplate, deleteTemplate

// Функции getScheduledPosts и saveScheduledPosts теперь используют БД
// getScheduledPosts() - импортирована из db.js
// saveScheduledPosts() больше не нужна, используем createScheduledPost, updateScheduledPost, deleteScheduledPost

// Функции getChannelGroups и saveChannelGroups теперь используют БД
// getChannelGroups() - импортирована из db.js
// saveChannelGroups() больше не нужна, используем createChannelGroup, deleteChannelGroup

// Функции getRecurringPosts и saveRecurringPosts теперь используют БД
// getRecurringPosts() - импортирована из db.js
// saveRecurringPosts() больше не нужна, используем createRecurringPost, updateRecurringPost, deleteRecurringPost

// Вычисляет следующую дату отправки для повторяющегося поста
function getNextScheduledDate(recurringPost) {
  const now = new Date();
  const time = recurringPost.time; // Формат "HH:MM"
  const [hours, minutes] = time.split(':').map(Number);
  
  let nextDate = new Date();
  nextDate.setHours(hours, minutes, 0, 0);
  
  if (recurringPost.recurrence === 'daily') {
    // Ежедневно - если время уже прошло сегодня, то завтра
    if (nextDate <= now) {
      nextDate.setDate(nextDate.getDate() + 1);
    }
  } else if (recurringPost.recurrence === 'weekly') {
    // Еженедельно - следующий день недели
    const targetDay = recurringPost.dayOfWeek || 1; // 0 = воскресенье, 1 = понедельник, ...
    const currentDay = now.getDay();
    let daysToAdd = targetDay - currentDay;
    
    if (daysToAdd < 0 || (daysToAdd === 0 && nextDate <= now)) {
      daysToAdd += 7; // Следующая неделя
    }
    
    nextDate.setDate(nextDate.getDate() + daysToAdd);
  }
  
  return nextDate;
}

// Функции logAction и getLogs теперь используют БД
// logAction() - используем addLog из db.js
// getLogs() - импортирована из db.js
function logAction(action, data, tokenHash = 'default') {
  try {
    addLog(tokenHash, action, data);
  } catch (error) {
    console.error('Error logging action:', error);
  }
}

// Оптимизация изображения
async function optimizeImage(inputPath, outputPath) {
  try {
    await sharp(inputPath)
      .resize(1920, 1920, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toFile(outputPath);
    return outputPath;
  } catch (error) {
    console.error('Error optimizing image:', error);
    return inputPath; // Возвращаем оригинал при ошибке
  }
}

// Отправка с retry
async function sendWithRetry(sendFn, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await sendFn();
    } catch (error) {
      // Для socket hang up увеличиваем количество попыток и задержку
      const isSocketError = error.message && (
        error.message.includes('socket hang up') || 
        error.message.includes('ECONNRESET') ||
        error.code === 'EFATAL'
      );
      
      if (i === maxRetries - 1) throw error;
      
      // Для socket ошибок делаем более длинную задержку
      const delay = isSocketError 
        ? 2000 * (i + 1) // 2, 4, 6 секунд для socket ошибок
        : 1000 * (i + 1); // 1, 2, 3 секунды для остальных
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

function normalizeButtons(buttonsRaw) {
  if (!buttonsRaw) return [];
  
  let parsed = buttonsRaw;
  if (typeof buttonsRaw === 'string') {
    try {
      parsed = JSON.parse(buttonsRaw);
    } catch {
      return [];
    }
  }
  
  // Допустимые форматы:
  // 1) [[{text,url}]]  (inline_keyboard)
  // 2) [{text,url}]    (плоский список) -> превратим в [[{...}], ...]
  if (!Array.isArray(parsed)) return [];
  
  const isRowArray = parsed.length > 0 && Array.isArray(parsed[0]);
  const rows = isRowArray ? parsed : parsed.map(b => [b]);
  
  // Фильтруем некорректные кнопки
  const cleaned = rows
    .map(row => (Array.isArray(row) ? row : []).filter(btn => btn && typeof btn === 'object' && btn.text && btn.url))
    .filter(row => row.length > 0);
  
  return cleaned;
}

function removeChannelIdFromArray(arr, channelId) {
  if (!Array.isArray(arr) || !channelId) return [];
  return arr.filter(id => id !== channelId);
}

// API Routes

// Авторизация
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  try {
    const users = getUsers();
    const passwordHash = crypto.createHash('sha256').update(password).digest('hex');
    const user = users.find(u => u.username === username && u.password === passwordHash);
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Сохраняем пользователя в сессии
    req.session.user = {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role
    };


    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role
      }
    });
  } catch (error) {
    console.error('[Auth] Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Logout failed' });
    }
    res.json({ success: true });
  });
});

app.get('/api/auth/me', (req, res) => {
  try {
    if (req.session && req.session.user) {
      res.json({ user: req.session.user });
    } else {
      res.status(401).json({ error: 'Not authenticated' });
    }
  } catch (error) {
    console.error('[Auth] Error in /api/auth/me:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Управление пользователями
app.get('/api/users', requireAuth, (req, res) => {
  const currentUser = req.session.user;
  const users = getUsers();
  
  let safeUsers;
  
  // Admin видит всех пользователей
  if (currentUser.role === 'admin') {
    safeUsers = users.map(u => ({
      id: u.id,
      username: u.username,
      name: u.name,
      role: u.role,
      ownerId: u.ownerId,
      createdAt: u.createdAt
    }));
  } 
  // User видит только своих помощников
  else if (currentUser.role === 'user') {
    safeUsers = users
      .filter(u => u.role === 'assistant' && u.ownerId === currentUser.id)
      .map(u => ({
        id: u.id,
        username: u.username,
        name: u.name,
        role: u.role,
        ownerId: u.ownerId,
        createdAt: u.createdAt
      }));
  }
  // Assistant не видит других пользователей
  else {
    safeUsers = [];
  }
  
  res.json(safeUsers);
});

app.post('/api/users', requireAuth, (req, res) => {
  const currentUser = req.session.user;
  const { username, password, name, role, ownerId } = req.body;
  
  // Admin может создавать любых пользователей
  // User может создавать только помощников (assistant)
  if (currentUser.role === 'user') {
    if (role !== 'assistant' || ownerId !== currentUser.id) {
      return res.status(403).json({ error: 'Users can only create assistants for themselves' });
    }
  } else if (currentUser.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  
  if (!username || !password || !name) {
    return res.status(400).json({ error: 'Username, password and name are required' });
  }

  // Для assistant требуется ownerId
  if (role === 'assistant' && !ownerId) {
    return res.status(400).json({ error: 'ownerId is required for assistant role' });
  }

  try {
    const users = getUsers();
    
    if (users.find(u => u.username === username)) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    const passwordHash = crypto.createHash('sha256').update(password).digest('hex');
    const newUser = {
      id: crypto.randomBytes(16).toString('hex'),
      username,
      password: passwordHash,
      name,
      role: role || 'user',
      ownerId: role === 'assistant' ? ownerId : undefined,
      createdAt: new Date().toISOString()
    };

    createUser(newUser);

    res.json({
      success: true,
      user: {
        id: newUser.id,
        username: newUser.username,
        name: newUser.name,
        role: newUser.role,
        ownerId: newUser.ownerId
      }
    });
  } catch (error) {
    console.error('[Users] Create error:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

app.delete('/api/users/:id', requireAuth, (req, res) => {
  const currentUser = req.session.user;
  const { id } = req.params;
  
  if (id === currentUser.id) {
    return res.status(400).json({ error: 'Cannot delete yourself' });
  }

  try {
    const users = getUsers();
    const userToDelete = users.find(u => u.id === id);
    if (!userToDelete) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Admin может удалять всех
    // User может удалять только своих помощников
    if (currentUser.role === 'user') {
      if (userToDelete.role !== 'assistant' || userToDelete.ownerId !== currentUser.id) {
        return res.status(403).json({ error: 'You can only delete your own assistants' });
      }
    } else if (currentUser.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    
    deleteUser(id);
    res.json({ success: true });
  } catch (error) {
    console.error('[Users] Delete error:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// Изменение пароля
app.post('/api/users/change-password', requireAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current password and new password are required' });
  }

  if (newPassword.length < 4) {
    return res.status(400).json({ error: 'New password must be at least 4 characters' });
  }

  try {
    const users = getUsers();
    const user = users.find(u => u.id === req.session.user.id);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const currentPasswordHash = crypto.createHash('sha256').update(currentPassword).digest('hex');
    
    if (user.password !== currentPasswordHash) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const newPasswordHash = crypto.createHash('sha256').update(newPassword).digest('hex');
    updateUser(user.id, { password: newPasswordHash });
    res.json({ success: true });
  } catch (error) {
    console.error('[Users] Change password error:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

// Управление токенами
app.get('/api/tokens', requireAuth, async (req, res) => {
  const userId = req.session.user.id;
  const users = getUsers();
  const user = users.find(u => u.id === userId);
  const userTokens = getUserTokens(userId);
  const allTokens = getTokens();
  const isAdmin = user?.role === 'admin';
  
  // Для админа обновляем username для всех токенов, для обычных пользователей - только для своих
  const tokensToUpdate = isAdmin ? allTokens : userTokens;
  
  // Обновляем username для токенов, у которых его нет
  // Добавляем задержку между запросами, чтобы избежать rate limiting
  const updatedTokens = [];
  for (let i = 0; i < tokensToUpdate.length; i++) {
    const t = tokensToUpdate[i];
    if (!t.username && t.token) {
      try {
        // Добавляем задержку между запросами (100ms)
        if (i > 0) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        const botInfo = await getBotInfo(t.token);
        if (botInfo && botInfo.username) {
          t.username = botInfo.username;
          // Обновляем имя, если оно было дефолтным
          if (!t.name || t.name === 'Основной бот') {
            t.name = botInfo.first_name || botInfo.username || t.name;
          }
          // Обновляем фото, если оно получено
          if (botInfo.avatarUrl) {
            updateToken(t.token, { avatarUrl: botInfo.avatarUrl });
          }
        }
      } catch (error) {
        // Игнорируем ошибки при получении информации о боте (rate limiting и т.д.)
        console.error(`[Tokens] Error getting bot info for token ${getTokenHashSync(t.token)}:`, error.message);
      }
    }
    updatedTokens.push(t);
  }
  
  // Сохраняем обновленные токены, если были изменения
  const hasChanges = updatedTokens.some((t) => {
    const originalToken = allTokens.find(ot => ot.token === t.token);
    return originalToken && (t.username !== originalToken?.username || t.name !== originalToken?.name);
  });
  if (hasChanges) {
    // Обновляем токены в БД
    updatedTokens.forEach(updatedToken => {
      if (updatedToken.token) {
        updateToken(updatedToken.token, {
          name: updatedToken.name,
          username: updatedToken.username
        });
      }
    });
  }
  
  // Не возвращаем полные токены для безопасности, только метаданные
  // Важно: для обычных пользователей возвращаем только их токены
  const tokensToReturn = isAdmin ? updatedTokens : userTokens;
  
  const safeTokens = tokensToReturn.map(t => {
    // Для обычных пользователей дополнительно проверяем доступ
    if (!isAdmin && t.userId !== userId) {
      return null; // Пропускаем токены других пользователей
    }
    
    // Пропускаем токены без userId для обычных пользователей
    if (!isAdmin && !t.userId) {
      return null;
    }
    
    const tokenData = {
      id: getTokenHashSync(t.token),
      name: t.name,
      createdAt: t.createdAt,
      isDefault: t.isDefault,
      username: t.username || null,
      avatarUrl: t.avatarUrl || null
    };
    
    // Для админа добавляем информацию о владельце
    if (isAdmin && t.userId) {
      const owner = users.find(u => u.id === t.userId);
      if (owner) {
        tokenData.owner = {
          id: owner.id,
          username: owner.username,
          name: owner.name || owner.username
        };
      }
    } else if (isAdmin && !t.userId) {
      // Токены без userId (старые токены)
      tokenData.owner = null;
    }
    
    return tokenData;
  }).filter(t => t !== null); // Удаляем null значения
  
  res.json(safeTokens);
});

// Получить информацию о боте по токену (без сохранения)
app.post('/api/tokens/validate', requireAuth, async (req, res) => {
  const { token } = req.body;
  
  if (!token) {
    return res.status(400).json({ error: 'Token is required' });
  }

  try {
    // Проверяем токен, создавая бота
    const testBot = new TelegramBot(token, { polling: false });
    const me = await testBot.getMe();
    
    // Используем first_name или username как название по умолчанию
    const defaultName = me.first_name || me.username || `Бот ${me.id}`;
    
    // Пробуем получить фото профиля бота
    let avatarUrl = null;
    try {
      const photos = await testBot.getUserProfilePhotos(me.id, { limit: 1 });
      if (photos.total_count > 0 && photos.photos && photos.photos.length > 0) {
        // Берем самое большое фото (последнее в массиве размеров)
        const photoSizes = photos.photos[0];
        if (photoSizes && photoSizes.length > 0) {
          const largestPhoto = photoSizes[photoSizes.length - 1];
          const file = await testBot.getFile(largestPhoto.file_id);
          avatarUrl = `https://api.telegram.org/file/bot${token}/${file.file_path}`;
        }
      }
    } catch (photoError) {
      // Игнорируем ошибки получения фото (для ботов фото может быть недоступно)
      console.log(`[Tokens] Could not get bot photo for ${me.id}:`, photoError.message);
    }
    
    res.json({ 
      success: true,
      botInfo: {
        id: me.id,
        username: me.username,
        first_name: me.first_name,
        defaultName: defaultName,
        avatarUrl: avatarUrl
      }
    });
  } catch (error) {
    console.error('Error validating token:', error);
    res.status(400).json({ error: 'Invalid token: ' + error.message });
  }
});

app.post('/api/tokens', requireAuth, async (req, res) => {
  const { token, name } = req.body;
  const userId = req.session.user.id;
  const users = getUsers();
  const user = users.find(u => u.id === userId);
  
  // Только admin и user могут добавлять токены, assistant не может
  if (user?.role === 'assistant') {
    return res.status(403).json({ error: 'Assistants cannot add tokens' });
  }
  
  if (!token) {
    return res.status(400).json({ error: 'Token is required' });
  }

  try {
    // Проверяем токен, создавая бота
    const testBot = new TelegramBot(token, { polling: false });
    const me = await testBot.getMe();
    
    const tokens = getTokens();
    
    // Проверяем, не добавлен ли уже токен у текущего пользователя
    const userTokens = getUserTokens(userId);
    if (userTokens.find(t => t.token === token)) {
      return res.status(400).json({ error: 'Token already exists' });
    }
    
    // Если название не указано, используем first_name или username
    const botName = name || me.first_name || me.username || `Бот ${me.id}`;
    
    // Пробуем получить фото профиля бота
    let avatarUrl = null;
    try {
      const photos = await testBot.getUserProfilePhotos(me.id, { limit: 1 });
      if (photos.total_count > 0 && photos.photos && photos.photos.length > 0) {
        // Берем самое большое фото (последнее в массиве размеров)
        const photoSizes = photos.photos[0];
        if (photoSizes && photoSizes.length > 0) {
          const largestPhoto = photoSizes[photoSizes.length - 1];
          const file = await testBot.getFile(largestPhoto.file_id);
          avatarUrl = `https://api.telegram.org/file/bot${token}/${file.file_path}`;
        }
      }
    } catch (photoError) {
      // Игнорируем ошибки получения фото (для ботов фото может быть недоступно)
      console.log(`[Tokens] Could not get bot photo for ${me.id}:`, photoError.message);
    }
    
    const isDefault = userTokens.length === 0; // Первый токен пользователя становится дефолтным
    
    const tokenData = {
      token,
      name: botName,
      username: me.username,
      userId: userId, // Привязываем токен к пользователю
      createdAt: new Date().toISOString(),
      isDefault: isDefault,
      avatarUrl: avatarUrl
    };
    
    createToken(tokenData);
    bots.set(token, testBot);
    logAction('token_added', { name: botName, username: me.username }, getTokenHashSync(token));
    
    res.json({ 
      success: true, 
      token: {
        id: getTokenHashSync(token),
        name: botName,
        username: me.username,
        createdAt: tokens[tokens.length - 1]?.createdAt || new Date().toISOString(),
        isDefault: isDefault,
        avatarUrl: avatarUrl
      }
    });
  } catch (error) {
    console.error('Error adding token:', error);
    res.status(400).json({ error: 'Invalid token: ' + error.message });
  }
});

app.delete('/api/tokens/:id', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.session.user.id;
    const users = getUsers();
    const user = users.find(u => u.id === userId);
    const isAdmin = user?.role === 'admin';
    
    const tokens = getTokens();
    const token = tokens.find(t => getTokenHashSync(t.token) === id);
    
    if (!token) {
      return res.status(404).json({ error: 'Token not found' });
    }
    
    // Проверяем доступ к токену для обычных пользователей
    if (!isAdmin) {
      const userTokens = getUserTokens(userId);
      const userToken = userTokens.find(t => getTokenHashSync(t.token) === id);
      if (!userToken) {
        return res.status(403).json({ error: 'Access denied' });
      }
      
      // Обычные пользователи не могут удалить последний токен
      if (userTokens.length === 1) {
        return res.status(400).json({ error: 'Cannot delete the last token' });
      }
    }
    
    // Админ может удалить все токены
    
    const tokenHash = getTokenHashSync(token.token);
    
    // Удаляем связанные данные бота из БД
    try {
      // Удаляем все данные, связанные с этим токеном
      const channels = getChannels(tokenHash);
      channels.forEach(ch => deleteChannel(ch.id));
      
      deleteAllPostsHistory(tokenHash);
      
      const templates = getTemplates(tokenHash);
      templates.forEach(t => deleteTemplate(t.id));
      
      const scheduled = getScheduledPosts(tokenHash);
      scheduled.forEach(p => deleteScheduledPost(p.id));
      
      const recurring = getRecurringPosts(tokenHash);
      recurring.forEach(p => deleteRecurringPost(p.id));
      
      const groups = getChannelGroups(tokenHash);
      groups.forEach(g => deleteChannelGroup(g.id));
      
      // Логи удалять не нужно - они могут быть полезны для аудита
    } catch (error) {
      console.error(`[API] Error deleting data for token ${tokenHash}:`, error);
      // Продолжаем удаление токена даже если не удалось удалить данные
    }
    
    // Фильтруем токены, оставляя все кроме удаляемого
    const filtered = tokens.filter(t => {
      const tHash = getTokenHashSync(t.token);
      return tHash !== id;
    });
    
    // Удаляем токен из БД
    deleteToken(token.token);
    
    // Если удаляемый токен был по умолчанию, назначаем первый оставшийся
    const remainingTokens = getTokens();
    if (token.isDefault && remainingTokens.length > 0) {
      const firstToken = remainingTokens[0];
      updateToken(firstToken.token, { isDefault: true });
    }
    bots.delete(token.token);
    logAction('token_deleted', { name: token.name, tokenHash }, id);
    
    res.json({ success: true });
  } catch (error) {
    console.error('[API] Error in delete token:', error);
    res.status(500).json({ error: error.message || 'Failed to delete token' });
  }
});

app.put('/api/tokens/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  const { name } = req.body;
  const tokens = getTokens();
  const token = tokens.find(t => getTokenHashSync(t.token) === id);
  
  if (!token) {
    return res.status(404).json({ error: 'Token not found' });
  }
  
  if (name) {
    updateToken(token.token, { name });
    logAction('token_updated', { name }, id);
  }
  
  const updatedToken = getTokenByToken(token.token);
  res.json({ success: true, token: updatedToken });
});

// Получить список каналов
app.get('/api/channels', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const users = getUsers();
    const user = users.find(u => u.id === userId);
    let tokenHash = getTokenHashFromRequest(req);
    
    // Если tokenHash = 'default' и у пользователя нет токенов, возвращаем пустой список
    if (tokenHash === 'default' && user?.role !== 'admin') {
      const userTokens = getUserTokens(userId);
      if (userTokens.length === 0) {
        return res.json([]);
      }
      // Если есть токены, используем первый доступный
      const defaultToken = userTokens.find(t => t.isDefault) || userTokens[0];
      tokenHash = getTokenHashSync(defaultToken.token);
    }
    
    // Проверяем доступ к токену
    if (tokenHash && tokenHash !== 'default') {
      // Для admin разрешаем доступ к токенам без userId
      if (user?.role !== 'admin' && !canAccessToken(userId, tokenHash)) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }
    
    const bot = getBotFromRequest(req);
    const channels = getChannels(tokenHash);
    
    // Для админа получаем информацию о владельце бота
    let ownerInfo = null;
    if (user?.role === 'admin' && tokenHash && tokenHash !== 'default') {
      const tokens = getTokens();
      const tokenData = tokens.find(t => getTokenHashSync(t.token) === tokenHash);
      if (tokenData && tokenData.userId) {
        const owner = users.find(u => u.id === tokenData.userId);
        if (owner) {
          ownerInfo = {
            id: owner.id,
            username: owner.username,
            name: owner.name || owner.username
          };
        }
      }
    }
    
    // Если запрошены аватарки, получаем их
    if (req.query.includeAvatars === 'true' && bot) {
    // Обрабатываем каналы последовательно с задержкой, чтобы избежать rate limiting
    const channelsWithAvatars = [];
    for (let i = 0; i < channels.length; i++) {
      const channel = channels[i];
      // Добавляем задержку между запросами (50ms)
      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      
      try {
        const chat = await bot.getChat(channel.id);
        let avatarUrl = null;
        
        if (chat.photo) {
          // Получаем file_id самого большого фото (big_file_id для лучшего качества)
          const fileId = chat.photo.big_file_id || chat.photo.small_file_id;
          if (fileId) {
            try {
              const file = await bot.getFile(fileId);
              // Получаем токен для формирования URL
              const tokenHashOrToken = req.headers['x-bot-token'] || req.body.tokenHash || req.body.token;
              let token = null;
              
              if (tokenHashOrToken) {
                if (tokenHashOrToken.includes(':')) {
                  token = tokenHashOrToken;
                } else {
                  token = getTokenByHash(tokenHashOrToken);
                }
              }
              
              if (!token) {
                const tokens = getTokens();
                const defaultToken = tokens.find(t => t.isDefault);
                token = defaultToken ? defaultToken.token : null;
              }
              
              if (token) {
                avatarUrl = `https://api.telegram.org/file/bot${token}/${file.file_path}`;
              }
            } catch (error) {
              console.error(`[API] Error getting avatar file for ${channel.id}:`, error.message);
            }
          }
        }
        
        const channelData = {
          ...channel,
          avatarUrl
        };
        
        // Для админа добавляем информацию о владельце
        if (user?.role === 'admin' && ownerInfo) {
          channelData.owner = ownerInfo;
        }
        
        channelsWithAvatars.push(channelData);
      } catch (error) {
        // Если не удалось получить информацию о чате, возвращаем канал без аватарки
        // Игнорируем ошибки rate limiting (429)
        if (error.response?.statusCode !== 429) {
          console.error(`[API] Error getting chat info for ${channel.id}:`, error.message);
        }
        const channelData = { ...channel };
        if (user?.role === 'admin' && ownerInfo) {
          channelData.owner = ownerInfo;
        }
        channelsWithAvatars.push(channelData);
      }
    }
    
      return res.json(channelsWithAvatars);
    }
    
    // Для админа добавляем информацию о владельце к каждому каналу
    const channelsWithOwner = user?.role === 'admin' && ownerInfo
      ? channels.map(channel => ({ ...channel, owner: ownerInfo }))
      : channels;
    
    res.json(channelsWithOwner);
  } catch (error) {
    console.error('[API] Error fetching channels:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch channels' });
  }
});

// Экспорт каналов
app.get('/api/channels/export', requireAuth, (req, res) => {
  const tokenHash = getTokenHashFromRequest(req);
  const channels = getChannels(tokenHash);
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', 'attachment; filename=channels.json');
  res.json(channels);
});

// Импорт каналов
app.post('/api/channels/import', requireAuth, async (req, res) => {
  const { channels } = req.body;
  const tokenHash = getTokenHashFromRequest(req);
  const bot = getBotFromRequest(req);
  
  if (!Array.isArray(channels)) {
    return res.status(400).json({ error: 'Invalid channels format' });
  }

  if (!bot) {
    return res.status(500).json({ error: 'Telegram bot not initialized' });
  }

  try {
    const me = await bot.getMe();
    const validChannels = [];
    const errors = [];

    for (const channel of channels) {
      try {
        const chatMember = await bot.getChatMember(channel.id, me.id);
        if (chatMember.status === 'administrator' || chatMember.status === 'creator') {
          validChannels.push(channel);
        } else {
          errors.push(`Bot is not admin in ${channel.id}`);
        }
      } catch (error) {
        errors.push(`Error checking ${channel.id}: ${error.message}`);
      }
    }

    const existingChannels = getChannels(tokenHash);
    const merged = [...existingChannels];
    
    for (const channel of validChannels) {
      if (!merged.find(c => c.id === channel.id)) {
        createChannel({
          ...channel,
          tokenHash,
          createdAt: new Date().toISOString()
        });
      }
    }
    logAction('channels_imported', { count: validChannels.length, errors }, tokenHash);

    res.json({ success: true, imported: validChannels.length, errors });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Получить информацию о канале
app.get('/api/channels/get-info/:channelId', requireAuth, async (req, res) => {
  let { channelId } = req.params;
  
  // Декодируем URL-encoded символы
  channelId = decodeURIComponent(channelId);
  
  // Убираем @ если есть
  if (channelId.startsWith('@')) {
    channelId = channelId.substring(1);
  }
  
  const tokenHash = getTokenHashFromRequest(req);
  const bot = getBotFromRequest(req);
  
  if (!bot) {
    return res.status(500).json({ error: 'Telegram bot not initialized' });
  }

  try {
    // Пробуем получить информацию о чате
    // Если channelId начинается с буквы, добавляем @ для username
    const chatId = channelId.startsWith('-') ? channelId : `@${channelId}`;
    
    const chat = await bot.getChat(chatId);
    const me = await bot.getMe();
    
    // Пробуем проверить права бота
    let isAdmin = false;
    try {
      const chatMember = await bot.getChatMember(chatId, me.id);
      isAdmin = chatMember.status === 'administrator' || chatMember.status === 'creator';
    } catch (memberError) {
      // Если список участников недоступен, пробуем проверить права через тестовую отправку
      if (memberError.response?.body?.description?.includes('member list is inaccessible')) {
        console.log(`[API] Member list inaccessible for ${chatId}, trying test message to verify permissions`);
        try {
          // Пробуем отправить тестовое сообщение (которое сразу удалим)
          // Это реальная проверка прав бота
          const testMessage = await bot.sendMessage(chatId, '🔍', { 
            disable_notification: true,
            disable_web_page_preview: true
          });
          
          // Если сообщение отправлено успешно, удаляем его
          try {
            await bot.deleteMessage(chatId, testMessage.message_id);
            console.log(`[API] Test message sent and deleted successfully for ${chatId}`);
            isAdmin = true; // Бот может отправлять сообщения, значит имеет права
          } catch (deleteError) {
            // Если не удалось удалить, но сообщение отправлено - все равно считаем успехом
            console.log(`[API] Test message sent but could not be deleted for ${chatId}:`, deleteError.message);
            isAdmin = true;
          }
        } catch (sendError) {
          // Если не удалось отправить сообщение, бот не имеет прав
          console.error(`[API] Cannot send test message to ${chatId}:`, sendError.message);
          const errorDesc = sendError.response?.body?.description || sendError.message;
          if (errorDesc.includes('not a member') || errorDesc.includes('chat not found')) {
            return res.status(403).json({ 
              error: 'Bot is not a member of the channel. Please add the bot as an administrator first.' 
            });
          }
          return res.status(403).json({ 
            error: `Cannot verify bot permissions: ${errorDesc}` 
          });
        }
      } else {
        // Другие ошибки пробрасываем дальше
        throw memberError;
      }
    }
    
    if (!isAdmin) {
      return res.status(403).json({ error: 'Bot must be an administrator of the channel' });
    }

    res.json({ 
      success: true, 
      name: chat.title || chat.username || `Channel ${channelId}`,
      username: chat.username || null,
      type: chat.type,
      id: chat.id ? String(chat.id) : chatId
    });
  } catch (error) {
    console.error('[API] Error getting channel info:', error);
    console.error('[API] Channel ID:', channelId);
    console.error('[API] Error details:', {
      code: error.code,
      response: error.response?.body,
      message: error.message
    });
    
    // Более детальные сообщения об ошибках
    let errorMessage = 'Failed to get channel info';
    if (error.response?.body?.description) {
      errorMessage = error.response.body.description;
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    res.status(500).json({ error: errorMessage });
  }
});

// Добавить канал
app.post('/api/channels', requireAuth, async (req, res) => {
  let { channelId, channelName, tags } = req.body;
  const tokenHash = getTokenHashFromRequest(req);
  const bot = getBotFromRequest(req);
  
  if (!channelId) {
    return res.status(400).json({ error: 'Channel ID is required' });
  }

  // Нормализуем channelId: убираем @ если есть
  if (channelId.startsWith('@')) {
    channelId = channelId.substring(1);
  }

  if (!bot) {
    return res.status(500).json({ error: 'Telegram bot not initialized' });
  }

  try {
    const me = await bot.getMe();
    // Если channelId начинается с цифры или минуса, используем как есть, иначе добавляем @
    const chatId = channelId.startsWith('-') ? channelId : `@${channelId}`;
    
    const chat = await bot.getChat(chatId);
    
    // Пробуем проверить права бота
    let isAdmin = false;
    try {
      const chatMember = await bot.getChatMember(chatId, me.id);
      isAdmin = chatMember.status === 'administrator' || chatMember.status === 'creator';
    } catch (memberError) {
      // Если список участников недоступен, пробуем проверить права через тестовую отправку
      if (memberError.response?.body?.description?.includes('member list is inaccessible')) {
        console.log(`[API] Member list inaccessible for ${chatId}, trying test message to verify permissions`);
        try {
          // Пробуем отправить тестовое сообщение (которое сразу удалим)
          // Это реальная проверка прав бота
          const testMessage = await bot.sendMessage(chatId, '🔍', { 
            disable_notification: true,
            disable_web_page_preview: true
          });
          
          // Если сообщение отправлено успешно, удаляем его
          try {
            await bot.deleteMessage(chatId, testMessage.message_id);
            console.log(`[API] Test message sent and deleted successfully for ${chatId}`);
            isAdmin = true; // Бот может отправлять сообщения, значит имеет права
          } catch (deleteError) {
            // Если не удалось удалить, но сообщение отправлено - все равно считаем успехом
            console.log(`[API] Test message sent but could not be deleted for ${chatId}:`, deleteError.message);
            isAdmin = true;
          }
        } catch (sendError) {
          // Если не удалось отправить сообщение, бот не имеет прав
          console.error(`[API] Cannot send test message to ${chatId}:`, sendError.message);
          const errorDesc = sendError.response?.body?.description || sendError.message;
          if (errorDesc.includes('not a member') || errorDesc.includes('chat not found')) {
            return res.status(403).json({ 
              error: 'Bot is not a member of the channel. Please add the bot as an administrator first.' 
            });
          }
          return res.status(403).json({ 
            error: `Cannot verify bot permissions: ${errorDesc}` 
          });
        }
      } else {
        // Другие ошибки пробрасываем дальше
        throw memberError;
      }
    }
    
    if (!isAdmin) {
      return res.status(403).json({ error: 'Bot must be an administrator of the channel' });
    }

    // Если название не указано, берем из чата
    const finalChannelName = channelName || chat.title || chat.username || `Channel ${channelId}`;
    
    // Используем ID чата из ответа API или нормализованный channelId
    const finalChannelId = chat.id ? String(chat.id) : (chat.username ? `@${chat.username}` : channelId);

    const channels = getChannels(tokenHash);
    
    if (channels.find(c => c.id === finalChannelId || c.id === channelId)) {
      return res.status(400).json({ error: 'Channel already exists' });
    }

    createChannel({
      id: finalChannelId,
      name: finalChannelName,
      tags: tags || [],
      tokenHash,
      createdAt: new Date().toISOString()
    });
    logAction('channel_added', { channelId, channelName: finalChannelName }, tokenHash);

    res.json({ success: true, channels });
  } catch (error) {
    console.error('Error adding channel:', error);
    res.status(500).json({ error: error.message || 'Failed to add channel' });
  }
});

// Обновить канал
app.put('/api/channels/:channelId', requireAuth, (req, res) => {
  const { channelId } = req.params;
  const { name, tags } = req.body;
  const tokenHash = getTokenHashFromRequest(req);
  const channels = getChannels(tokenHash);
  const index = channels.findIndex(c => c.id === channelId);
  
  if (index === -1) {
    return res.status(404).json({ error: 'Channel not found' });
  }

  if (name || tags) {
    updateChannel(channelId, { name, tags });
  }
  logAction('channel_updated', { channelId }, tokenHash);
  res.json({ success: true, channel: channels[index] });
});

// Удалить канал
app.delete('/api/channels/:channelId', requireAuth, (req, res) => {
  const { channelId } = req.params;
  const decodedChannelId = decodeURIComponent(channelId);
  const tokenHash = getTokenHashFromRequest(req);
  const channel = getChannelById(decodedChannelId);
  
  if (!channel || channel.tokenHash !== tokenHash) {
    return res.status(404).json({ error: 'Channel not found' });
  }

  deleteChannel(decodedChannelId);
  logAction('channel_deleted', { channelId: decodedChannelId }, tokenHash);
  
  // Чистим ссылку на канал из групп/запланированных/повторяющихся постов,
  // чтобы он не "подтягивался" обратно и не ломал отправку
  try {
    const groups = getChannelGroups(tokenHash);
    for (const group of groups) {
      const channelIds = Array.isArray(group.channels) ? group.channels : (group.channelIds || []);
      const next = removeChannelIdFromArray(channelIds, decodedChannelId);
      if (next.length !== channelIds.length) {
        updateChannelGroup(group.id, { channels: next });
      }
    }
    
    const scheduled = getScheduledPosts(tokenHash);
    for (const post of scheduled) {
      const channelIds = Array.isArray(post.channels) ? post.channels : (post.channelIds || []);
      const next = removeChannelIdFromArray(channelIds, decodedChannelId);
      if (next.length !== channelIds.length) {
        updateScheduledPost(post.id, { channels: next });
      }
    }
    
    const recurring = getRecurringPosts(tokenHash);
    for (const post of recurring) {
      const channelIds = Array.isArray(post.channels) ? post.channels : (post.channelIds || []);
      const next = removeChannelIdFromArray(channelIds, decodedChannelId);
      if (next.length !== channelIds.length) {
        updateRecurringPost(post.id, { channels: next });
      }
    }
  } catch (e) {
    console.error('[API] Error cleaning references after channel delete:', e);
  }
  
  const channels = getChannels(tokenHash);
  res.json({ success: true, channels });
});

// Отправить пост (улучшенная версия с поддержкой множественных файлов)
app.post('/api/send-post', requireAuth, upload.array('files', MAX_IMAGES), async (req, res) => {
  const { text, channelIds, parseMode, buttons, scheduledAt } = req.body;
  const tokenHash = getTokenHashFromRequest(req);
  const bot = getBotFromRequest(req);
  const user = req.session.user; // Информация о пользователе
  
  if (!text || !channelIds) {
    return res.status(400).json({ error: 'Text and channel IDs are required' });
  }

  if (!bot) {
    return res.status(500).json({ error: 'Telegram bot not initialized' });
  }

  // Если указано время отправки, сохраняем как запланированный пост
  if (scheduledAt && scheduledAt.trim()) {
    const scheduledDate = new Date(scheduledAt);
    const now = new Date();
    
    if (isNaN(scheduledDate.getTime())) {
      return res.status(400).json({ error: 'Invalid scheduled date format' });
    }
    
    if (scheduledDate > now) {
      const scheduledPosts = getScheduledPosts(tokenHash);
      
      // Сохраняем абсолютные пути к файлам для запланированных постов
      const filesData = req.files ? req.files.map(f => {
        // Формируем абсолютный путь
        // f.path уже содержит 'uploads/filename', __dirname это 'server/'
        // Поэтому path.join(__dirname, '..', f.path) даст правильный путь
        let absolutePath;
        if (path.isAbsolute(f.path)) {
          absolutePath = f.path;
        } else {
          // Если путь относительный, делаем его относительно корня проекта
          absolutePath = path.resolve(__dirname, '..', f.path);
        }
        
        // Проверяем, что файл существует
        if (!fs.existsSync(absolutePath)) {
          console.warn(`[API] Warning: File not found when scheduling: ${absolutePath}, original path: ${f.path}`);
        }
        
        return { 
          path: absolutePath, 
          mimetype: f.mimetype,
          originalname: f.originalname
        };
      }) : [];
      
      const parsedChannelIds = JSON.parse(channelIds);
      
      const postData = {
        id: Date.now().toString(),
        text,
        channels: parsedChannelIds, // Используем channels вместо channelIds для БД
        files: filesData,
        parseMode,
        buttons: normalizeButtons(buttons),
        scheduledTime: scheduledDate.toISOString(), // Используем scheduledTime для БД
        scheduledAt: scheduledDate.toISOString(), // Оставляем для ответа
        createdAt: new Date().toISOString(),
        userId: user ? user.id : null
      };
      
      try {
        createScheduledPost({
          ...postData,
          tokenHash
        });
      } catch (dbError) {
        console.error('[API] Error creating scheduled post:', dbError);
        // Удаляем файлы при ошибке БД
        if (req.files) {
          req.files.forEach(file => {
            try {
              if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
            } catch (e) {}
          });
        }
        return res.status(500).json({ error: 'Failed to create scheduled post: ' + dbError.message });
      }
      logAction('post_scheduled', { 
        postId: postData.id, 
        scheduledAt: postData.scheduledAt,
        channelIds: parsedChannelIds,
        filesCount: filesData.length
      });
      
      
      // НЕ удаляем файлы здесь - они будут удалены после отправки планировщиком
      // Важно: файлы должны оставаться до отправки планировщиком
      return res.json({ success: true, scheduled: true, scheduledAt: postData.scheduledAt, postId: postData.id });
    } else {
      // Если время уже прошло, удаляем файлы и возвращаем ошибку
      if (req.files) {
        req.files.forEach(file => {
          try {
            if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
          } catch (e) {}
        });
      }
      return res.status(400).json({ error: 'Scheduled time must be in the future' });
    }
  }

  const channels = JSON.parse(channelIds);
  const results = [];
  const files = req.files || [];
  const historyEntries = [];

  try {
    // Оптимизируем изображения
    const optimizedFiles = [];
    for (const file of files) {
      if (ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
        // Папка uploads находится в корне проекта, а не в server/
        const optimizedPath = path.join(__dirname, '..', 'uploads', `optimized-${file.filename}`);
        await optimizeImage(file.path, optimizedPath);
        optimizedFiles.push({ ...file, path: optimizedPath, originalPath: file.path });
      } else {
        optimizedFiles.push(file);
      }
    }

    // Нормализуем parse_mode для основной отправки
    // Telegram Bot API поддерживает: "HTML" и "MarkdownV2" (старый "Markdown" deprecated)
    let normalizedParseMode = parseMode;
    if (parseMode === 'Markdown' || parseMode === 'MarkdownV2') {
      normalizedParseMode = 'MarkdownV2'; // Используем новый формат MarkdownV2
      // Конвертируем старый синтаксис Markdown (**text**) в новый MarkdownV2 (*text*)
      // Это делается на уровне текста, если нужно
    } else if (parseMode === 'HTML') {
      normalizedParseMode = 'HTML';
    } else {
      normalizedParseMode = undefined;
    }

    // Параллельная отправка с задержками для избежания перегрузки и socket hang up
    const sendPromises = channels.map(async (channelId, index) => {
      // Добавляем задержку между отправками (100ms для текста, 500ms для файлов)
      if (index > 0) {
        const delay = files.length > 0 ? 500 : 100;
        await new Promise(resolve => setTimeout(resolve, delay * index));
      }
      
      try {
        const sendOptions = {
          parse_mode: normalizedParseMode
        };

        // Добавляем кнопки если есть
        if (buttons) {
          try {
            const buttonData = normalizeButtons(buttons);
            sendOptions.reply_markup = {
              inline_keyboard: buttonData
            };
          } catch (e) {
            console.error('Error parsing buttons:', e);
          }
        }

        let messageResult = null;
        let messageIds = [];
        
        if (optimizedFiles.length > 0) {
          // Определяем тип медиа
          const images = optimizedFiles.filter(f => ALLOWED_IMAGE_TYPES.includes(f.mimetype));
          const videos = optimizedFiles.filter(f => ALLOWED_VIDEO_TYPES.includes(f.mimetype));
          const documents = optimizedFiles.filter(f => ALLOWED_DOC_TYPES.includes(f.mimetype));

          if (images.length > 1) {
            // Множественные изображения - отправляем как медиагруппу
            const media = images.map((file, idx) => ({
              type: 'photo',
              media: fs.createReadStream(file.path),
              caption: idx === 0 ? text : undefined, // Текст только у первого фото
              parse_mode: idx === 0 ? normalizedParseMode : undefined
            }));
            
            messageResult = await sendWithRetry(() => bot.sendMediaGroup(channelId, media));
            // sendMediaGroup возвращает массив сообщений
            if (Array.isArray(messageResult)) {
              messageIds = messageResult.map(msg => msg.message_id);
            }
          } else if (images.length === 1) {
            // Одно изображение
            messageResult = await sendWithRetry(() => bot.sendPhoto(channelId, fs.createReadStream(images[0].path), {
              caption: text,
              ...sendOptions
            }));
            if (messageResult && messageResult.message_id) {
              messageIds = [messageResult.message_id];
            }
          } else if (videos.length > 0) {
            // Видео
            messageResult = await sendWithRetry(() => bot.sendVideo(channelId, fs.createReadStream(videos[0].path), {
              caption: text,
              ...sendOptions
            }));
            if (messageResult && messageResult.message_id) {
              messageIds = [messageResult.message_id];
            }
          } else if (documents.length > 0) {
            // Документы
            messageResult = await sendWithRetry(() => bot.sendDocument(channelId, fs.createReadStream(documents[0].path), {
              caption: text,
              ...sendOptions
            }));
            if (messageResult && messageResult.message_id) {
              messageIds = [messageResult.message_id];
            }
          }
        } else {
          // Только текст
          messageResult = await sendWithRetry(() => bot.sendMessage(channelId, text, sendOptions));
          if (messageResult && messageResult.message_id) {
            messageIds = [messageResult.message_id];
          }
        }

        results.push({ channelId, success: true, messageIds });
        historyEntries.push({ 
          channelId, 
          success: true, 
          timestamp: new Date().toISOString(),
          messageIds: messageIds.length > 0 ? messageIds : undefined
        });
      } catch (error) {
        console.error(`Error sending to ${channelId}:`, error);
        // Улучшаем сообщение об ошибке для socket hang up
        let errorMessage = error.message;
        if (error.message && error.message.includes('socket hang up')) {
          errorMessage = 'Ошибка соединения: прервано во время передачи. Попробуйте отправить снова.';
        } else if (error.response && error.response.body && error.response.body.description) {
          errorMessage = error.response.body.description;
        }
        results.push({ channelId, success: false, error: errorMessage });
        historyEntries.push({ channelId, success: false, error: errorMessage, timestamp: new Date().toISOString() });
      }
    });

    await Promise.all(sendPromises);

    // Сохраняем в историю
    if (historyEntries.length > 0) {
      addPostsHistory([{
        text,
        files: files.map(f => f.originalname),
        channels: channels,
        results: historyEntries,
        timestamp: new Date().toISOString(),
        userId: user ? user.id : null,
        buttons: normalizeButtons(buttons),
        parseMode: parseMode || 'HTML'
      }], tokenHash);
    }

    logAction('post_sent', { channelsCount: channels.length, successCount: results.filter(r => r.success).length }, tokenHash);

    // Удаляем временные файлы (только для немедленной отправки, не для запланированных)
    // Для запланированных постов файлы удаляются планировщиком после отправки
    for (const file of optimizedFiles) {
      try {
        // Проверяем, не используется ли файл в запланированных постах
        const scheduled = getScheduledPosts(tokenHash);
        const isUsedInScheduled = scheduled.some(post => 
          post.files && post.files.some(f => {
            const filePath = path.resolve(__dirname, '..', file.path);
            const originalPath = file.originalPath ? path.resolve(__dirname, '..', file.originalPath) : null;
            return f.path === filePath || f.path === file.originalPath || 
                   (originalPath && f.path === originalPath) ||
                   f.path === file.path;
          })
        );
        
        if (!isUsedInScheduled) {
          if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
          if (file.originalPath && fs.existsSync(file.originalPath)) fs.unlinkSync(file.originalPath);
        } else {
        }
      } catch (e) {
        console.error('Error deleting file:', e);
      }
    }

    res.json({ success: true, results });
  } catch (error) {
    // Удаляем временные файлы в случае ошибки
    if (req.files) {
      req.files.forEach(file => {
        try {
          if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
        } catch (e) {}
      });
    }
    res.status(500).json({ error: error.message || 'Failed to send post' });
  }
});

// История постов
app.get('/api/posts/history', requireAuth, (req, res) => {
  const tokenHash = getTokenHashFromRequest(req);
  const history = getPostsHistory(tokenHash);
  const limit = parseInt(req.query.limit) || 20;
  res.json(history.slice(0, limit));
});

// Удалить сообщения из Telegram каналов
app.post('/api/posts/history/:postId/delete-messages', requireAuth, async (req, res) => {
  const { postId } = req.params;
  const tokenHash = getTokenHashFromRequest(req);
  const bot = getBotFromRequest(req);
  
  if (!bot) {
    return res.status(500).json({ error: 'Telegram bot not initialized' });
  }
  
  try {
    const history = getPostsHistory(tokenHash);
    const post = history.find(p => p.id === postId);
    
    if (!post) {
      return res.status(404).json({ error: 'Post not found in history' });
    }
    
    if (!post.results || !Array.isArray(post.results)) {
      return res.status(400).json({ error: 'No results found for this post' });
    }
    
    const deleteResults = [];
    
    // Удаляем сообщения из всех каналов, где они были успешно отправлены
    for (const result of post.results) {
      if (result.success && result.messageIds && Array.isArray(result.messageIds) && result.messageIds.length > 0) {
        const channelId = result.channelId;
        
        // Удаляем все сообщения из медиагруппы или одно сообщение
        for (const messageId of result.messageIds) {
          try {
            await bot.deleteMessage(channelId, messageId);
            deleteResults.push({ 
              channelId, 
              messageId, 
              success: true 
            });
          } catch (deleteError) {
            console.error(`[API] Error deleting message ${messageId} from ${channelId}:`, deleteError);
            deleteResults.push({ 
              channelId, 
              messageId, 
              success: false, 
              error: deleteError.message || 'Failed to delete message' 
            });
          }
        }
      } else {
        // Если нет messageIds, значит сообщение не было отправлено или отправка не удалась
        deleteResults.push({ 
          channelId: result.channelId, 
          success: false, 
          error: 'No message IDs found (message was not sent or failed)' 
        });
      }
    }
    
    const successCount = deleteResults.filter(r => r.success).length;
    const totalCount = deleteResults.length;
    
    // Помечаем пост как удалённый, если хотя бы одно сообщение было удалено
    if (successCount > 0) {
      const deletedAt = new Date().toISOString();
      const updated = markPostMessagesAsDeleted(postId, deletedAt);
      if (!updated) {
        console.warn(`[API] Failed to mark post ${postId} as deleted`);
      }
    }
    
    logAction('messages_deleted', { 
      postId, 
      successCount, 
      totalCount 
    }, tokenHash);
    
    res.json({ 
      success: true, 
      deleted: successCount,
      total: totalCount,
      results: deleteResults
    });
  } catch (error) {
    console.error('[API] Error deleting messages:', error);
    res.status(500).json({ error: error.message || 'Failed to delete messages' });
  }
});

// Очистить историю постов
app.delete('/api/posts/history', requireAuth, (req, res) => {
  try {
    const { olderThanDays } = req.query;
    const tokenHash = getTokenHashFromRequest(req);
    
    
    if (olderThanDays) {
      // Удаляем записи старше указанного количества дней
      const maxAge = parseInt(olderThanDays) * 24 * 60 * 60 * 1000;
      const now = Date.now();
      const history = getPostsHistory(tokenHash);
      const beforeCount = history.length;
      const filtered = history.filter(post => {
        const postDate = new Date(post.timestamp).getTime();
        return (now - postDate) < maxAge;
      });
      
      // Удаляем старые записи из БД
      const cutoffDate = new Date(Date.now() - maxAge).toISOString();
      deleteOldPostsHistory(tokenHash, cutoffDate);
      
      logAction('history_cleared', { olderThanDays, removed: beforeCount - filtered.length }, tokenHash);
      
      res.json({ 
        success: true, 
        removed: beforeCount - filtered.length,
        remaining: filtered.length 
      });
    } else {
      // Удаляем всю историю
      const history = getPostsHistory(tokenHash);
      const count = history.length;
      
      deleteAllPostsHistory(tokenHash);
      logAction('history_cleared', { all: true, removed: count }, tokenHash);
      
      res.json({ success: true, removed: count });
    }
  } catch (error) {
    console.error('[API] Error clearing history:', error);
    res.status(500).json({ error: error.message });
  }
});

// Группы каналов
app.get('/api/channel-groups', requireAuth, (req, res) => {
  const tokenHash = getTokenHashFromRequest(req);
  const groups = getChannelGroups(tokenHash).map(g => ({
    ...g,
    // Backward compatible contract for frontend
    channelIds: Array.isArray(g.channels) ? g.channels : (g.channelIds || [])
  }));
  res.json(groups);
});

app.post('/api/channel-groups', requireAuth, (req, res) => {
  const { name, channelIds } = req.body;
  const tokenHash = getTokenHashFromRequest(req);
  
  if (!name || !channelIds || !Array.isArray(channelIds) || channelIds.length === 0) {
    return res.status(400).json({ error: 'Name and channelIds array are required' });
  }

  const groups = getChannelGroups(tokenHash);
  const newGroup = {
    id: Date.now().toString(),
    name,
    channelIds,
    createdAt: new Date().toISOString()
  };
  
  createChannelGroup({
    id: newGroup.id,
    name: newGroup.name,
    channels: newGroup.channelIds,
    tokenHash
  });
  logAction('channel_group_created', { groupId: newGroup.id, name, channelCount: channelIds.length }, tokenHash);
  
  res.json({ success: true, group: newGroup });
});

app.delete('/api/channel-groups/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  const decodedId = decodeURIComponent(id);
  const tokenHash = getTokenHashFromRequest(req);
  
  deleteChannelGroup(decodedId);
  logAction('channel_group_deleted', { groupId: decodedId }, tokenHash);
  
  res.json({ success: true });
});

// Повторяющиеся посты
app.get('/api/recurring-posts', requireAuth, (req, res) => {
  const tokenHash = getTokenHashFromRequest(req);
  const posts = getRecurringPosts(tokenHash);
  res.json(posts);
});

app.post('/api/recurring-posts', requireAuth, (req, res) => {
  const { text, channelIds, recurrence, time, dayOfWeek, parseMode, buttons, files } = req.body;
  const tokenHash = getTokenHashFromRequest(req);
  const user = req.session.user;
  
  if (!text || !channelIds || !Array.isArray(channelIds) || channelIds.length === 0) {
    return res.status(400).json({ error: 'Text and channelIds are required' });
  }
  
  if (!recurrence || !['daily', 'weekly'].includes(recurrence)) {
    return res.status(400).json({ error: 'Recurrence must be "daily" or "weekly"' });
  }
  
  if (!time || !/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(time)) {
    return res.status(400).json({ error: 'Time must be in HH:MM format' });
  }
  
  if (recurrence === 'weekly' && (dayOfWeek === undefined || dayOfWeek < 0 || dayOfWeek > 6)) {
    return res.status(400).json({ error: 'dayOfWeek must be 0-6 (0=Sunday, 1=Monday, ...)' });
  }
  
  const posts = getRecurringPosts(tokenHash);
  const nextDate = getNextScheduledDate({ recurrence, time, dayOfWeek });
  
  const newPost = {
    id: Date.now().toString(),
    text,
    channelIds,
    recurrence,
    time,
    dayOfWeek: recurrence === 'weekly' ? dayOfWeek : undefined,
    parseMode: parseMode || 'HTML',
    buttons: buttons || null,
    files: files || [],
    enabled: true,
    createdAt: new Date().toISOString(),
    nextScheduledAt: nextDate.toISOString(),
    author: user ? {
      id: user.id,
      username: user.username,
      name: user.name
    } : null
  };
  
  createRecurringPost({
    ...newPost,
    tokenHash
  });
  logAction('recurring_post_created', { 
    postId: newPost.id, 
    recurrence, 
    time,
    channelCount: channelIds.length 
  }, tokenHash);
  
  res.json({ success: true, post: newPost });
});

app.put('/api/recurring-posts/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  const { enabled, text, channelIds, recurrence, time, dayOfWeek, parseMode, buttons } = req.body;
  const tokenHash = getTokenHashFromRequest(req);
  
  const posts = getRecurringPosts(tokenHash);
  const index = posts.findIndex(p => p.id === id);
  
  if (index === -1) {
    return res.status(404).json({ error: 'Recurring post not found' });
  }
  
  const updates = {};
  if (enabled !== undefined) updates.enabled = enabled;
  if (text !== undefined) updates.text = text;
  if (channelIds !== undefined) updates.channels = channelIds;
  if (recurrence !== undefined) updates.recurrence = recurrence;
  if (time !== undefined) updates.time = time;
  if (dayOfWeek !== undefined) updates.dayOfWeek = dayOfWeek;
  if (buttons !== undefined) updates.buttons = buttons;
  
  // Пересчитываем следующую дату
  const post = getRecurringPostById(id);
  if (post) {
    const updatedPost = { ...post, ...updates };
    updates.nextScheduledDate = getNextScheduledDate(updatedPost).toISOString();
  }
  
  updateRecurringPost(id, updates);
  logAction('recurring_post_updated', { postId: id }, tokenHash);
  
  res.json({ success: true, post: posts[index] });
});

app.delete('/api/recurring-posts/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  const decodedId = decodeURIComponent(id);
  const tokenHash = getTokenHashFromRequest(req);
  
  deleteRecurringPost(decodedId);
  logAction('recurring_post_deleted', { postId: decodedId }, tokenHash);
  
  res.json({ success: true });
});

// Шаблоны постов
app.get('/api/templates', requireAuth, (req, res) => {
  const tokenHash = getTokenHashFromRequest(req);
  res.json(getTemplates(tokenHash));
});

app.post('/api/templates', requireAuth, (req, res) => {
  const { name, text } = req.body;
  const tokenHash = getTokenHashFromRequest(req);
  
  if (!name || !text) {
    return res.status(400).json({ error: 'Name and text are required' });
  }
  createTemplate({
    id: Date.now().toString(),
    tokenHash,
    text,
    createdAt: new Date().toISOString()
  });
  logAction('template_created', { name }, tokenHash);
  res.json({ success: true, templates });
});

app.delete('/api/templates/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  const decodedId = decodeURIComponent(id);
  const tokenHash = getTokenHashFromRequest(req);
  const template = getTemplates(tokenHash).find(t => t.id === decodedId);
  
  if (!template) {
    return res.status(404).json({ error: 'Template not found' });
  }
  
  deleteTemplate(decodedId);
  logAction('template_deleted', { id: decodedId }, tokenHash);
  res.json({ success: true });
});

// Запланированные посты
app.get('/api/scheduled-posts', requireAuth, (req, res) => {
  const tokenHash = getTokenHashFromRequest(req);
  const scheduled = getScheduledPosts(tokenHash);
  // Добавляем информацию о времени до отправки
  const now = new Date();
  const enriched = scheduled.map(post => {
    // Используем scheduledTime из БД или scheduledAt (для обратной совместимости)
    const scheduledTime = post.scheduledTime || post.scheduledAt;
    const scheduledDate = new Date(scheduledTime);
    const diff = scheduledDate - now;
    return {
      ...post,
      scheduledAt: scheduledTime, // Убеждаемся, что scheduledAt всегда есть
      timeUntilSend: diff > 0 ? Math.floor(diff / 1000 / 60) : 0, // минуты
      isOverdue: diff < 0,
      channelIds: post.channels || post.channelIds || [] // Добавляем channelIds для обратной совместимости
    };
  });
  res.json(enriched);
});

app.get('/api/scheduled-posts/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  const tokenHash = getTokenHashFromRequest(req);
  const scheduled = getScheduledPosts(tokenHash);
  const post = scheduled.find(p => p.id === id);
  
  if (!post) {
    return res.status(404).json({ error: 'Scheduled post not found' });
  }
  
  res.json(post);
});

app.put('/api/scheduled-posts/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { text, channelIds, scheduledAt, parseMode, buttons } = req.body;
  const tokenHash = getTokenHashFromRequest(req);
  const bot = getBotFromRequest(req);
  
  if (!bot) {
    return res.status(500).json({ error: 'Telegram bot not initialized' });
  }
  
  try {
    const scheduled = getScheduledPosts(tokenHash);
    const index = scheduled.findIndex(p => p.id === id);
    
    if (index === -1) {
      return res.status(404).json({ error: 'Scheduled post not found' });
    }
    
    const post = scheduled[index];
    
    // Валидация новой даты если указана
    if (scheduledAt) {
      const scheduledDate = new Date(scheduledAt);
      const now = new Date();
      
      if (isNaN(scheduledDate.getTime())) {
        return res.status(400).json({ error: 'Invalid scheduled date format' });
      }
      
      if (scheduledDate <= now) {
        return res.status(400).json({ error: 'Scheduled time must be in the future' });
      }
      
      post.scheduledAt = scheduledDate.toISOString();
    }
    
    // Обновляем поля если указаны
    const updates = {};
    if (text !== undefined) updates.text = text;
    if (channelIds !== undefined) {
      updates.channels = Array.isArray(channelIds) ? channelIds : JSON.parse(channelIds);
    }
    if (parseMode !== undefined) updates.parseMode = parseMode;
    if (buttons !== undefined) {
      updates.buttons = buttons ? (Array.isArray(buttons) ? buttons : JSON.parse(buttons)) : null;
    }
    if (post.scheduledAt) {
      updates.scheduledTime = post.scheduledAt;
    }
    
    updateScheduledPost(id, updates);
    logAction('scheduled_post_updated', { postId: id }, tokenHash);
    
    res.json({ success: true, post });
  } catch (error) {
    console.error('Error updating scheduled post:', error);
    res.status(500).json({ error: error.message || 'Failed to update scheduled post' });
  }
});

app.delete('/api/scheduled-posts/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  const decodedId = decodeURIComponent(id);
  const tokenHash = getTokenHashFromRequest(req);
  deleteScheduledPost(decodedId);
  logAction('scheduled_post_deleted', { id: decodedId }, tokenHash);
  res.json({ success: true });
});

// Ручной запуск планировщика (для тестирования)
app.post('/api/scheduled-posts/process', async (req, res) => {
  if (!bot) {
    return res.status(500).json({ error: 'Bot not initialized' });
  }

  try {
    const scheduled = getScheduledPosts();
    const now = new Date();
    const toSend = scheduled.filter(p => {
      try {
        const scheduledDate = new Date(p.scheduledAt);
        return scheduledDate <= now && !isNaN(scheduledDate.getTime());
      } catch (e) {
        return false;
      }
    });

    res.json({ 
      success: true, 
      found: scheduled.length,
      toSend: toSend.length,
      posts: toSend.map(p => ({ id: p.id, scheduledAt: p.scheduledAt }))
    });
    
    // Запускаем обработку асинхронно
    setTimeout(() => {
      // Здесь можно вызвать логику планировщика
    }, 100);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Логи
app.get('/api/logs', requireAuth, (req, res) => {
  const tokenHash = getTokenHashFromRequest(req);
  const limit = parseInt(req.query.limit) || 100;
  const logs = getLogs(tokenHash);
  res.json(logs.slice(-limit));
});

// Проверка статуса бота
app.get('/api/bot-status', requireAuth, async (req, res) => {
  const userId = req.session.user.id;
  const tokenHash = getTokenHashFromRequest(req);
  
  // Проверяем доступ к токену для обычных пользователей
  if (tokenHash && tokenHash !== 'default') {
    const users = getUsers();
    const user = users.find(u => u.id === userId);
    
    if (user?.role !== 'admin') {
      if (!canAccessToken(userId, tokenHash)) {
        return res.json({ 
          initialized: false, 
          error: 'У вас нет доступа к этому боту' 
        });
      }
    }
  }
  
  const bot = getBotFromRequest(req);
  
  if (!bot) {
    return res.json({ initialized: false, error: 'Bot token not provided' });
  }

  try {
    const me = await bot.getMe();
    res.json({ initialized: true, username: me.username });
  } catch (error) {
    res.json({ initialized: false, error: error.message });
  }
});

// Проверка прав бота в каналах
app.post('/api/channels/check-rights', requireAuth, async (req, res) => {
  const tokenHash = getTokenHashFromRequest(req);
  const bot = getBotFromRequest(req);
  
  if (!bot) {
    return res.status(500).json({ error: 'Bot not initialized' });
  }

  try {
    const channels = getChannels(tokenHash);
    const me = await bot.getMe();
    const results = [];

    for (const channel of channels) {
      try {
        const chatMember = await bot.getChatMember(channel.id, me.id);
        const hasRights = chatMember.status === 'administrator' || chatMember.status === 'creator';
        results.push({
          channelId: channel.id,
          channelName: channel.name,
          hasRights,
          status: chatMember.status
        });
      } catch (error) {
        results.push({
          channelId: channel.id,
          channelName: channel.name,
          hasRights: false,
          error: error.message
        });
      }
    }

    res.json({ results });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Попытка найти каналы из последних обновлений
// ВАЖНО: Это работает только если бот получал сообщения/обновления от этих каналов
app.post('/api/channels/discover-from-updates', requireAuth, async (req, res) => {
  const bot = getBotFromRequest(req);
  
  if (!bot) {
    return res.status(500).json({ error: 'Bot not initialized' });
  }

  try {
    const me = await bot.getMe();
    const discoveredChannels = [];
    const seenChatIds = new Set();
    
    // Получаем последние обновления (до 100)
    const updates = await bot.getUpdates({ limit: 100 });
    
    for (const update of updates) {
      let chat = null;
      
      // Извлекаем информацию о чате из разных типов обновлений
      if (update.message && update.message.chat) {
        chat = update.message.chat;
      } else if (update.channel_post && update.channel_post.chat) {
        chat = update.channel_post.chat;
      } else if (update.edited_message && update.edited_message.chat) {
        chat = update.edited_message.chat;
      } else if (update.edited_channel_post && update.edited_channel_post.chat) {
        chat = update.edited_channel_post.chat;
      }
      
      if (chat && (chat.type === 'channel' || chat.type === 'supergroup')) {
        const chatId = chat.id.toString();
        
        // Пропускаем дубликаты
        if (seenChatIds.has(chatId)) {
          continue;
        }
        seenChatIds.add(chatId);
        
        try {
          // Проверяем, является ли бот администратором
          const chatMember = await bot.getChatMember(chatId, me.id);
          const isAdmin = chatMember.status === 'administrator' || chatMember.status === 'creator';
          
          if (isAdmin) {
            discoveredChannels.push({
              id: chatId,
              name: chat.title || chat.username || `Channel ${chatId}`,
              username: chat.username || null,
              type: chat.type,
              status: chatMember.status
            });
          }
        } catch (error) {
          // Игнорируем ошибки для отдельных чатов
        }
      }
    }
    
    res.json({ 
      success: true, 
      discovered: discoveredChannels,
      note: 'Этот метод работает только для каналов, от которых бот получал обновления. Для полного списка нужно добавлять каналы вручную.'
    });
  } catch (error) {
    console.error('[Discover] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Создаем папку для загрузок
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

// Планировщик для отправки запланированных постов
// Работает со всеми токенами
cron.schedule('* * * * *', async () => {
  const tokens = getTokens();
  
  if (tokens.length === 0) {
    return;
  }

  // Обрабатываем запланированные посты для каждого токена
  for (const tokenData of tokens) {
    const token = tokenData.token;
    const tokenHash = getTokenHashSync(token);
    
    if (!bots.has(token)) {
      try {
        // Увеличиваем таймауты для больших файлов
        bots.set(token, new TelegramBot(token, { 
          polling: false,
          request: {
            agentOptions: {
              keepAlive: true,
              keepAliveMsecs: 30000
            },
            timeout: 60000, // 60 секунд для больших файлов
            forever: true
          }
        }));
      } catch (error) {
        console.error(`[Scheduler] Error creating bot for token ${tokenHash}:`, error);
        continue;
      }
    }
    
    const bot = bots.get(token);
    
    try {
      const scheduled = getScheduledPosts(tokenHash);
      if (scheduled.length === 0) {
        continue; // Нет запланированных постов для этого токена
      }

    const now = new Date();
    const toSend = scheduled.filter(p => {
      try {
        // Используем scheduledTime из БД или scheduledAt (для обратной совместимости)
        const scheduledTime = p.scheduledTime || p.scheduledAt;
        if (!scheduledTime) {
          console.error(`[Scheduler] No scheduled time for post ${p.id}`);
          return false;
        }
        const scheduledDate = new Date(scheduledTime);
        return scheduledDate <= now && !isNaN(scheduledDate.getTime());
      } catch (e) {
        console.error(`[Scheduler] Invalid date for post ${p.id}:`, p.scheduledTime || p.scheduledAt, e);
        return false;
      }
    });

    if (toSend.length === 0) {
      continue; // Нет постов для отправки для этого токена, переходим к следующему
    }
    
    console.log(`[Scheduler] Found ${toSend.length} posts to send for token ${tokenHash}`);

    for (const post of toSend) {
      const historyEntries = [];
      try {
        
        // Нормализуем parse_mode
        // Telegram Bot API поддерживает: "HTML" и "MarkdownV2" (старый "Markdown" deprecated)
        // MarkdownV2 синтаксис: *text* = жирный, _text_ = курсив, [ссылка](url) = ссылка
        let parseMode = post.parseMode;
        if (parseMode === 'Markdown' || parseMode === 'MarkdownV2') {
          parseMode = 'MarkdownV2'; // Используем новый формат
        } else if (parseMode === 'HTML') {
          parseMode = 'HTML';
        } else {
          parseMode = undefined;
        }
        
        const sendOptions = {
          parse_mode: parseMode,
          reply_markup: post.buttons ? { inline_keyboard: post.buttons } : undefined
        };

        // Получаем каналы: используем channels из БД или channelIds (для обратной совместимости)
        const channelIds = Array.isArray(post.channels) ? post.channels : (post.channelIds || []);
        
        if (channelIds.length === 0) {
          console.error(`[Scheduler] No channels for post ${post.id}`);
          deleteScheduledPost(post.id);
          continue;
        }
        
        // Отправляем пост с файлами если есть
        for (let i = 0; i < channelIds.length; i++) {
          const channelId = channelIds[i];
          // Добавляем задержку между отправками в разные каналы
          if (i > 0) {
            const delay = post.files && post.files.length > 0 ? 500 : 100;
            await new Promise(resolve => setTimeout(resolve, delay));
          }
          
          try {
            if (post.files && post.files.length > 0) {
              const images = post.files.filter(f => ALLOWED_IMAGE_TYPES.includes(f.mimetype));
              const videos = post.files.filter(f => ALLOWED_VIDEO_TYPES.includes(f.mimetype));
              const documents = post.files.filter(f => ALLOWED_DOC_TYPES.includes(f.mimetype));

              if (images.length > 1) {
                // Множественные изображения - отправляем как медиагруппу
                // Подготавливаем пути к файлам
                const mediaFiles = [];
                for (const image of images) {
                  let imagePath;
                  if (path.isAbsolute(image.path)) {
                    imagePath = image.path;
                  } else {
                    imagePath = path.resolve(__dirname, '..', image.path);
                  }
                  
                  if (!fs.existsSync(imagePath)) {
                    // Пробуем альтернативные пути
                    const altPath1 = path.join(process.cwd(), image.path);
                    const altPath2 = path.join(__dirname, image.path);
                    
                    if (fs.existsSync(altPath1)) {
                      imagePath = altPath1;
                    } else if (fs.existsSync(altPath2)) {
                      imagePath = altPath2;
                    } else {
                      throw new Error(`File not found: ${imagePath} (original: ${image.path})`);
                    }
                  }
                  
                  mediaFiles.push(imagePath);
                }
                
                // Формируем медиагруппу
                const media = mediaFiles.map((filePath, idx) => ({
                  type: 'photo',
                  media: fs.createReadStream(filePath),
                  caption: idx === 0 ? post.text : undefined, // Текст только у первого фото
                  parse_mode: idx === 0 ? parseMode : undefined // Используем нормализованный parseMode
                }));
                
                const mediaResult = await sendWithRetry(() => bot.sendMediaGroup(channelId, media));
                // sendMediaGroup возвращает массив сообщений
                let messageIds = [];
                if (Array.isArray(mediaResult)) {
                  messageIds = mediaResult.map(msg => msg.message_id);
                }
                historyEntries.push({ 
                  channelId, 
                  success: true, 
                  timestamp: new Date().toISOString(),
                  messageIds: messageIds.length > 0 ? messageIds : undefined
                });
              } else if (images.length === 1) {
                let imagePath;
                if (path.isAbsolute(images[0].path)) {
                  imagePath = images[0].path;
                } else {
                  imagePath = path.resolve(__dirname, '..', images[0].path);
                }
                
                if (!fs.existsSync(imagePath)) {
                  const altPath = path.join(process.cwd(), images[0].path);
                  if (fs.existsSync(altPath)) {
                    imagePath = altPath;
                  } else {
                    throw new Error(`File not found: ${imagePath}`);
                  }
                }
                const photoResult = await sendWithRetry(() => bot.sendPhoto(channelId, fs.createReadStream(imagePath), {
                  caption: post.text,
                  ...sendOptions
                }));
                historyEntries.push({ 
                  channelId, 
                  success: true, 
                  timestamp: new Date().toISOString(),
                  messageIds: photoResult && photoResult.message_id ? [photoResult.message_id] : undefined
                });
              } else if (videos.length > 0) {
                const videoPath = path.isAbsolute(videos[0].path) 
                  ? videos[0].path 
                  : path.join(__dirname, '..', videos[0].path);
                
                if (!fs.existsSync(videoPath)) {
                  throw new Error(`File not found: ${videoPath}`);
                }
                
                const videoResult = await sendWithRetry(() => bot.sendVideo(channelId, fs.createReadStream(videoPath), {
                  caption: post.text,
                  ...sendOptions
                }));
                historyEntries.push({ 
                  channelId, 
                  success: true, 
                  timestamp: new Date().toISOString(),
                  messageIds: videoResult && videoResult.message_id ? [videoResult.message_id] : undefined
                });
              } else if (documents.length > 0) {
                const docPath = path.isAbsolute(documents[0].path) 
                  ? documents[0].path 
                  : path.join(__dirname, '..', documents[0].path);
                
                if (!fs.existsSync(docPath)) {
                  throw new Error(`File not found: ${docPath}`);
                }
                
                const docResult = await sendWithRetry(() => bot.sendDocument(channelId, fs.createReadStream(docPath), {
                  caption: post.text,
                  ...sendOptions
                }));
                historyEntries.push({ 
                  channelId, 
                  success: true, 
                  timestamp: new Date().toISOString(),
                  messageIds: docResult && docResult.message_id ? [docResult.message_id] : undefined
                });
              } else {
                const textResult = await sendWithRetry(() => bot.sendMessage(channelId, post.text, sendOptions));
                historyEntries.push({ 
                  channelId, 
                  success: true, 
                  timestamp: new Date().toISOString(),
                  messageIds: textResult && textResult.message_id ? [textResult.message_id] : undefined
                });
              }
            } else {
              const textResult = await sendWithRetry(() => bot.sendMessage(channelId, post.text, sendOptions));
              historyEntries.push({ 
                channelId, 
                success: true, 
                timestamp: new Date().toISOString(),
                messageIds: textResult && textResult.message_id ? [textResult.message_id] : undefined
              });
            }
          } catch (channelError) {
            console.error(`[Scheduler] Error sending to channel ${channelId}:`, channelError);
            // Улучшаем сообщение об ошибке для socket hang up
            let errorMessage = channelError.message;
            if (channelError.message && channelError.message.includes('socket hang up')) {
              errorMessage = 'Ошибка соединения: прервано во время передачи';
            } else if (channelError.response && channelError.response.body && channelError.response.body.description) {
              errorMessage = channelError.response.body.description;
            }
            historyEntries.push({ channelId, success: false, error: errorMessage, timestamp: new Date().toISOString() });
            logAction('scheduled_post_channel_error', { 
              postId: post.id, 
              channelId, 
              error: errorMessage 
            }, tokenHash);
          }
        }
        
        // Сохраняем в историю
        if (historyEntries.length > 0) {
          addPostsHistory([{
            text: post.text,
            files: post.files ? post.files.map(f => f.originalname || f.name || 'file') : [],
            channels: channelIds,
            results: historyEntries,
            timestamp: new Date().toISOString(),
            userId: post.userId || (post.author ? post.author.id : null),
            parseMode: post.parseMode || 'HTML'
          }], tokenHash);
        }

        // Удаляем файлы
        if (post.files) {
          post.files.forEach(file => {
            try {
              if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
            } catch (e) {
              console.error(`[Scheduler] Error deleting file ${file.path}:`, e);
            }
          });
        }

      // Удаляем из запланированных (только если это не повторяющийся пост)
      if (!post.recurringPostId) {
        deleteScheduledPost(post.id);
      } else {
        // Для повторяющихся постов просто удаляем этот экземпляр
        deleteScheduledPost(post.id);
      }
      logAction('scheduled_post_sent', { postId: post.id, channelIds: channelIds, recurring: !!post.recurringPostId }, tokenHash);
      } catch (error) {
        console.error(`[Scheduler] Error processing scheduled post ${post.id} (token: ${tokenHash}):`, error);
        logAction('scheduled_post_error', { postId: post.id, error: error.message }, tokenHash);
        // Не удаляем пост при ошибке, чтобы можно было повторить попытку
      }
    }
    } catch (error) {
      console.error(`[Scheduler] Fatal error for token ${tokenHash}:`, error);
    }
  }
});

// Обработка ошибок для API - должен быть ДО статических файлов
app.use('/api/*', (err, req, res, next) => {
  console.error('[API Error]', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error'
  });
});

// Статические файлы должны быть в конце, после всех API routes
app.use(express.static('dist'));

// Fallback для SPA - все остальные запросы возвращают index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'dist', 'index.html'));
});

const server = app.listen(PORT, () => {
  // Проверяем запланированные посты при старте
  const scheduled = getScheduledPosts();
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`\n❌ Порт ${PORT} уже занят!`);
    console.error(`Попробуйте:`);
    console.error(`1. Остановить процесс, использующий порт ${PORT}`);
    console.error(`2. Или изменить PORT в файле .env на другой порт (например, 5001)`);
    console.error(`3. Или выполните: lsof -ti:${PORT} | xargs kill -9\n`);
    process.exit(1);
  } else {
    console.error('Ошибка при запуске сервера:', error);
    process.exit(1);
  }
});
