import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Путь к БД
// Используем директорию data для хранения БД, чтобы избежать проблем с монтированием в Docker
const dataDir = path.join(__dirname, 'data');

// Убеждаемся, что директория существует и доступна для записи
try {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true, mode: 0o755 });
  }
  
  // Проверяем права на запись
  fs.accessSync(dataDir, fs.constants.W_OK);
} catch (error) {
  console.error('[DB] Error accessing data directory:', dataDir);
  console.error('[DB] Error:', error.message);
  console.error('[DB] Current working directory:', process.cwd());
  console.error('[DB] __dirname:', __dirname);
  throw new Error(`Cannot access data directory: ${dataDir}. Error: ${error.message}`);
}

const dbPath = path.join(dataDir, 'database.db');
console.log('[DB] Database path:', dbPath);

// Создаем подключение к БД
// Если файл не существует, он будет создан автоматически
let db;
try {
  db = new Database(dbPath);
  console.log('[DB] Database connection established');
} catch (error) {
  console.error('[DB] Failed to open database:', dbPath);
  console.error('[DB] Error code:', error.code);
  console.error('[DB] Error message:', error.message);
  console.error('[DB] Directory exists:', fs.existsSync(dataDir));
  console.error('[DB] Directory is writable:', (() => {
    try {
      fs.accessSync(dataDir, fs.constants.W_OK);
      return true;
    } catch {
      return false;
    }
  })());
  
  // Если файл не существует, пробуем создать его
  if (error.code === 'SQLITE_CANTOPEN' && !fs.existsSync(dbPath)) {
    try {
      // Создаем пустой файл
      fs.writeFileSync(dbPath, '');
      // Устанавливаем права на файл
      fs.chmodSync(dbPath, 0o644);
      console.log('[DB] Created empty database file');
      
      // Пробуем снова открыть
      db = new Database(dbPath);
      console.log('[DB] Database connection established after file creation');
    } catch (createError) {
      console.error('[DB] Failed to create database file:', createError);
      throw new Error(`Cannot create database file: ${dbPath}. Error: ${createError.message}`);
    }
  } else {
    throw error;
  }
}

// Включаем foreign keys
db.pragma('foreign_keys = ON');

