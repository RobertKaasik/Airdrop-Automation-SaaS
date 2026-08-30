// ==============================================================================
// INPUT SANITIZATION & XSS PREVENTION
// ==============================================================================

/**
 * Sanitize and validate URL.
 * Only allows https:// and localhost for development.
 */
function sanitizeURL(url) {
    try {
        const parsed = new URL(url);
        const isLocal = ['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname);
        
        if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && isLocal)) {
            throw new Error('Only HTTPS URLs are allowed (HTTP for localhost only)');
        }
        
        return parsed.toString();
    } catch (error) {
        throw new Error('Invalid URL format');
    }
}

/**
 * Sanitize address input (Ethereum addresses).
 */
function sanitizeAddress(address) {
    const cleaned = address.trim();
    
    if (!/^0x[a-fA-F0-9]{40}$/.test(cleaned)) {
        throw new Error('Invalid Ethereum address format');
    }
    
    return cleaned.toLowerCase();
}

/**
 * Safe render: Always use textContent for untrusted data.
 */
function safeSetText(element, text) {
    if (element) {
        element.textContent = String(text);
    }
}

// ==============================================================================
// END INPUT SANITIZATION
// ==============================================================================

const $ = (id) => document.getElementById(id);

const LOCALES = {
  ru: {
    intl: 'ru-RU', subtitle: 'Календарь и локальные напоминания по вашим расписаниям.',
    manual: 'Ручное подтверждение', pairTitle: 'Подключить к аккаунту',
    pairDescription: 'На сайте откройте «Настройки», создайте одноразовый код привязки и введите его здесь в течение 5 минут.',
    origin: 'Адрес сайта', code: 'Одноразовый код', codePlaceholder: 'Например: 6BC352F310',
    pair: 'Подключить', pairing: 'Подключение…',
    planLabel: 'ТАРИФ АККАУНТА', calendarLabel: 'КАЛЕНДАРЬ', calendarTitle: 'Календарь напоминаний',
    readOnly: 'ТОЛЬКО ПРОСМОТР', sync: 'Синхронизировать', syncing: 'Синхронизация…',
    synced: 'Синхронизировано: {time}', syncError: 'Ошибка синхронизации: {error}',
    review: 'Открыть сайт для проверки', unpair: 'Отключить приложение',
    security: 'Безопасность:',
    safety: ' приложение работает только с публичными расписаниями. Для обмена, моста или Lending откройте сайт, проверьте маршрут и подтвердите действие вручную в своём кошельке.',
    active: 'Активен', grace: 'Льготный период', inactive: 'Неактивен',
    unknown: 'Не удалось определить', expires: 'Действует до {time}', nextSync: 'Статус обновится при синхронизации.',
    empty: 'Активных расписаний пока нет. Создайте их на сайте — здесь появятся напоминания.',
    reminder: 'Следующее напоминание: {time} ({timezone})',
  },
  en: {
    intl: 'en-US', subtitle: 'Calendar and local reminders for your schedules.',
    manual: 'Manual confirmation', pairTitle: 'Connect your account',
    pairDescription: 'On the website, open Settings, create a one-time pairing code, and enter it here within 5 minutes.',
    origin: 'Website address', code: 'One-time code', codePlaceholder: 'Example: 6BC352F310',
    pair: 'Connect', pairing: 'Connecting…',
    planLabel: 'ACCOUNT PLAN', calendarLabel: 'CALENDAR', calendarTitle: 'Reminder calendar',
    readOnly: 'READ-ONLY', sync: 'Synchronize', syncing: 'Synchronizing…',
    synced: 'Synchronized: {time}', syncError: 'Synchronization error: {error}',
    review: 'Open website to review', unpair: 'Disconnect application',
    security: 'Security:',
    safety: ' the app only uses public schedules. For swap, bridge, or lending, open the website, review the route, and confirm in your wallet.',
    active: 'Active', grace: 'Grace period', inactive: 'Inactive',
    unknown: 'Could not determine', expires: 'Active until {time}', nextSync: 'Status will update after sync.',
    empty: 'There are no active schedules yet. Create them on the website — reminders will appear here.',
    reminder: 'Next reminder: {time} ({timezone})',
  },
  zh: {
    intl: 'zh-CN', subtitle: '查看日历和本地日程提醒。',
    manual: '手动确认', pairTitle: '连接账户',
    pairDescription: '请在网站的“设置”中创建一次性配对代码，并在 5 分钟内输入到这里。',
    origin: '网站地址', code: '一次性代码', codePlaceholder: '例如：6BC352F310',
    pair: '连接', pairing: '正在连接…',
    planLabel: '账户套餐', calendarLabel: '日历', calendarTitle: '提醒日历',
    readOnly: '只读', sync: '同步', syncing: '正在同步…',
    synced: '已同步：{time}', syncError: '同步错误：{error}',
    review: '打开网站查看', unpair: '断开应用连接',
    security: '安全：',
    safety: ' 应用只使用公开日程。兑换、跨链或借贷请在网站核对路线，并在钱包中手动确认。',
    active: '有效', grace: '宽限期', inactive: '未激活',
    unknown: '无法确定', expires: '有效期至 {time}', nextSync: '同步后将更新状态。',
    empty: '暂无活跃日程。请在网站上创建，提醒将显示在这里。',
    reminder: '下次提醒：{time}（{timezone}）',
  },
};

