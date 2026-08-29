const { app, BrowserWindow, ipcMain, Notification, safeStorage, shell } = require('electron');
const fs = require('fs');
const path = require('path');

const POLL_INTERVAL_MS = 60_000;
const WEEKDAYS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
let notificationTimers = [];

// ==============================================================================
// TIER CONFIGURATION AND AGENT MODE STATE
// ==============================================================================
// Minimum tier level required for automated agent mode (must match backend)
const AGENT_MODE_MIN_LEVEL = 3;

// Agent mode state
let companionMode = 'safe'; // 'safe' | 'agent'
let cryptoStorage = null;
let autoModeAllowed = false;
let userTier = 'standard';
let tierLevel = 0;
let tierName = 'Standard';

// Keep the original keyless Companion pairing so an update does not force the
// user to reopen a site that is deliberately in maintenance mode. This is not
// the separate Copilot agent config and it stores only a safeStorage token.
function configPath() { return path.join(app.getPath('userData'), 'companion.json'); }
function readConfig() { try { return JSON.parse(fs.readFileSync(configPath(), 'utf8')); } catch (_) { return {}; } }
function writeConfig(value) { fs.writeFileSync(configPath(), JSON.stringify(value, null, 2), { encoding: 'utf8', mode: 0o600 }); }

function normalizeOrigin(value) {
  const url = new URL(String(value || '').trim());
  const local = ['127.0.0.1', 'localhost', '::1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) throw new Error('Для сайта нужен HTTPS. HTTP разрешён только для localhost в разработке.');
  url.pathname = ''; url.search = ''; url.hash = '';
  return url.toString().replace(/\/$/, '');
}

function getToken(config = readConfig()) {
  if (!config.tokenCiphertext || !safeStorage.isEncryptionAvailable()) return null;
  try { return safeStorage.decryptString(Buffer.from(config.tokenCiphertext, 'base64')); } catch (_) { return null; }
}

function saveToken(origin, token) {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Системное защищённое хранилище недоступно. Привязка не сохранена.');
  const config = readConfig();
  config.origin = normalizeOrigin(origin);
  config.tokenCiphertext = safeStorage.encryptString(token).toString('base64');
  config.pairedAt = new Date().toISOString();
  writeConfig(config);
}

async function requestApi(origin, endpoint, token, options = {}) {
  const response = await fetch(`${origin}${endpoint}`, { ...options, headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { 'X-Airdrop-X-Companion': token } : {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || `Ошибка запроса (${response.status})`);
  return data;
}

function zonedParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short' }).formatToParts(date);
  const out = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  return { year: Number(out.year), month: Number(out.month), day: Number(out.day), hour: Number(out.hour), minute: Number(out.minute), weekday: out.weekday };
}

function localTimeToUtcMs({ year, month, day, hour, minute }, timeZone) {
  let guess = Date.UTC(year, month - 1, day, hour, minute);
  const desired = Date.UTC(year, month - 1, day, hour, minute);
  for (let index = 0; index < 4; index += 1) {
    const actual = zonedParts(new Date(guess), timeZone);
    guess += desired - Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute);
  }
  return guess;
}

function nextWeeklySlot(dayCode, timeText, timeZone, now = new Date()) {
  const [hour, minute] = String(timeText || '12:00').split(':').map(Number);
  const localNow = zonedParts(now, timeZone);
  const delta = ((WEEKDAYS[dayCode] ?? 1) - (WEEKDAYS[localNow.weekday] ?? 1) + 7) % 7;
  let calendar = new Date(Date.UTC(localNow.year, localNow.month - 1, localNow.day + delta));
  let result = localTimeToUtcMs({ year: calendar.getUTCFullYear(), month: calendar.getUTCMonth() + 1, day: calendar.getUTCDate(), hour, minute }, timeZone);
  if (result <= now.getTime()) {
    calendar = new Date(Date.UTC(localNow.year, localNow.month - 1, localNow.day + delta + 7));
    result = localTimeToUtcMs({ year: calendar.getUTCFullYear(), month: calendar.getUTCMonth() + 1, day: calendar.getUTCDate(), hour, minute }, timeZone);
  }
  return result;
}

function nextSlot(task, now = new Date()) {
  const timeZone = task.timezone || 'UTC';
  const rawSlots = task.schedule_mode === 'flexible' ? task.generated_slots : task.schedule_mode === 'custom' ? task.custom_slots : [];
  const candidates = Array.isArray(rawSlots) ? rawSlots.map((slot) => {
    if (!slot || typeof slot !== 'object') return null;
    if (slot.date && slot.time) {
      const [year, month, day] = String(slot.date).split('-').map(Number);
      const [hour, minute] = String(slot.time).split(':').map(Number);
      return localTimeToUtcMs({ year, month, day, hour, minute }, timeZone);
    }
    if (slot.day && slot.time) return nextWeeklySlot(slot.day, slot.time, timeZone, now);
    return null;
  }).filter((value) => Number.isFinite(value) && value > now.getTime()) : [];
  return candidates.length ? Math.min(...candidates) : nextWeeklySlot(task.day_of_week, task.time_of_day, timeZone, now);
}

function scheduleRows(tasks) {
  return tasks.map((task) => ({ scheduleId: task.schedule_id, walletLabel: String(task.wallet_label || 'Кошелёк'), walletAddress: String(task.wallet_address || ''), actionType: String(task.action_type || 'action'), scheduleMode: String(task.schedule_mode || 'fixed'), timezone: String(task.timezone || 'UTC'), nextAt: nextSlot(task) })).sort((left, right) => left.nextAt - right.nextAt);
}

function clearNotifications() { notificationTimers.forEach(clearTimeout); notificationTimers = []; }
function planNotifications(rows) {
  clearNotifications();
  rows.slice(0, 50).forEach((row) => {
    const delay = row.nextAt - Date.now();
    if (delay <= 0 || delay > 2_147_000_000) return;
    notificationTimers.push(setTimeout(() => {
      if (Notification.isSupported()) new Notification({ title: 'AIRDROP-X: напоминание', body: `${row.walletLabel}: время проверить ${row.actionType}. Откройте сайт и подтвердите действие в кошельке вручную.` }).show();
    }, delay));
  });
}

function publicState() {
  const config = readConfig();
  const paired = Boolean(config.origin && getToken(config));
  
  return {
    paired,
    origin: config.origin || 'https://airdrop-x.com',
    pairedAt: config.pairedAt || null,
    tierInfo: paired ? {
      auto_mode_allowed: config.autoModeAllowed || false,
      user_tier: config.userTier || 'standard',
      tier_level: config.tierLevel || 0,
      tier_name: config.tierName || 'Standard'
    } : null
  };
}
async function syncTasks() {
  const config = readConfig(); const token = getToken(config);
  if (!config.origin || !token) return { paired: false, schedules: [] };
  const data = await requestApi(config.origin, '/api/companion/tasks', token);
  const schedules = scheduleRows(Array.isArray(data.tasks) ? data.tasks : []);
  config.lastSyncedAt = new Date().toISOString(); writeConfig(config); planNotifications(schedules);
  return { paired: true, schedules, lastSyncedAt: config.lastSyncedAt, safety: 'Только напоминания. Подпись всегда выполняется вручную в кошельке.' };
}

function createWindow() {
  const window = new BrowserWindow({ width: 900, height: 680, minWidth: 720, minHeight: 520, backgroundColor: '#0b0812', webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  window.removeMenu(); window.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

ipcMain.handle('companion:state', () => publicState());
ipcMain.handle('companion:pair', async (_, { origin, code }) => {
  const safeOrigin = normalizeOrigin(origin);
  const data = await requestApi(safeOrigin, '/api/companion/pair', null, { method: 'POST', body: JSON.stringify({ code: String(code || '').trim() }) });
  if (!data.companion_token) throw new Error('Сайт не вернул данные для безопасной привязки.');
  
  // Extract tier information from pairing response
  autoModeAllowed = data.auto_mode_allowed || false;
  userTier = data.user_tier || 'standard';
  tierLevel = data.tier_level || 0;
  tierName = data.tier_name || 'Standard';
  
  // Save token and tier information
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Системное защищённое хранилище недоступно. Привязка не сохранена.');
  const config = readConfig();
  config.origin = safeOrigin;
  config.tokenCiphertext = safeStorage.encryptString(data.companion_token).toString('base64');
  config.pairedAt = new Date().toISOString();
  config.autoModeAllowed = autoModeAllowed;
  config.userTier = userTier;
  config.tierLevel = tierLevel;
  config.tierName = tierName;
  writeConfig(config);
  
  console.log(`[Tier] Paired with tier: ${tierName} (${userTier}), Level: ${tierLevel}, Auto allowed: ${autoModeAllowed}`);
  
  const syncResult = await syncTasks();
  return {
    ...publicState(),
    ...syncResult,
    tierInfo: {
      auto_mode_allowed: autoModeAllowed,
      user_tier: userTier,
      tier_level: tierLevel,
      tier_name: tierName
    }
  };
});
ipcMain.handle('companion:sync', () => syncTasks());
ipcMain.handle('companion:open-review', async () => shell.openExternal(publicState().origin));
ipcMain.handle('companion:unpair', async () => {
  const config = readConfig(); const token = getToken(config);
  if (config.origin && token) { try { await requestApi(config.origin, '/api/companion/unpair', token, { method: 'POST' }); } catch (_) {} }
  clearNotifications(); writeConfig({}); 
  // Reset tier state on unpair
  autoModeAllowed = false;
  userTier = 'standard';
  tierLevel = 0;
  tierName = 'Standard';
  companionMode = 'safe';
  return publicState();
});

// Agent mode IPC handlers
ipcMain.handle('companion:enable-agent-mode', async (event) => {
  // CRITICAL: Validate tier level before allowing mode change
  if (!autoModeAllowed || tierLevel < AGENT_MODE_MIN_LEVEL) {
    console.error(`[Security] Rejected agent mode activation - tier level ${tierLevel} < ${AGENT_MODE_MIN_LEVEL}`);
    return {
      success: false,
      error: `Premium VIP subscription (Level ${AGENT_MODE_MIN_LEVEL}+) required for agent mode`,
      current_tier: userTier,
      current_level: tierLevel,
      required_level: AGENT_MODE_MIN_LEVEL
    };
  }
  
  if (!safeStorage.isEncryptionAvailable()) {
    return {
      success: false,
      error: 'OS encryption unavailable - cannot enable agent mode'
    };
  }
  
  try {
    companionMode = 'agent';
    // TODO: Initialize crypto storage and agent mode components
    // This will be implemented in later phases
    console.log('[Agent] Agent mode enabled');
    
    return { success: true };
  } catch (error) {
    companionMode = 'safe';
    return {
      success: false,
      error: error.message
    };
  }
});

ipcMain.handle('companion:disable-agent-mode', async (event) => {
  if (companionMode === 'agent') {
    // TODO: Shutdown agent mode components
    companionMode = 'safe';
    console.log('[Agent] Agent mode disabled');
  }
  return { success: true };
});

app.whenReady().then(async () => { createWindow(); await syncTasks().catch(() => {}); setInterval(() => syncTasks().catch(() => {}), POLL_INTERVAL_MS); app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); }); });
app.on('window-all-closed', () => { clearNotifications(); if (process.platform !== 'darwin') app.quit(); });