// Инициализация БД - создание таблиц
export function initDatabase() {
  // Таблица пользователей
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      ownerId TEXT,
      createdAt TEXT NOT NULL,
      FOREIGN KEY (ownerId) REFERENCES users(id)
    )
  `);

  // Таблица токенов
  db.exec(`
    CREATE TABLE IF NOT EXISTS tokens (
      token TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      username TEXT,
      userId TEXT,
      createdAt TEXT NOT NULL,
      isDefault INTEGER DEFAULT 0,
      avatarUrl TEXT,
      FOREIGN KEY (userId) REFERENCES users(id)
    )
  `);

  // Таблица каналов
  db.exec(`
    CREATE TABLE IF NOT EXISTS channels (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      tags TEXT, -- JSON массив
      tokenHash TEXT NOT NULL,
      avatarUrl TEXT,
      createdAt TEXT NOT NULL
    )
  `);

  // Таблица истории постов
  db.exec(`
    CREATE TABLE IF NOT EXISTS posts_history (
      id TEXT PRIMARY KEY,
      tokenHash TEXT NOT NULL,
      text TEXT,
      files TEXT, -- JSON массив путей к файлам
      channels TEXT NOT NULL, -- JSON массив
      results TEXT NOT NULL, -- JSON объект
      timestamp TEXT NOT NULL,
      userId TEXT,
      buttons TEXT, -- JSON массив
      parseMode TEXT DEFAULT 'HTML'
    )
  `);

  // Таблица шаблонов
  db.exec(`
    CREATE TABLE IF NOT EXISTS templates (
      id TEXT PRIMARY KEY,
      tokenHash TEXT NOT NULL,
      text TEXT NOT NULL,
      createdAt TEXT NOT NULL
    )
  `);

  // Таблица запланированных постов
  db.exec(`
    CREATE TABLE IF NOT EXISTS scheduled_posts (
      id TEXT PRIMARY KEY,
      tokenHash TEXT NOT NULL,
      text TEXT,
      files TEXT, -- JSON массив
      channels TEXT NOT NULL, -- JSON массив
      scheduledTime TEXT NOT NULL,
      buttons TEXT, -- JSON массив
      createdAt TEXT NOT NULL,
      userId TEXT
    )
  `);

  // Таблица автоматических постов
  db.exec(`
    CREATE TABLE IF NOT EXISTS recurring_posts (
      id TEXT PRIMARY KEY,
      tokenHash TEXT NOT NULL,
      text TEXT,
      files TEXT, -- JSON массив
      channels TEXT NOT NULL, -- JSON массив
      recurrence TEXT NOT NULL, -- 'daily' или 'weekly'
      time TEXT NOT NULL, -- 'HH:MM'
      dayOfWeek INTEGER, -- 0-6 для weekly
      enabled INTEGER DEFAULT 1,
      nextScheduledDate TEXT,
      buttons TEXT, -- JSON массив
      createdAt TEXT NOT NULL,
      userId TEXT
    )
  `);

  // Таблица групп каналов
  db.exec(`
    CREATE TABLE IF NOT EXISTS channel_groups (
      id TEXT PRIMARY KEY,
      tokenHash TEXT NOT NULL,
      name TEXT NOT NULL,
      channels TEXT NOT NULL, -- JSON массив
      createdAt TEXT NOT NULL
    )
  `);

  // Таблица логов
  db.exec(`
    CREATE TABLE IF NOT EXISTS logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tokenHash TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      action TEXT NOT NULL,
      data TEXT -- JSON объект
    )
  `);

  // Миграция: добавляем поле parseMode в posts_history, если его нет
  try {
    db.exec(`ALTER TABLE posts_history ADD COLUMN parseMode TEXT DEFAULT 'HTML'`);
  } catch (e) {
    // Поле уже существует, игнорируем ошибку
    if (!e.message.includes('duplicate column name')) {
      console.warn('[DB] Warning adding parseMode column:', e.message);
    }
  }

  // Миграция: добавляем поле avatarUrl в tokens, если его нет
  try {
    db.exec(`ALTER TABLE tokens ADD COLUMN avatarUrl TEXT`);
  } catch (e) {
    // Поле уже существует, игнорируем ошибку
    if (!e.message.includes('duplicate column name')) {
      console.warn('[DB] Warning adding avatarUrl column:', e.message);
    }
  }

  // Создаем индексы для производительности
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_tokens_userId ON tokens(userId);
    CREATE INDEX IF NOT EXISTS idx_channels_tokenHash ON channels(tokenHash);
    CREATE INDEX IF NOT EXISTS idx_posts_history_tokenHash ON posts_history(tokenHash);
    CREATE INDEX IF NOT EXISTS idx_templates_tokenHash ON templates(tokenHash);
    CREATE INDEX IF NOT EXISTS idx_scheduled_posts_tokenHash ON scheduled_posts(tokenHash);
    CREATE INDEX IF NOT EXISTS idx_recurring_posts_tokenHash ON recurring_posts(tokenHash);
    CREATE INDEX IF NOT EXISTS idx_channel_groups_tokenHash ON channel_groups(tokenHash);
    CREATE INDEX IF NOT EXISTS idx_logs_tokenHash ON logs(tokenHash);
  `);

  console.log('[DB] Database initialized successfully');
}

// ========== USERS ==========

export function getUsers() {
  const stmt = db.prepare('SELECT * FROM users ORDER BY createdAt');
  return stmt.all();
}

export function getUserById(id) {
  const stmt = db.prepare('SELECT * FROM users WHERE id = ?');
  return stmt.get(id);
}

export function getUserByUsername(username) {
  const stmt = db.prepare('SELECT * FROM users WHERE username = ?');
  return stmt.get(username);
}