let currentLocale = localStorage.getItem('airdropx-companion-locale') || 'ru';
if (!LOCALES[currentLocale]) currentLocale = 'ru';
let latestSchedules = [];
let latestSubscription = null;
let lastSyncedAt = null;
let lastSyncError = '';

function t(key, values = {}) {
    return String(LOCALES[currentLocale][key] || LOCALES.en[key] || key).replace(/\{(\w+)\}/g, (_, name) => values[name] ?? '');
}

function setLabel(id, value) {
    const label = $(id);
    const node = label && Array.from(label.childNodes).find((child) => child.nodeType === Node.TEXT_NODE);
    if (node) node.nodeValue = value;
}

function applyLocale(locale) {
    if (!LOCALES[locale]) return;
    currentLocale = locale;
    localStorage.setItem('airdropx-companion-locale', locale);
    document.documentElement.lang = currentLocale;
    if ($('subtitle')) $('subtitle').textContent = t('subtitle');
    if ($('safetyChip')) $('safetyChip').textContent = t('manual');
    if ($('pairTitle')) $('pairTitle').textContent = t('pairTitle');
    if ($('pairDescription')) $('pairDescription').textContent = t('pairDescription');
    setLabel('originLabel', t('origin'));
    setLabel('pairCodeLabel', t('code'));
    if ($('pairCode')) $('pairCode').placeholder = t('codePlaceholder');
    if ($('pairButton')) $('pairButton').textContent = t('pair');
    if ($('planLabel')) $('planLabel').textContent = t('planLabel');
    if ($('calendarLabel')) $('calendarLabel').textContent = t('calendarLabel');
    if ($('calendarTitle')) $('calendarTitle').textContent = t('calendarTitle');
    if ($('readOnly')) $('readOnly').textContent = t('readOnly');
    if ($('syncButton')) $('syncButton').textContent = t('sync');
    if ($('reviewButton')) $('reviewButton').textContent = t('review');
    if ($('unpairButton')) $('unpairButton').textContent = t('unpair');
    if ($('safetyTitle')) $('safetyTitle').textContent = t('security');
    if ($('safetyText')) $('safetyText').textContent = t('safety');
    document.querySelectorAll('[data-locale]').forEach((button) => {
        const active = button.dataset.locale === currentLocale;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-pressed', String(active));
    });
    renderSubscription(latestSubscription, { tier_name: tierName });
    renderSchedules(latestSchedules);
    if ($('syncStatus')) {
        if (lastSyncError) $('syncStatus').textContent = t('syncError', { error: lastSyncError });
        else if (lastSyncedAt) $('syncStatus').textContent = t('synced', { time: formatWhen(lastSyncedAt, Intl.DateTimeFormat().resolvedOptions().timeZone) });
    }
}

