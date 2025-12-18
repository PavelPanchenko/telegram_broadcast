import { initDatabase, createUser, createToken, createChannel, addPostsHistory, createTemplate, createScheduledPost, createRecurringPost, createChannelGroup, addLog } from './db.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Функция для получения хэша токена
function getTokenHashSync(token) {
  return crypto.createHash('md5').update(token).digest('hex').substring(0, 8);
}

// Функции для получения путей к файлам
function getChannelsFile(tokenHash) {
  return path.join(__dirname, 'data', `channels-${tokenHash}.json`);
}

function getPostsHistoryFile(tokenHash) {
  return path.join(__dirname, 'data', `posts-history-${tokenHash}.json`);
}

function getTemplatesFile(tokenHash) {
  return path.join(__dirname, 'data', `templates-${tokenHash}.json`);
}

function getScheduledPostsFile(tokenHash) {
  return path.join(__dirname, 'data', `scheduled-posts-${tokenHash}.json`);
}

function getRecurringPostsFile(tokenHash) {
  return path.join(__dirname, 'data', `recurring-posts-${tokenHash}.json`);
}

function getChannelGroupsFile(tokenHash) {
  return path.join(__dirname, 'data', `channel-groups-${tokenHash}.json`);
}

function getLogsFile(tokenHash) {
  return path.join(__dirname, 'data', `logs-${tokenHash}.json`);
}

console.log('🚀 Starting migration from JSON to SQLite...\n');

// Инициализация БД
initDatabase();

let migratedCount = 0;

// 1. Миграция пользователей
console.log('📦 Migrating users...');
try {
  const usersFile = path.join(__dirname, 'users.json');
  if (fs.existsSync(usersFile)) {
    const users = JSON.parse(fs.readFileSync(usersFile, 'utf8'));
    for (const user of users) {
      try {
        createUser(user);
        migratedCount++;
      } catch (error) {
        console.error(`  ⚠️  Error migrating user ${user.username}:`, error.message);
      }
    }
    console.log(`  ✅ Migrated ${users.length} users`);
  } else {
    // Создаем дефолтного пользователя
    const defaultUser = {
      id: crypto.randomBytes(16).toString('hex'),
      username: 'admin',
      password: crypto.createHash('sha256').update('admin').digest('hex'),
      name: 'Администратор',
      role: 'admin',
      createdAt: new Date().toISOString()
    };
    createUser(defaultUser);
    console.log('  ✅ Created default admin user (username: admin, password: admin)');
  }
} catch (error) {
  console.error('  ❌ Error migrating users:', error);
}

// 2. Миграция токенов
console.log('\n📦 Migrating tokens...');
try {
  const tokensFile = path.join(__dirname, 'tokens.json');
  if (fs.existsSync(tokensFile)) {
    const tokens = JSON.parse(fs.readFileSync(tokensFile, 'utf8'));
    for (const token of tokens) {
      try {
        createToken(token);
        migratedCount++;
      } catch (error) {
        console.error(`  ⚠️  Error migrating token ${token.name}:`, error.message);
      }
    }
    console.log(`  ✅ Migrated ${tokens.length} tokens`);
  }
} catch (error) {
  console.error('  ❌ Error migrating tokens:', error);
}

// 3. Миграция данных для каждого токена
console.log('\n📦 Migrating token-specific data...');