export function createUser(user) {
  const stmt = db.prepare(`
    INSERT INTO users (id, username, password, name, role, ownerId, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    user.id,
    user.username,
    user.password,
    user.name,
    user.role || 'user',
    user.ownerId || null,
    user.createdAt
  );
  return user;
}

export function updateUser(id, updates) {
  const fields = [];
  const values = [];
  
  if (updates.username !== undefined) {
    fields.push('username = ?');
    values.push(updates.username);
  }
  if (updates.password !== undefined) {
    fields.push('password = ?');
    values.push(updates.password);
  }
  if (updates.name !== undefined) {
    fields.push('name = ?');
    values.push(updates.name);
  }
  if (updates.role !== undefined) {
    fields.push('role = ?');
    values.push(updates.role);
  }
  if (updates.ownerId !== undefined) {
    fields.push('ownerId = ?');
    values.push(updates.ownerId);
  }
  
  if (fields.length === 0) return;
  
  values.push(id);
  const stmt = db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`);
  stmt.run(...values);
}

export function deleteUser(id) {
  const stmt = db.prepare('DELETE FROM users WHERE id = ?');
  stmt.run(id);
}

// ========== TOKENS ==========

export function getTokens() {
  const stmt = db.prepare('SELECT * FROM tokens ORDER BY createdAt');
  return stmt.all().map(t => ({
    ...t,
    isDefault: t.isDefault === 1
  }));
}

export function getTokenByHash(hash) {
  const tokens = getTokens();
  return tokens.find(t => {
    const tokenHash = crypto.createHash('md5').update(t.token).digest('hex').substring(0, 8);
    return tokenHash === hash;
  });
}

export function getTokenByToken(token) {
  const stmt = db.prepare('SELECT * FROM tokens WHERE token = ?');
  const result = stmt.get(token);
  if (result) {
    result.isDefault = result.isDefault === 1;
  }
  return result;
}

export function createToken(tokenData) {
  const stmt = db.prepare(`
    INSERT INTO tokens (token, name, username, userId, createdAt, isDefault, avatarUrl)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    tokenData.token,
    tokenData.name,
    tokenData.username || null,
    tokenData.userId || null,
    tokenData.createdAt,
    tokenData.isDefault ? 1 : 0,
    tokenData.avatarUrl || null
  );
  return tokenData;
}

export function updateToken(token, updates) {
  const fields = [];
  const values = [];
  
  if (updates.name !== undefined) {
    fields.push('name = ?');
    values.push(updates.name);
  }
  if (updates.username !== undefined) {
    fields.push('username = ?');
    values.push(updates.username);
  }
  if (updates.isDefault !== undefined) {
    fields.push('isDefault = ?');
    values.push(updates.isDefault ? 1 : 0);
  }
  if (updates.avatarUrl !== undefined) {
    fields.push('avatarUrl = ?');
    values.push(updates.avatarUrl);
  }
  
  if (fields.length === 0) return;
  
  values.push(token);
  const stmt = db.prepare(`UPDATE tokens SET ${fields.join(', ')} WHERE token = ?`);
  stmt.run(...values);
}

export function deleteToken(token) {
  const stmt = db.prepare('DELETE FROM tokens WHERE token = ?');
  stmt.run(token);
}

// ========== CHANNELS ==========

export function getChannels(tokenHash) {
  const stmt = db.prepare('SELECT * FROM channels WHERE tokenHash = ? ORDER BY name');
  const rows = stmt.all(tokenHash);
  return rows.map(row => ({
    ...row,
    tags: row.tags ? JSON.parse(row.tags) : []
  }));
}

export function getChannelById(id) {
  const stmt = db.prepare('SELECT * FROM channels WHERE id = ?');
  const row = stmt.get(id);
  if (row) {
    row.tags = row.tags ? JSON.parse(row.tags) : [];
  }
  return row;
}

export function createChannel(channel) {
  const stmt = db.prepare(`
    INSERT INTO channels (id, name, tags, tokenHash, avatarUrl, createdAt)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    channel.id,
    channel.name,
    JSON.stringify(channel.tags || []),
    channel.tokenHash,
    channel.avatarUrl || null,
    channel.createdAt
  );
  return channel;
}