function renderSubscription(subscription, tierInfo = null) {
    if (!$('planName')) return;
    const plan = subscription?.plan || tierInfo?.tier_name || tierName || '';
    const rawStatus = subscription?.status;
    const status = (rawStatus === 'active' || rawStatus === 'grace' || rawStatus === 'expired')
        ? rawStatus
        : (plan ? 'active' : 'unknown');
    $('planName').textContent = plan || t('unknown');
    if ($('planStatus')) {
        $('planStatus').textContent = status === 'active' ? t('active') : status === 'grace' ? t('grace') : t('inactive');
        $('planStatus').className = `plan-status ${status === 'active' || status === 'grace' ? 'active' : 'inactive'}`;
    }
    const expiresAt = subscription?.expiresAt || subscription?.expires_at;
    if ($('planMeta')) {
        $('planMeta').textContent = expiresAt
            ? t('expires', { time: formatWhen(expiresAt * 1000, Intl.DateTimeFormat().resolvedOptions().timeZone) })
            : (plan ? '' : t('nextSync'));
    }
}

// Global tier state
let autoModeAllowed = false;
let userTier = 'standard';
let tierLevel = 0;
let tierName = 'Standard';
let companionMode = 'safe';

// Tier badge colors by level
const TIER_COLORS = {
    0: '#999',      // Free
    1: '#999',      // Standard
    2: '#6c757d',   // PRO Farmer
    3: '#ffc107',   // Premium VIP
    4: '#ff9800',   // VIP Ultimate
    5: '#9c27b0',   // Whale
    6: '#e91e63'    // Enterprise
};

function message(text, error = false) {
    $('pairMessage').textContent = text || '';
    $('pairMessage').className = error ? 'error' : '';
}

function formatWhen(epoch, timeZone) {
    const date = new Date(epoch);
    if (Number.isNaN(date.getTime())) return '—';
    try {
        return new Intl.DateTimeFormat(LOCALES[currentLocale].intl, {
            dateStyle: 'medium',
            timeStyle: 'short',
            timeZone
        }).format(date);
    } catch (_) {
        return date.toLocaleString(LOCALES[currentLocale].intl);
    }
}

function renderSchedules(schedules = []) {
    const list = $('scheduleList');
    if (!list) return;
    latestSchedules = Array.isArray(schedules) ? schedules : [];
    list.replaceChildren();
    if (!latestSchedules.length) {
        const empty = document.createElement('div');
        empty.className = 'empty';
        empty.textContent = t('empty');
        list.append(empty);
        return;
    }
    latestSchedules.forEach((schedule) => {
        const item = document.createElement('article');
        item.className = 'schedule';
        const title = document.createElement('strong');
        title.textContent = schedule.walletLabel;
        const address = document.createElement('span');
        address.textContent = schedule.walletAddress;
        const details = document.createElement('p');
        details.textContent = `${schedule.actionType} · ${schedule.scheduleMode} · ${schedule.timezone}`;
        const when = document.createElement('p');
        when.className = 'next';
        when.textContent = t('reminder', {
            time: formatWhen(schedule.nextAt, schedule.timezone),
            timezone: schedule.timezone
        });
        item.append(title, address, details, when);
        list.append(item);
    });
}

async function updateModeToggleUI() {
    const toggle = $('agent-mode-toggle');
    const lockMessage = $('tier-lock-message');
    const toggleStatus = $('toggle-status');
    const tierBadge = $('tier-badge');
    const currentTierName = $('current-tier-name');
    const agentModeInfo = $('agent-mode-info');
    
    // Update tier badge
    tierBadge.textContent = tierName;
    tierBadge.style.backgroundColor = TIER_COLORS[tierLevel] || '#999';
    
    if (!autoModeAllowed || tierLevel < 3) {
        // Show locked state for non-premium users (level 0-2)
        toggle.disabled = true;
        toggle.checked = false;
        lockMessage.hidden = false;
        agentModeInfo.hidden = true;
        toggleStatus.textContent = '🔒 Заблокировано';
        toggleStatus.className = 'toggle-label locked';
        if (currentTierName) {
            currentTierName.textContent = `${tierName} (Уровень ${tierLevel})`;
        }
    } else {
        // Enable toggle for premium users (level 3+)
        toggle.disabled = false;
        lockMessage.hidden = true;
        agentModeInfo.hidden = false;
        toggleStatus.textContent = companionMode === 'agent' ? '✓ Включено' : 'Отключено';
        toggleStatus.className = companionMode === 'agent' ?
            'toggle-label enabled' : 'toggle-label';
    }
}

