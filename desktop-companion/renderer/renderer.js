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
    try {
        return new Intl.DateTimeFormat('ru-RU', {
            dateStyle: 'medium',
            timeStyle: 'short',
            timeZone
        }).format(new Date(epoch));
    } catch (_) {
        return new Date(epoch).toLocaleString('ru-RU');
    }
}

function renderSchedules(schedules = []) {
    const list = $('scheduleList');
    list.replaceChildren();
    if (!schedules.length) {
        const empty = document.createElement('div');
        empty.className = 'empty';
        empty.textContent = 'Активных расписаний пока нет. Создайте их на сайте — здесь появятся напоминания.';
        list.append(empty);
        return;
    }
    schedules.forEach((schedule) => {
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
        when.textContent = `Следующее напоминание: ${formatWhen(schedule.nextAt, schedule.timezone)} (${schedule.timezone})`;
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
    $('syncStatus').textContent = 'Синхронизация…';
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
        renderSchedules(data.schedules);
        $('syncStatus').textContent = `Синхронизировано: ${new Date(data.lastSyncedAt).toLocaleString('ru-RU')}`;
    } catch (error) {
        $('syncStatus').textContent = `Ошибка синхронизации: ${error.message}`;
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
    if (state.paired) await sync();
}

// Event listeners
$('pairButton').addEventListener('click', async () => {
    $('pairButton').disabled = true;
    message('Подключение…');
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

showState().catch((error) => message(error.message, true));