export function updateChannel(id, updates) {
  const fields = [];
  const values = [];
  
  if (updates.name !== undefined) {
    fields.push('name = ?');
    values.push(updates.name);
  }
  if (updates.tags !== undefined) {
    fields.push('tags = ?');
    values.push(JSON.stringify(updates.tags));
  }
  if (updates.avatarUrl !== undefined) {
    fields.push('avatarUrl = ?');
    values.push(updates.avatarUrl);
  }
  
  if (fields.length === 0) return;
  
  values.push(id);
  const stmt = db.prepare(`UPDATE channels SET ${fields.join(', ')} WHERE id = ?`);
  stmt.run(...values);
}

export function deleteChannel(id) {
  const stmt = db.prepare('DELETE FROM channels WHERE id = ?');
  stmt.run(id);
}

// ========== POSTS HISTORY ==========

export function getPostsHistory(tokenHash, limit = null) {
  let query = 'SELECT * FROM posts_history WHERE tokenHash = ? ORDER BY timestamp DESC';
  if (limit) {
    query += ` LIMIT ${limit}`;
  }
  const stmt = db.prepare(query);
  const rows = stmt.all(tokenHash);
  return rows.map(row => ({
    ...row,
    files: row.files ? JSON.parse(row.files) : [],
    channels: JSON.parse(row.channels),
    results: JSON.parse(row.results),
    buttons: row.buttons ? JSON.parse(row.buttons) : [],
    parseMode: row.parseMode || 'HTML'
  }));
}

export function addPostsHistory(history, tokenHash) {
  const stmt = db.prepare(`
    INSERT INTO posts_history (id, tokenHash, text, files, channels, results, timestamp, userId, buttons, parseMode)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  const insertMany = db.transaction((items) => {
    for (const item of items) {
      stmt.run(
        item.id || crypto.randomBytes(16).toString('hex'),
        tokenHash,
        item.text || null,
        JSON.stringify(item.files || []),
        JSON.stringify(item.channels),
        JSON.stringify(item.results),
        item.timestamp,
        item.userId || null,
        JSON.stringify(item.buttons || []),
        item.parseMode || 'HTML'
      );
    }
  });
  
  insertMany(history);
  
  // Очистка старых записей
  cleanupOldPostsHistory(tokenHash);
}

function cleanupOldPostsHistory(tokenHash) {
  const maxHistorySize = parseInt(process.env.MAX_HISTORY_SIZE) || 100;
  const maxAgeDays = parseInt(process.env.MAX_HISTORY_AGE_DAYS) || 30;
  const maxAge = maxAgeDays * 24 * 60 * 60 * 1000;
  const cutoffDate = new Date(Date.now() - maxAge).toISOString();
  
  // Удаляем старые записи
  const deleteOld = db.prepare('DELETE FROM posts_history WHERE tokenHash = ? AND timestamp < ?');
  deleteOld.run(tokenHash, cutoffDate);
  
  // Ограничиваем количество записей
  const stmt = db.prepare(`
    DELETE FROM posts_history 
    WHERE tokenHash = ? 
    AND id NOT IN (
      SELECT id FROM posts_history 
      WHERE tokenHash = ? 
      ORDER BY timestamp DESC 
      LIMIT ?
    )
  `);
  stmt.run(tokenHash, tokenHash, maxHistorySize);
}

export function deleteAllPostsHistory(tokenHash) {
  const stmt = db.prepare('DELETE FROM posts_history WHERE tokenHash = ?');
  stmt.run(tokenHash);
}

export function deleteOldPostsHistory(tokenHash, cutoffDate) {
  const stmt = db.prepare('DELETE FROM posts_history WHERE tokenHash = ? AND timestamp < ?');
  stmt.run(tokenHash, cutoffDate);
}

// ========== TEMPLATES ==========

export function getTemplates(tokenHash) {
  const stmt = db.prepare('SELECT * FROM templates WHERE tokenHash = ? ORDER BY createdAt DESC');
  return stmt.all(tokenHash);
}

export function createTemplate(template) {
  const stmt = db.prepare(`
    INSERT INTO templates (id, tokenHash, text, createdAt)
    VALUES (?, ?, ?, ?)
  `);
  stmt.run(
    template.id || crypto.randomBytes(16).toString('hex'),
    template.tokenHash,
    template.text,
    template.createdAt
  );
  return template;
}

export function deleteTemplate(id) {
  const stmt = db.prepare('DELETE FROM templates WHERE id = ?');
  stmt.run(id);
}

// ========== SCHEDULED POSTS ==========

export function getScheduledPosts(tokenHash) {
  const stmt = db.prepare('SELECT * FROM scheduled_posts WHERE tokenHash = ? ORDER BY scheduledTime');
  const rows = stmt.all(tokenHash);
  return rows.map(row => ({
    ...row,
    files: row.files ? JSON.parse(row.files) : [],
    channels: JSON.parse(row.channels),
    buttons: row.buttons ? JSON.parse(row.buttons) : []
  }));
}

export function getScheduledPostById(id) {
  const stmt = db.prepare('SELECT * FROM scheduled_posts WHERE id = ?');
  const row = stmt.get(id);
  if (row) {
    row.files = row.files ? JSON.parse(row.files) : [];
    row.channels = JSON.parse(row.channels);
    row.buttons = row.buttons ? JSON.parse(row.buttons) : [];
  }
  return row;
}

export function createScheduledPost(post) {
  const stmt = db.prepare(`
    INSERT INTO scheduled_posts (id, tokenHash, text, files, channels, scheduledTime, buttons, createdAt, userId)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    post.id || crypto.randomBytes(16).toString('hex'),
    post.tokenHash,
    post.text || null,
    JSON.stringify(post.files || []),
    JSON.stringify(post.channels),
    post.scheduledTime,
    JSON.stringify(post.buttons || []),
    post.createdAt,
    post.userId || null
  );
  return post;
}