function openModal(modal) {
    if (!modal) return;
    modal.hidden = false;
    modal.classList.add('is-open');
    modal.style.display = 'flex';
}

function closeModal(modal) {
    if (!modal) return;
    modal.classList.remove('is-open');
    modal.hidden = true;
    modal.style.display = 'none';
}

function showVIPConsentDialog() {
    return new Promise((resolve) => {
        const modal = $('vip-consent');
        const checkbox = $('consent-checkbox');
        const acceptBtn = $('accept-btn');
        const cancelBtn = $('cancel-btn');
        
        openModal(modal);
        acceptBtn.disabled = true;
        checkbox.checked = false;
        
        const onCheck = () => {
            acceptBtn.disabled = !checkbox.checked;
        };
        checkbox.addEventListener('change', onCheck);
        
        const cleanup = () => {
            closeModal(modal);
            checkbox.removeEventListener('change', onCheck);
        };
        
        acceptBtn.addEventListener('click', () => {
            cleanup();
            resolve(true);
        }, { once: true });
        
        cancelBtn.addEventListener('click', () => {
            cleanup();
            resolve(false);
        }, { once: true });
    });
}

async function handleToggleChange(event) {
    if (event.target.checked) {
        // Show VIP consent dialog
        const consent = await showVIPConsentDialog();
        if (consent) {
            const result = await window.companion.enableAgentMode();
            if (!result.success) {
                alert(`Не удалось включить режим агента: ${result.error}`);
                event.target.checked = false;
            } else {
                companionMode = 'agent';
                await updateModeToggleUI();
            }
        } else {
            event.target.checked = false;
        }
    } else {
        await window.companion.disableAgentMode();
        companionMode = 'safe';
        await updateModeToggleUI();
    }
}

async function sync() {
    lastSyncError = '';
    $('syncStatus').textContent = t('syncing');
    try {
        const data = await window.companion.sync();
        if (data.tierInfo) {
            autoModeAllowed = data.tierInfo.auto_mode_allowed || false;
            userTier = data.tierInfo.user_tier || 'standard';
            tierLevel = data.tierInfo.tier_level || 0;
            tierName = data.tierInfo.tier_name || 'Standard';
            await updateModeToggleUI();
            const toggle = $('agent-mode-toggle');
            if (toggle && autoModeAllowed && tierLevel >= 3) {
                toggle.onchange = handleToggleChange;
            }
        }
        latestSubscription = (data.subscription && data.subscription.plan)
            ? data.subscription
            : {
                plan: (data.tierInfo && data.tierInfo.tier_name) || tierName,
                status: (data.subscription && data.subscription.status) || 'active',
                expiresAt: (data.subscription && (data.subscription.expiresAt || data.subscription.expires_at)) || null
            };
        lastSyncedAt = data.lastSyncedAt || new Date().toISOString();
        renderSubscription(latestSubscription, data.tierInfo);
        renderSchedules(data.schedules);
        $('syncStatus').textContent = t('synced', {
            time: formatWhen(lastSyncedAt, Intl.DateTimeFormat().resolvedOptions().timeZone)
        });
    } catch (error) {
        lastSyncError = error.message || '—';
        $('syncStatus').textContent = t('syncError', { error: lastSyncError });
    }
}

async function showState() {
    const state = await window.companion.getState();
    
    // Update tier information if available
    if (state.paired && state.tierInfo) {
        autoModeAllowed = state.tierInfo.auto_mode_allowed || false;
        userTier = state.tierInfo.user_tier || 'standard';
        tierLevel = state.tierInfo.tier_level || 0;
        tierName = state.tierInfo.tier_name || 'Standard';
        
        console.log(`[UI] Tier: ${tierName} (${userTier}), Level: ${tierLevel}, Auto allowed: ${autoModeAllowed}`);
        
        await updateModeToggleUI();
        
        // Set up toggle listener for premium users
        if (autoModeAllowed && tierLevel >= 3) {
            $('agent-mode-toggle').onchange = handleToggleChange;
        }
    }
    
    $('origin').value = state.origin || 'https://airdrop-x.com';
    $('pairingCard').classList.toggle('hidden', state.paired);
    $('dashboardCard').classList.toggle('hidden', !state.paired);
    latestSubscription = state.subscription || latestSubscription;
    if (state.paired) {
        renderSubscription(latestSubscription, state.tierInfo);
        await sync();
    }
}

