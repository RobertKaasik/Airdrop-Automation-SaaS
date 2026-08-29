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
        toggleStatus.textContent = '🔒 Locked';
        toggleStatus.className = 'toggle-label locked';
        if (currentTierName) {
            currentTierName.textContent = `${tierName} (Level ${tierLevel})`;
        }
    } else {
        // Enable toggle for premium users (level 3+)
        toggle.disabled = false;
        lockMessage.hidden = true;
        agentModeInfo.hidden = false;
        toggleStatus.textContent = companionMode === 'agent' ? '✓ Enabled' : 'Disabled';
        toggleStatus.className = companionMode === 'agent' ?
            'toggle-label enabled' : 'toggle-label';
    }
}

function showVIPConsentDialog() {
    return new Promise((resolve) => {
        const modal = $('vip-consent');
        const checkbox = $('consent-checkbox');
        const acceptBtn = $('accept-btn');
        const cancelBtn = $('cancel-btn');
        
        modal.hidden = false;
        acceptBtn.disabled = true;
        checkbox.checked = false;
        
        checkbox.addEventListener('change', () => {
            acceptBtn.disabled = !checkbox.checked;
        });
        
        const cleanup = () => {
            modal.hidden = true;
            checkbox.removeEventListener('change', null);
            acceptBtn.removeEventListener('click', null);
            cancelBtn.removeEventListener('click', null);
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
                alert(`Failed to enable agent mode: ${result.error}`);
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
            $('agent-mode-toggle').addEventListener('change', handleToggleChange);
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

showState().catch((error) => message(error.message, true));