export function updateScheduledPost(id, updates) {
  const fields = [];
  const values = [];
  
  if (updates.text !== undefined) {
    fields.push('text = ?');
    values.push(updates.text);
  }
  if (updates.files !== undefined) {
    fields.push('files = ?');
    values.push(JSON.stringify(updates.files));
  }
  if (updates.channels !== undefined) {
    fields.push('channels = ?');
    values.push(JSON.stringify(updates.channels));
  }
  if (updates.scheduledTime !== undefined) {
    fields.push('scheduledTime = ?');
    values.push(updates.scheduledTime);
  }
  if (updates.buttons !== undefined) {
    fields.push('buttons = ?');
    values.push(JSON.stringify(updates.buttons));
  }
  
  if (fields.length === 0) return;
  
  values.push(id);
  const stmt = db.prepare(`UPDATE scheduled_posts SET ${fields.join(', ')} WHERE id = ?`);
  stmt.run(...values);
}

export function deleteScheduledPost(id) {
  const stmt = db.prepare('DELETE FROM scheduled_posts WHERE id = ?');
  stmt.run(id);
}

// ========== RECURRING POSTS ==========

export function getRecurringPosts(tokenHash) {
  const stmt = db.prepare('SELECT * FROM recurring_posts WHERE tokenHash = ? ORDER BY createdAt DESC');
  const rows = stmt.all(tokenHash);
  return rows.map(row => ({
    ...row,
    files: row.files ? JSON.parse(row.files) : [],
    channels: JSON.parse(row.channels),
    enabled: row.enabled === 1,
    buttons: row.buttons ? JSON.parse(row.buttons) : []
  }));
}

export function getRecurringPostById(id) {
  const stmt = db.prepare('SELECT * FROM recurring_posts WHERE id = ?');
  const row = stmt.get(id);
  if (row) {
    row.files = row.files ? JSON.parse(row.files) : [];
    row.channels = JSON.parse(row.channels);
    row.enabled = row.enabled === 1;
    row.buttons = row.buttons ? JSON.parse(row.buttons) : [];
  }
  return row;
}