// Event listeners
document.querySelectorAll('[data-locale]').forEach((button) => {
    button.addEventListener('click', () => applyLocale(button.dataset.locale));
});

$('pairButton').addEventListener('click', async () => {
    $('pairButton').disabled = true;
    message(t('pairing'));
    try {
        const result = await window.companion.pair({
            origin: $('origin').value,
            code: $('pairCode').value
        });
        
        // Store tier information from pairing response
        if (result.tierInfo) {
            autoModeAllowed = result.tierInfo.auto_mode_allowed || false;
            userTier = result.tierInfo.user_tier || 'standard';
            tierLevel = result.tierInfo.tier_level || 0;
            tierName = result.tierInfo.tier_name || 'Standard';
        }
        
        message('');
        await showState();
    } catch (error) {
        message(error.message || 'Не удалось подключить приложение.', true);
    } finally {
        $('pairButton').disabled = false;
    }
});

$('syncButton').addEventListener('click', sync);
$('reviewButton').addEventListener('click', () => window.companion.openReview());
$('unpairButton').addEventListener('click', async () => {
    if (!confirm('Отключить приложение?')) return;
    await window.companion.unpair();
    latestSchedules = [];
    latestSubscription = null;
    lastSyncedAt = null;
    lastSyncError = '';
    await showState();
});

// Handle upgrade button click
const upgradeBtn = $('upgrade-btn');
if (upgradeBtn) {
    upgradeBtn.addEventListener('click', () => {
        window.companion.openReview();
    });
}

// ==============================================================================
// KEY IMPORT FUNCTIONALITY
// ==============================================================================

const importKeysBtn = $('import-keys-btn');
const viewWalletsBtn = $('view-wallets-btn');
const keyImportModal = $('key-import-modal');
const importSubmitBtn = $('import-submit-btn');
const importCancelBtn = $('import-cancel-btn');
const keyImportTextarea = $('key-import-textarea');
const importStatus = $('import-status');
const importStatusText = $('import-status-text');

const walletsModal = $('wallets-modal');
const walletsCloseBtn = $('wallets-close-btn');
const clearAllKeysBtn = $('clear-all-keys-btn');
const walletsList = $('wallets-list');
const walletCountSpan = $('wallet-count');

// Open key import modal
importKeysBtn?.addEventListener('click', () => {
    openModal(keyImportModal);
    keyImportTextarea.value = '';
    importStatus.style.display = 'none';
});

// Cancel key import
importCancelBtn?.addEventListener('click', () => {
    closeModal(keyImportModal);
});

// Submit key import
importSubmitBtn?.addEventListener('click', async () => {
    const text = keyImportTextarea.value.trim();
    
    if (!text) {
        showImportStatus('Пожалуйста, введите хотя бы один приватный ключ', 'error');
        return;
    }
    
    importSubmitBtn.disabled = true;
    importSubmitBtn.textContent = 'Импортирование...';
    
    try {
        // Parse input - could be private keys (one per line) or seed phrase
        const lines = text.split('\n').map(line => line.trim()).filter(line => line);
        
        // Check if it looks like a seed phrase (12 or 24 words)
        const words = text.split(/\s+/).filter(w => w);
        const isSeedPhrase = words.length === 12 || words.length === 24;
        
        let result;
        if (isSeedPhrase) {
            // Import as seed phrase
            result = await window.companion.importSeedPhrase(text);
        } else {
            // Import as private keys
            result = await window.companion.importPrivateKeys(lines);
        }
        
        if (result.success) {
            showImportStatus(`Успешно импортировано ${result.count} кошельков`, 'success');
            keyImportTextarea.value = '';
            await updateWalletCount();
            
            setTimeout(() => {
                closeModal(keyImportModal);
            }, 2000);
        } else {
            showImportStatus(`Ошибка: ${result.error}`, 'error');
        }
    } catch (error) {
        showImportStatus(`Ошибка: ${error.message}`, 'error');
    } finally {
        importSubmitBtn.disabled = false;
        importSubmitBtn.textContent = 'Импортировать ключи';
    }
});