const tokensFile = path.join(__dirname, 'tokens.json');
if (fs.existsSync(tokensFile)) {
  const tokens = JSON.parse(fs.readFileSync(tokensFile, 'utf8'));
  
  for (const tokenData of tokens) {
    const tokenHash = getTokenHashSync(tokenData.token);
    console.log(`\n  Processing token: ${tokenData.name} (${tokenHash})`);
    
    // Каналы
    try {
      const channelsFile = getChannelsFile(tokenHash);
      if (fs.existsSync(channelsFile)) {
        const channels = JSON.parse(fs.readFileSync(channelsFile, 'utf8'));
        for (const channel of channels) {
          try {
            createChannel({
              ...channel,
              tokenHash
            });
            migratedCount++;
          } catch (error) {
            console.error(`    ⚠️  Error migrating channel ${channel.id}:`, error.message);
          }
        }
        console.log(`    ✅ Migrated ${channels.length} channels`);
      }
    } catch (error) {
      console.error(`    ❌ Error migrating channels:`, error);
    }
    
    // История постов
    try {
      const postsHistoryFile = getPostsHistoryFile(tokenHash);
      if (fs.existsSync(postsHistoryFile)) {
        const history = JSON.parse(fs.readFileSync(postsHistoryFile, 'utf8'));
        if (history.length > 0) {
          addPostsHistory(history, tokenHash);
          migratedCount += history.length;
          console.log(`    ✅ Migrated ${history.length} posts history entries`);
        }
      }
    } catch (error) {
      console.error(`    ❌ Error migrating posts history:`, error);
    }
    
    // Шаблоны
    try {
      const templatesFile = getTemplatesFile(tokenHash);
      if (fs.existsSync(templatesFile)) {
        const templates = JSON.parse(fs.readFileSync(templatesFile, 'utf8'));
        for (const template of templates) {
          try {
            createTemplate({
              ...template,
              tokenHash
            });
            migratedCount++;
          } catch (error) {
            console.error(`    ⚠️  Error migrating template ${template.id}:`, error.message);
          }
        }
        console.log(`    ✅ Migrated ${templates.length} templates`);
      }
    } catch (error) {
      console.error(`    ❌ Error migrating templates:`, error);
    }
    
    // Запланированные посты
    try {
      const scheduledPostsFile = getScheduledPostsFile(tokenHash);
      if (fs.existsSync(scheduledPostsFile)) {
        const posts = JSON.parse(fs.readFileSync(scheduledPostsFile, 'utf8'));
        for (const post of posts) {
          try {
            createScheduledPost({
              ...post,
              tokenHash
            });
            migratedCount++;
          } catch (error) {
            console.error(`    ⚠️  Error migrating scheduled post ${post.id}:`, error.message);
          }
        }
        console.log(`    ✅ Migrated ${posts.length} scheduled posts`);
      }
    } catch (error) {
      console.error(`    ❌ Error migrating scheduled posts:`, error);
    }
    
    // Автоматические посты
    try {
      const recurringPostsFile = getRecurringPostsFile(tokenHash);
      if (fs.existsSync(recurringPostsFile)) {
        const posts = JSON.parse(fs.readFileSync(recurringPostsFile, 'utf8'));
        for (const post of posts) {
          try {
            createRecurringPost({
              ...post,
              tokenHash
            });
            migratedCount++;
          } catch (error) {
            console.error(`    ⚠️  Error migrating recurring post ${post.id}:`, error.message);
          }
        }
        console.log(`    ✅ Migrated ${posts.length} recurring posts`);
      }
    } catch (error) {
      console.error(`    ❌ Error migrating recurring posts:`, error);
    }
    
    // Группы каналов
    try {
      const channelGroupsFile = getChannelGroupsFile(tokenHash);
      if (fs.existsSync(channelGroupsFile)) {
        const groups = JSON.parse(fs.readFileSync(channelGroupsFile, 'utf8'));
        for (const group of groups) {
          try {
            createChannelGroup({
              ...group,
              tokenHash
            });
            migratedCount++;
          } catch (error) {
            console.error(`    ⚠️  Error migrating channel group ${group.id}:`, error.message);
          }
        }
        console.log(`    ✅ Migrated ${groups.length} channel groups`);
      }
    } catch (error) {
      console.error(`    ❌ Error migrating channel groups:`, error);
    }
    
    // Логи
    try {
      const logsFile = getLogsFile(tokenHash);
      if (fs.existsSync(logsFile)) {
        const logs = JSON.parse(fs.readFileSync(logsFile, 'utf8'));
        for (const log of logs) {
          try {
            addLog(tokenHash, log.action, log.data);
            migratedCount++;
          } catch (error) {
            console.error(`    ⚠️  Error migrating log:`, error.message);
          }
        }
        console.log(`    ✅ Migrated ${logs.length} logs`);
      }
    } catch (error) {
      console.error(`    ❌ Error migrating logs:`, error);
    }
  }
}