export function createRecurringPost(post) {
  const stmt = db.prepare(`
    INSERT INTO recurring_posts (id, tokenHash, text, files, channels, recurrence, time, dayOfWeek, enabled, nextScheduledDate, buttons, createdAt, userId)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    post.id || crypto.randomBytes(16).toString('hex'),
    post.tokenHash,
    post.text || null,
    JSON.stringify(post.files || []),
    JSON.stringify(post.channels),
    post.recurrence,
    post.time,
    post.dayOfWeek || null,
    post.enabled !== false ? 1 : 0,
    post.nextScheduledDate || null,
    JSON.stringify(post.buttons || []),
    post.createdAt,
    post.userId || null
  );
  return post;
}

export function updateRecurringPost(id, updates) {
  const fields = [];
  const values = [];
  
  if (updates.text !== undefined) {
    fields.push('text = ?');
    values.push(updates.text);
  }
  if (updates.files !== undefined) {
    fields.push('files = ?');
    values.push(JSON.stringify(updates.files));
  }
  if (updates.channels !== undefined) {
    fields.push('channels = ?');
    values.push(JSON.stringify(updates.channels));
  }
  if (updates.recurrence !== undefined) {
    fields.push('recurrence = ?');
    values.push(updates.recurrence);
  }
  if (updates.time !== undefined) {
    fields.push('time = ?');
    values.push(updates.time);
  }
  if (updates.dayOfWeek !== undefined) {
    fields.push('dayOfWeek = ?');
    values.push(updates.dayOfWeek);
  }
  if (updates.enabled !== undefined) {
    fields.push('enabled = ?');
    values.push(updates.enabled ? 1 : 0);
  }
  if (updates.nextScheduledDate !== undefined) {
    fields.push('nextScheduledDate = ?');
    values.push(updates.nextScheduledDate);
  }
  if (updates.buttons !== undefined) {
    fields.push('buttons = ?');
    values.push(JSON.stringify(updates.buttons));
  }
  
  if (fields.length === 0) return;
  
  values.push(id);
  const stmt = db.prepare(`UPDATE recurring_posts SET ${fields.join(', ')} WHERE id = ?`);
  stmt.run(...values);
}

export function deleteRecurringPost(id) {
  const stmt = db.prepare('DELETE FROM recurring_posts WHERE id = ?');
  stmt.run(id);
}

// ========== CHANNEL GROUPS ==========

export function getChannelGroups(tokenHash) {
  const stmt = db.prepare('SELECT * FROM channel_groups WHERE tokenHash = ? ORDER BY createdAt DESC');
  const rows = stmt.all(tokenHash);
  return rows.map(row => ({
    ...row,
    channels: JSON.parse(row.channels)
  }));
}

export function createChannelGroup(group) {
  const stmt = db.prepare(`
    INSERT INTO channel_groups (id, tokenHash, name, channels, createdAt)
    VALUES (?, ?, ?, ?, ?)
  `);
  stmt.run(
    group.id || crypto.randomBytes(16).toString('hex'),
    group.tokenHash,
    group.name,
    JSON.stringify(group.channels),
    group.createdAt
  );
  return group;
}

export function deleteChannelGroup(id) {
  const stmt = db.prepare('DELETE FROM channel_groups WHERE id = ?');
  stmt.run(id);
}

// ========== LOGS ==========

export function getLogs(tokenHash, limit = 500) {
  const stmt = db.prepare(`
    SELECT * FROM logs 
    WHERE tokenHash = ? 
    ORDER BY timestamp DESC 
    LIMIT ?
  `);
  const rows = stmt.all(tokenHash, limit);
  return rows.map(row => ({
    ...row,
    data: row.data ? JSON.parse(row.data) : {}
  }));
}

export function addLog(tokenHash, action, data) {
  const stmt = db.prepare(`
    INSERT INTO logs (tokenHash, timestamp, action, data)
    VALUES (?, ?, ?, ?)
  `);
  stmt.run(
    tokenHash,
    new Date().toISOString(),
    action,
    JSON.stringify(data || {})
  );
  
  // Очистка старых логов
  const deleteOld = db.prepare(`
    DELETE FROM logs 
    WHERE tokenHash = ? 
    AND id NOT IN (
      SELECT id FROM logs 
      WHERE tokenHash = ? 
      ORDER BY timestamp DESC 
      LIMIT 500
    )
  `);
  deleteOld.run(tokenHash, tokenHash);
}

// Закрытие БД при завершении процесса
process.on('exit', () => {
  db.close();
});

export default db;