function showImportStatus(message, type) {
    importStatusText.textContent = message;
    importStatusText.style.color = type === 'error' ? '#ff4444' : '#44ff44';
    importStatus.style.display = 'block';
}

// View wallets
viewWalletsBtn?.addEventListener('click', async () => {
    await loadWalletsList();
    openModal(walletsModal);
});

// Close wallets modal
walletsCloseBtn?.addEventListener('click', () => {
    closeModal(walletsModal);
});

// Clear all keys
clearAllKeysBtn?.addEventListener('click', async () => {
    if (!confirm('Вы уверены, что хотите удалить все импортированные ключи? Это действие нельзя отменить.')) {
        return;
    }
    
    try {
        const result = await window.companion.clearAllKeys();
        if (result.success) {
            await loadWalletsList();
            await updateWalletCount();
            alert('Все ключи успешно удалены');
        } else {
            alert(`Ошибка: ${result.error}`);
        }
    } catch (error) {
        alert(`Ошибка: ${error.message}`);
    }
});

async function loadWalletsList() {
    try {
        const result = await window.companion.listWallets();
        
        if (!result.success) {
            walletsList.textContent = '';
            const err = document.createElement('p');
            err.style.color = '#ff4444';
            err.textContent = `Ошибка: ${result.error}`;
            walletsList.appendChild(err);
            return;
        }
        
        const addresses = (result.addresses || []).map((item) =>
            typeof item === 'string' ? item : (item && item.address) || ''
        ).filter(Boolean);
        
        if (addresses.length === 0) {
            walletsList.textContent = '';
            const empty = document.createElement('p');
            empty.textContent = 'Кошельки еще не импортированы.';
            walletsList.appendChild(empty);
            return;
        }
        
        walletsList.textContent = '';
        addresses.forEach((addr, index) => {
            const row = document.createElement('div');
            row.style.cssText = 'padding: 10px; border-bottom: 1px solid #333; display: flex; justify-content: space-between; align-items: center;';
            const info = document.createElement('div');
            const title = document.createElement('strong');
            title.textContent = `Кошелек ${index + 1}`;
            const code = document.createElement('code');
            code.style.fontSize = '12px';
            code.textContent = addr;
            info.appendChild(title);
            info.appendChild(document.createElement('br'));
            info.appendChild(code);
            const btn = document.createElement('button');
            btn.className = 'danger';
            btn.style.cssText = 'padding: 5px 10px; font-size: 12px;';
            btn.textContent = 'Удалить';
            btn.addEventListener('click', () => window.removeWallet(addr));
            row.appendChild(info);
            row.appendChild(btn);
            walletsList.appendChild(row);
        });
    } catch (error) {
        walletsList.textContent = '';
        const p = document.createElement('p');
        p.style.color = '#ff4444';
        p.textContent = `Ошибка: ${error.message}`;
        walletsList.appendChild(p);
    }
}

async function updateWalletCount() {
    try {
        const result = await window.companion.listWallets();
        if (result.success && walletCountSpan) {
            walletCountSpan.textContent = result.addresses?.length || 0;
        }
    } catch (error) {
        console.error('Failed to update wallet count:', error);
    }
}

// Make removeWallet available globally for inline onclick
window.removeWallet = async function(address) {
    if (!confirm(`Удалить кошелек ${address}?`)) {
        return;
    }
    
    try {
        const result = await window.companion.removeWallet(address);
        if (result.success) {
            await loadWalletsList();
            await updateWalletCount();
        } else {
            alert(`Ошибка: ${result.error}`);
        }
    } catch (error) {
        alert(`Ошибка: ${error.message}`);
    }
};

// Update wallet count when showing state
async function showStateWithWalletCount() {
    await showState();
    const agentModeInfo = $('agent-mode-info');
    if (agentModeInfo && !agentModeInfo.hidden) {
        await updateWalletCount();
    }
}

// ==============================================================================
// END KEY IMPORT FUNCTIONALITY
// ==============================================================================

applyLocale(currentLocale);
showState().catch((error) => message(error.message, true));