// Обработка старых файлов (без tokenHash)
console.log('\n📦 Migrating legacy files (without tokenHash)...');

// Старые файлы каналов
try {
  const oldChannelsFile = path.join(__dirname, 'channels.json');
  if (fs.existsSync(oldChannelsFile)) {
    const channels = JSON.parse(fs.readFileSync(oldChannelsFile, 'utf8'));
    for (const channel of channels) {
      try {
        createChannel({
          ...channel,
          tokenHash: 'default'
        });
        migratedCount++;
      } catch (error) {
        console.error(`  ⚠️  Error migrating legacy channel ${channel.id}:`, error.message);
      }
    }
    console.log(`  ✅ Migrated ${channels.length} legacy channels`);
  }
} catch (error) {
  console.error('  ❌ Error migrating legacy channels:', error);
}

// Старые файлы истории постов
try {
  const oldPostsHistoryFile = path.join(__dirname, 'posts-history.json');
  if (fs.existsSync(oldPostsHistoryFile)) {
    const history = JSON.parse(fs.readFileSync(oldPostsHistoryFile, 'utf8'));
    if (history.length > 0) {
      addPostsHistory(history, 'default');
      migratedCount += history.length;
      console.log(`  ✅ Migrated ${history.length} legacy posts history entries`);
    }
  }
} catch (error) {
  console.error('  ❌ Error migrating legacy posts history:', error);
}

// Старые файлы шаблонов
try {
  const oldTemplatesFile = path.join(__dirname, 'templates.json');
  if (fs.existsSync(oldTemplatesFile)) {
    const templates = JSON.parse(fs.readFileSync(oldTemplatesFile, 'utf8'));
    for (const template of templates) {
      try {
        createTemplate({
          ...template,
          tokenHash: 'default'
        });
        migratedCount++;
      } catch (error) {
        console.error(`  ⚠️  Error migrating legacy template ${template.id}:`, error.message);
      }
    }
    console.log(`  ✅ Migrated ${templates.length} legacy templates`);
  }
} catch (error) {
  console.error('  ❌ Error migrating legacy templates:', error);
}

// Старые файлы запланированных постов
try {
  const oldScheduledPostsFile = path.join(__dirname, 'scheduled-posts.json');
  if (fs.existsSync(oldScheduledPostsFile)) {
    const posts = JSON.parse(fs.readFileSync(oldScheduledPostsFile, 'utf8'));
    for (const post of posts) {
      try {
        createScheduledPost({
          ...post,
          tokenHash: 'default'
        });
        migratedCount++;
      } catch (error) {
        console.error(`  ⚠️  Error migrating legacy scheduled post ${post.id}:`, error.message);
      }
    }
    console.log(`  ✅ Migrated ${posts.length} legacy scheduled posts`);
  }
} catch (error) {
  console.error('  ❌ Error migrating legacy scheduled posts:', error);
}

// Старые файлы логов
try {
  const oldLogsFile = path.join(__dirname, 'logs.json');
  if (fs.existsSync(oldLogsFile)) {
    const logs = JSON.parse(fs.readFileSync(oldLogsFile, 'utf8'));
    for (const log of logs) {
      try {
        addLog('default', log.action, log.data);
        migratedCount++;
      } catch (error) {
        console.error(`  ⚠️  Error migrating legacy log:`, error.message);
      }
    }
    console.log(`  ✅ Migrated ${logs.length} legacy logs`);
  }
} catch (error) {
  console.error('  ❌ Error migrating legacy logs:', error);
}

console.log(`\n✨ Migration completed! Migrated ${migratedCount} records.`);
console.log('\n📝 Note: Original JSON files are preserved. You can delete them after verifying the migration.');

