// --- Глобальные переменные и состояние ---
let currentLang = localStorage.getItem('ax_lang') || 'ru';
let isLoggedIn = false;
let currentSection = 'Account';
const localeStore = window.AIRDROP_LOCALES || {};
const translations = localeStore;

function getActiveLang() {
    const savedLang = (currentLang || localStorage.getItem('ax_lang') || 'ru').toLowerCase();
    if (savedLang === 'cn') return 'zh';
    return translations[savedLang] ? savedLang : 'ru';
}

function t(key) {
    const lang = getActiveLang();
    const locale = translations[lang] || {};
    const value = key.split('.').reduce((current, part) => current?.[part], locale);
    if (value === undefined || value === null) {
        return key;
    }
    return value;
}

function setLanguage(lang) {
    const normalizedLang = lang === 'cn' ? 'zh' : lang;
    currentLang = translations[normalizedLang] ? normalizedLang : 'ru';
    localStorage.setItem('ax_lang', currentLang);
    document.documentElement.setAttribute('data-lang', currentLang);
    document.body.setAttribute('data-lang', currentLang);
    return currentLang;
}

function setFormError(containerId, message, type = 'error', fieldId = '') {
    const container = document.getElementById(containerId);
    if (!container) return;
    const cls = type === 'success' ? 'form-feedback success' : 'form-feedback error';
    container.innerHTML = `<div class="${cls}">${message}</div>`;
    if (fieldId) {
        setFieldValidationState(fieldId, false, message);
    }
}

function clearFormError(containerId, fieldId = '') {
    const container = document.getElementById(containerId);
    if (container) container.innerHTML = '';
    if (fieldId) {
        clearFieldValidationState(fieldId);
    }
}

function setFieldValidationState(fieldId, isValid, message = '') {
    const field = document.getElementById(fieldId);
    if (!field) return;
    field.classList.toggle('field-error', !isValid);
    field.dataset.validationMessage = message;
    if (!isValid) {
        field.style.borderColor = '#ef4444';
        field.style.boxShadow = '0 0 0 1px rgba(239, 68, 68, 0.35)';
        field.style.background = 'rgba(239, 68, 68, 0.08)';
    } else {
        field.style.borderColor = '';
        field.style.boxShadow = '';
        field.style.background = '';
    }
}

function clearFieldValidationState(fieldId) {
    const field = document.getElementById(fieldId);
    if (!field) return;
    field.classList.remove('field-error');
    field.dataset.validationMessage = '';
    field.style.borderColor = '';
    field.style.boxShadow = '';
    field.style.background = '';
}

function setButtonLoading(button, isLoading, text = '') {
    if (!button) return;
    if (isLoading) {
        button.classList.add('btn-loading');
        button.disabled = true;
        if (text) button.dataset.defaultText = button.innerText;
        button.innerText = text || t('loading');
    } else {
        button.classList.remove('btn-loading');
        button.disabled = false;
        const defaultText = button.dataset.defaultText || '';
        if (defaultText) button.innerText = defaultText;
    }
}
let userPlan = 'Standard';
let deviceFingerprint = generateDeviceFingerprint();
let subscriptionDaysLeft = 29;
let showWelcomeGuide = true;

let userInternalBalance = 0.00;
let transactionHistory = [];

let codeCooldownTimer = null;
let codeCooldownSeconds = 0;
let confirmedRegistrationEmail = "";
let currentEditingWallet = null;
let lastSaveTimestamp = 0; 
let lastRandomizeTimestamp = 0; 
let cachedStatsData = { current_slots: 1, max_slots: 300, is_sold_out: false };

const PLAN_PRICES = { Standard: 95, Pro: 150, Premium: 280 };
const clientSessionId = getOrCreateClientSessionId();
let paymentAccessToken = sessionStorage.getItem('ax_payment_token') || '';
let paymentUnlocked = sessionStorage.getItem('ax_paid_session_id') === clientSessionId && !!paymentAccessToken;

const MASTER_WALLET = "0x5e5316Dea1c44d220d4c60A5fcC2949E5A06Fc66";

const NETWORKS_CONFIG = [
    { name: "Ethereum", symbol: "ETH", key: "Ethereum", icon: '<img src="https://cryptologos.cc/logos/ethereum-eth-logo.svg?v=032" style="width:32px; height:32px;">', explorer: "https://etherscan.io", deadline: "2026-10-15T00:00:00" },
    { name: "Base", symbol: "ETH", key: "Base", icon: '<img src="https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/base/info/logo.png" style="width:32px; height:32px; border-radius:50%;">', explorer: "https://basescan.org", deadline: "2026-09-01T23:59:59" },
    { name: "Arbitrum", symbol: "ARB", key: "Arbitrum", icon: '<img src="https://cryptologos.cc/logos/arbitrum-arb-logo.svg?v=032" style="width:32px; height:32px;">', explorer: "https://arbiscan.io", deadline: "2026-11-20T18:00:00" },
    { name: "Linea", symbol: "ETH", key: "Linea", icon: '<img src="https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/linea/info/logo.png" style="width:32px; height:32px; border-radius:50%;">', explorer: "https://lineascan.build", deadline: "2026-09-30T23:59:59" },
    { name: "Solana", symbol: "SOL", key: "Solana", icon: '<img src="https://cryptologos.cc/logos/solana-sol-logo.svg?v=032" style="width:32px; height:32px;">', explorer: "https://solscan.io", deadline: "2026-12-31T23:59:59" },
    { name: "BNB Chain", symbol: "BNB", key: "BNB Chain", icon: '<img src="https://cryptologos.cc/logos/bnb-bnb-logo.svg?v=032" style="width:32px; height:32px;">', explorer: "https://bscscan.com", deadline: "2026-08-25T12:00:00" },
    { name: "Polygon", symbol: "POL", key: "Polygon", icon: '<img src="https://cryptologos.cc/logos/polygon-matic-logo.svg?v=032" style="width:32px; height:32px;">', explorer: "https://polygonscan.com", deadline: "2026-10-31T23:59:59" },
    { name: "Optimism", symbol: "OP", key: "Optimism", icon: '<img src="https://cryptologos.cc/logos/optimism-ethereum-op-logo.svg?v=032" style="width:32px; height:32px;">', explorer: "https://optimistic.etherscan.io", deadline: "2026-09-15T23:59:59" },
    { name: "Tron", symbol: "TRX", key: "Tron", icon: '<img src="https://cryptologos.cc/logos/tron-trx-logo.svg?v=032" style="width:32px; height:32px;">', explorer: "https://tronscan.org", deadline: "2026-11-10T23:59:59" }
];

// --- Инициализация при загрузке ---
document.getElementById('main-logo-btn').addEventListener('click', function(e) {
    e.preventDefault();
    returnToMainSite();
});

window.addEventListener('DOMContentLoaded', () => {
    updateStaticText(currentLang);
    loadPlatformStats();
    const line = document.getElementById('preloader-line');
    if(line) {
        setTimeout(() => { 
            line.style.opacity = '0'; 
        }, 800);
    }

    const savedUsername = localStorage.getItem('airdrop_username');
    if (savedUsername) {
        isLoggedIn = true;
        userPlan = localStorage.getItem('selected_plan') || 'Standard';
        
        const loginBtn = document.getElementById('login-btn');
        if (loginBtn) loginBtn.style.display = 'none';

        document.getElementById('main-content').style.display = 'none';
        document.getElementById('dashboard-content').style.display = 'flex';
        const mobileNav = document.getElementById('mobileNavBar');
        if(mobileNav) mobileNav.style.display = ''; 
        
        currentSection = localStorage.getItem('airdrop_current_section') || 'Account';
        renderDashboardContent(currentSection);
    }
});

function formatCountdown(deadlineStr) {
    const total = Date.parse(new Date(deadlineStr)) - Date.now();
    if (total <= 0) return t('countdown.ended');
    const days = Math.floor(total / (1000 * 60 * 60 * 24));
    const hours = Math.floor((total / (1000 * 60 * 60)) % 24);
    const minutes = Math.floor((total / 1000 / 60) % 60);
    const seconds = Math.floor((total / 1000) % 60);
    
    return `⏳ ${t('countdown.label')} ${days}${t('countdown.d')} ${hours}${t('countdown.h')} ${minutes}${t('countdown.m')} ${seconds}${t('countdown.s')}`;
}

// --- Вспомогательные функции ---
function getOrCreateClientSessionId() {
    let existing = sessionStorage.getItem('ax_client_session_id');
    if (existing) return existing;
    existing = `sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem('ax_client_session_id', existing);
    return existing;
}

function clearPaymentAccess() {
    paymentUnlocked = false;
    paymentAccessToken = '';
    sessionStorage.removeItem('ax_payment_token');
    sessionStorage.removeItem('ax_paid_session_id');
    sessionStorage.removeItem('ax_paid_plan');
}

function generateDeviceFingerprint() {
    try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        ctx.textBaseline = 'top';
        ctx.font = '14px Arial';
        ctx.fillText('AIRDROP-X-fp-' + navigator.userAgent, 2, 2);
        return 'fp_' + Math.abs([...canvas.toDataURL()].reduce((acc, char) => ((acc << 5) - acc) + char.charCodeAt(0), 0)).toString(16);
    } catch (e) {
        return 'fp_unknown';
    }
}

function hashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) { hash = str.charCodeAt(i) + ((hash << 5) - hash); }
    return hash;
}

function showNotification(text, type = 'success') {
    let container = document.getElementById('toastNotificationContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toastNotificationContainer';
        container.style.cssText = 'position: fixed; bottom: 20px; right: 20px; z-index: 99999; display: flex; flex-direction: column; gap: 8px;';
        document.body.appendChild(container);
    }

    while (container.children.length >= 3) {
        container.firstChild.remove();
    }

    const toast = document.createElement('div');
    const borderColor = type === 'success' ? '#22c55e' : '#ef4444';
    const icon = type === 'success' ? '✅' : '⚠️';
    toast.style.cssText = `background: #121212; border: 1px solid ${borderColor}; color: #fff; padding: 12px 16px; border-radius: 12px; font-size: 13px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); display: flex; align-items: center; gap: 10px; animation: fadeIn 0.3s ease;`;
    toast.innerHTML = `<span>${icon}</span> <span>${text}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

function renderLanguageAwareText() {
    const lang = setLanguage(currentLang);
    const loginBtn = document.getElementById('login-btn');
    if (loginBtn) loginBtn.innerText = t('login');

    const badge = document.getElementById('current-lang-badge');
    const text = document.getElementById('current-lang-text');
    if (badge) badge.innerText = translations[lang].langCode || lang.toUpperCase();
    if (text) text.innerText = translations[lang].langCode || lang.toUpperCase();

    const counterEl = document.getElementById('slots-counter-text');
    if (counterEl && window.cachedStatsData) {
        counterEl.innerHTML = `${t('privateSoftware')}. <b style="color:#fff; margin-left:8px;">${window.cachedStatsData.current_slots} / ${window.cachedStatsData.max_slots} ${t('slotsShort')}</b>`;
    }
}

function checkInputLimit(input, maxLimit) {
    const val = parseFloat(input.value);
    if (val > maxLimit) {
        input.style.color = '#ef4444';
        input.style.borderColor = '#ef4444';
        input.style.boxShadow = '0 0 8px rgba(239, 68, 68, 0.2)';
    } else {
        input.style.color = '#fff';
        input.style.borderColor = 'var(--border-color)';
        input.style.boxShadow = 'none';
    }
}

// 🌍 Обновление всего статического текста
const STATIC_TEXT_BINDINGS = [
    ['login-btn', 'login'], ['hero-title', 'heroTitle', true], ['hero-desc', 'heroDesc'], ['farm-btn', 'farmBtn'], ['settings-btn', 'settingsBtn'],
    ['core-status-label', 'coreStatusLabel'], ['core-status-val', 'coreStatus'], ['features-heading', 'featuresHeading'], ['instr-title', 'instructionHeading'], ['faq-heading', 'faqHeading'],
    ['c1-t', 'c1t'], ['c1-d', 'c1d'], ['c2-t', 'c2t'], ['c2-d', 'c2d'], ['c3-t', 'c3t'], ['c3-d', 'c3d'],
    ['sc1-t', 'sc1t'], ['sc1-b1', 'sc1b1'], ['sc1-d1', 'sc1d1'], ['sc1-d2', 'sc1d2'], ['sc1-l1', 'sc1l1'], ['sc1-l2', 'sc1l2'], ['sc1-l3', 'sc1l3'],
    ['sc2-t', 'sc2t'], ['sc2-b1', 'sc2b1'], ['sc2-d1', 'sc2d1'], ['sc2-d2', 'sc2d2'], ['sc2-l1', 'sc2l1'], ['sc2-l2', 'sc2l2'], ['sc2-l3', 'sc2l3'],
    ['sc3-t', 'sc3t'], ['sc3-b1', 'sc3b1'], ['sc3-d1', 'sc3d1'], ['sc3-d2', 'sc3d2'], ['sc3-l1', 'sc3l1'], ['sc3-l2', 'sc3l2'], ['sc3-l3', 'sc3l3'],
    ['sc4-t', 'sc4t'], ['sc4-b1', 'sc4b1'], ['sc4-d1', 'sc4d1'], ['sc4-l1', 'sc4l1'], ['sc4-l2', 'sc4l2'], ['sc4-l3', 'sc4l3'],
    ['q1', 'q1'], ['a1', 'a1'], ['q2', 'q2'], ['a2', 'a2'], ['q3', 'q3'], ['a3', 'a3'], ['q4', 'q4'], ['a4', 'a4'],
    ['mn-looter', 'mnLooter'], ['mn-farm', 'mnFarm'], ['mn-proxy', 'mnProxy'], ['mn-stats', 'mnStats'], ['mn-more', 'mnMore'],
    ['p-title-modal', 'pTitleModal'], ['p-desc-modal', 'pDescModal'], ['p-std-top', 'subTop'], ['p-std-name', 'stdName'], ['p-std-per', 'stdPer'], ['p-std-f1', 'stdF1'], ['p-std-f2', 'stdF2'], ['p-std-f3', 'stdF3'], ['p-std-btn', 'stdBtn'],
    ['p-pro-badge', 'proBadge'], ['p-pro-top', 'subTop'], ['p-pro-name', 'proName'], ['p-pro-per', 'proPer'], ['p-pro-f1', 'proF1'], ['p-pro-f2', 'proF2'], ['p-pro-f3', 'proF3'], ['p-pro-f4', 'proF4'], ['p-pro-btn', 'proBtn'],
    ['p-prem-top', 'subTop'], ['p-prem-name', 'premName'], ['p-prem-per', 'premPer'], ['p-prem-f1', 'premF1'], ['p-prem-f2', 'premF2'], ['p-prem-f3', 'premF3'], ['p-prem-f4', 'premF4'], ['p-prem-btn', 'premBtn'],
    ['walletModalTitle', 'walletModalTitle'], ['wm-dep-title', 'wmDepTitle'], ['wm-master-lbl', 'wmMasterLbl'], ['wm-net-lbl', 'wmNetLbl'], ['wm-amt-lbl', 'wmAmtLbl'], ['wm-dep-btn', 'wmDepBtn'], ['wm-edit-title', 'wmEditTitle'], ['wm-save-btn', 'wmSaveBtn'], ['wm-del-btn', 'wmDelBtn'],
    ['footer-rights', 'footerRights'], ['footer-privacy', 'footerPrivacy'], ['footer-terms', 'footerTerms'], ['page-title', 'pageTitle']
];

function updateStaticText(lang) {
    setLanguage(lang);
    STATIC_TEXT_BINDINGS.forEach(([id, key, useHtml]) => {
        const element = document.getElementById(id);
        if (element) element[useHtml ? 'innerHTML' : 'innerText'] = t(key);
    });
    ['current-lang-badge', 'current-lang-text'].forEach(id => {
        const element = document.getElementById(id);
        if (element) element.innerText = t('langCode');
    });
    const counterEl = document.getElementById('slots-counter-text');
    if (counterEl && window.cachedStatsData) {
        counterEl.innerHTML = `${t('privateSoftware')}. <b style="color:#fff; margin-left:8px;">${window.cachedStatsData.current_slots} / ${window.cachedStatsData.max_slots} ${t('slotsShort')}</b>`;
    }
}

window.translateBackendMessage = function(msg) {
    if (!msg) return "";

    const activeLang = getActiveLang();
    if (activeLang === 'en') return msg; // Для английского оставляем как есть

    const loc = window.AIRDROP_LOCALES[activeLang]?.backend;
    if (!loc) return msg;

    // Точные совпадения (из словаря)
    if (loc[msg]) return loc[msg];

    // Динамические сообщения с переменными (прокси, лимиты, слоты)
    if (msg.includes("Invalid code! Attempts left:")) return msg.replace("Invalid code! Attempts left:", activeLang === 'ru' ? "Неверный код! Осталось попыток:" : "验证码无效！剩余次数：");
    if (msg.includes("Plan limit reached:")) return activeLang === 'ru' ? "Лимит слотов для вашего тарифа исчерпан!" : "您的套餐限制已满！";
    if (msg.includes("Slot purchased! Total slots:")) return msg.replace("Slot purchased! Total slots:", activeLang === 'ru' ? "Слот куплен! Всего слотов:" : "槽位已购买！总槽位：");
    if (msg.includes("Proxy is working! Ping:")) return msg.replace("Proxy is working! Ping:", activeLang === 'ru' ? "Прокси рабочий! Пинг:" : "代理正常！延迟：");
    if (msg.includes("Connection error:")) return msg.replace("Connection error:", activeLang === 'ru' ? "Ошибка соединения:" : "连接错误：");
    if (msg.includes("Delay limit exceeded for day")) return activeLang === 'ru' ? "Превышен лимит задержки (максимум 7200 секунд)" : "延迟限制超标（最大7200秒）";

    return msg; // Если перевода нет - отдаем оригинал
};

function returnToMainSite() {
    isLoggedIn = false;
    localStorage.removeItem('airdrop_username');
    localStorage.removeItem('airdrop_current_section');
    
    const loginBtn = document.getElementById('login-btn');
    if (loginBtn) loginBtn.style.display = '';

    document.getElementById('dashboard-content').style.display = 'none';
    const mobileNav = document.getElementById('mobileNavBar');
    if(mobileNav) mobileNav.style.display = 'none'; 
    document.getElementById('main-content').style.display = 'block';
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function toggleLangMenu(event) {
    if (event) event.stopPropagation();
    document.getElementById('langMenu').classList.toggle('show');
}

window.addEventListener('click', function(event) {
    if (!event.target.closest('.lang-dropdown-wrapper')) {
        const menu = document.getElementById('langMenu');
        if (menu) menu.classList.remove('show');
    }
});

function changeLanguage(lang) {
    const normalizedLang = setLanguage(lang);
    document.getElementById('langMenu').classList.remove('show');
    updateStaticText(normalizedLang);
    if (isLoggedIn) {
        renderDashboardContent(currentSection);
    }
}

// --- Модальные окна и авторизация ---
function openPricingModal() { 
    closeAuthModal(); 
    document.getElementById('pricingModal').classList.add('show'); 
}

function closePricingModal() { 
    document.getElementById('pricingModal').classList.remove('show'); 
}

let mousedownOverlayTarget = null;
window.addEventListener('mousedown', (e) => { mousedownOverlayTarget = e.target; });

function handleOverlayClick(event) { if (event.target.id === 'authModal' && mousedownOverlayTarget.id === 'authModal') closeAuthModal(); }
function handlePricingOverlayClick(event) { if (event.target.id === 'pricingModal' && mousedownOverlayTarget.id === 'pricingModal') closePricingModal(); }

function selectPlanAndRegister(planName, price) {
    closePricingModal();
    userPlan = planName;
    localStorage.setItem('selected_plan', planName);
    localStorage.setItem('selected_price', String(price));
    clearPaymentAccess();
    openModal('payment');
}

function closeAuthModal() { document.getElementById('authModal').classList.remove('show'); }

function togglePasswordVisibility(fieldId, iconEl) {
    const input = document.getElementById(fieldId);
    if (!input) return;
    if (input.type === 'password') {
        input.type = 'text';
        iconEl.innerText = '🙈';
    } else {
        input.type = 'password';
        iconEl.innerText = '👁️';
    }
}

function openModal(type) {
    const modal = document.getElementById('authModal');
    const container = document.getElementById('modalContainer');

    if (type === 'register' && (!paymentUnlocked || !paymentAccessToken)) {
        closeAuthModal();
        openPricingModal();
        return;
    }

    modal.classList.add('show');

    if (type === 'login') {
        container.innerHTML = `
            <form onsubmit="event.preventDefault(); validateLogin();">
                <div class="modal-logo" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                    <span style="font-weight:bold; font-size:16px;">${t('login')}</span>
                    <span onclick="closeAuthModal()" style="cursor: pointer; color: #a3a3a3; font-size: 18px;">✕</span>
                </div>
                <div class="input-group" style="margin-bottom:12px;">
                    <label style="font-size: 11px; color: #a3a3a3; display: block; margin-bottom: 4px;">${t('auth.usernameLabel')}</label>
                    <input type="text" class="auth-input" placeholder="${t('auth.usernamePlaceholder')}" id="loginUsername" oninput="clearFormError('loginErrorContainer', 'loginUsername'); clearFieldValidationState('loginUsername')">
                </div>
                <div class="input-group" style="margin-bottom:16px;">
                    <label style="font-size: 11px; color: #a3a3a3; display: block; margin-bottom: 4px;">${t('auth.password')}</label>
                    <div class="password-wrapper" style="position:relative;">
                        <input type="password" class="auth-input" placeholder="${t('auth.passwordPlaceholder')}" id="loginPass" style="padding-right: 35px;" oninput="clearFormError('loginErrorContainer', 'loginPass'); clearFieldValidationState('loginPass')">
                        <span class="password-toggle-icon" onclick="togglePasswordVisibility('loginPass', this)" style="position:absolute; right:12px; top:50%; transform:translateY(-50%); cursor:pointer; font-size:14px;">👁️</span>
                    </div>
                </div>
                <button type="submit" class="btn-modal-primary" style="width:100%; padding:12px;">${t('login')}</button>
                <div id="loginErrorContainer" style="margin-top:10px;"></div>
            </form>
        `;
    } else if (type === 'payment') {
        const chosenPlan = localStorage.getItem('selected_plan') || 'Standard';
        const basePrice = Number(localStorage.getItem('selected_price') || PLAN_PRICES[chosenPlan] || 95);
        const displayAmount = (basePrice + 0.47).toFixed(2);
        const planDisplayLabel = chosenPlan === 'Standard' ? t.stdName : chosenPlan === 'Pro' ? t.proName : t.premName;

        container.innerHTML = `
            <div class="modal-logo" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                <span style="font-weight:bold; font-size:16px;">${t('payTitle')}: ${planDisplayLabel}</span>
                <span onclick="closeAuthModal()" style="cursor: pointer; color: #a3a3a3; font-size: 18px;">✕</span>
            </div>
            
            <div style="margin-bottom: 12px;">
                <label style="font-size: 11px; color: #a3a3a3; display: block; margin-bottom: 4px;">${t('payNetwork')}</label>
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px;">
                    <button type="button" class="btn-dark-sm auth-input" id="net-base" onclick="setPayNetwork('Base', '${MASTER_WALLET}', '${displayAmount}')" style="background:#1f1f1f; border-color:#fff; cursor:pointer;">Base L2</button>
                    <button type="button" class="btn-dark-sm auth-input" id="net-arb" onclick="setPayNetwork('Arbitrum', '${MASTER_WALLET}', '${displayAmount}')" style="cursor:pointer;">Arbitrum</button>
                    <button type="button" class="btn-dark-sm auth-input" id="net-eth" onclick="setPayNetwork('Ethereum', '${MASTER_WALLET}', '${displayAmount}')" style="cursor:pointer;">Ethereum</button>
                </div>
            </div>

            <div style="background:#0a0a0a; border:1px solid var(--border-color); border-radius:12px; padding:12px; margin-bottom:12px; text-align:center;">
                <div style="font-size:11px; color:#a3a3a3; margin-bottom:2px;">${t('payAmount')}</div>
                <div style="font-size:20px; color:#fff; font-weight:700; margin-bottom:8px;">$${displayAmount}</div>
                
                <div style="font-size:11px; color:#a3a3a3; margin-bottom:2px;">${t('payWallet')} (<span id="activePayNet">Base L2</span>):</div>
                <div style="background:#181818; padding:6px 8px; border-radius:8px; font-family:monospace; font-size:11px; color:#fff; word-break:break-all; margin-bottom:6px;">${MASTER_WALLET}</div>
                
                <button type="button" id="copyWalletBtn" class="auth-input" style="margin: 0 auto; font-size: 11px; padding: 6px 12px; width:auto; cursor:pointer;" onclick="copyWalletAddress('${MASTER_WALLET}', this)">${t('payCopy')}</button>
                <div id="qrcodeContainer" style="display:flex; justify-content:center; align-items:center; margin:10px auto 0 auto; background:#fff; padding:8px; border-radius:8px; width:110px; height:110px; box-sizing:border-box; overflow:hidden;"></div>
            </div>

            <div class="input-group" style="margin-bottom:12px;">
                <label style="font-size: 11px; color: #a3a3a3; display: block; margin-bottom: 4px;">${t('payTxid')}</label>
                <input type="text" class="auth-input" placeholder="0x..." id="txidInput">
            </div>

            <button type="button" id="paymentActionBtn" class="btn-modal-primary" onclick="startPlanPayment()" style="width:100%; padding:10px;">${t('payConfirm')} ($${displayAmount})</button>
            <div id="paymentStatusContainer"></div>
        `;
        setTimeout(() => renderPaymentQR(MASTER_WALLET, displayAmount), 100);
    } else if (type === 'register') {
        const chosenPlan = localStorage.getItem('selected_plan') || 'Standard';
        const chosenPrice = Number(localStorage.getItem('selected_price') || PLAN_PRICES[chosenPlan] || 95);
        const planDisplayLabel = chosenPlan === 'Standard' ? t.stdName : chosenPlan === 'Pro' ? t.proName : t.premName;
        const btnText = codeCooldownSeconds > 0 ? `${codeCooldownSeconds}s` : t('auth.sendCode');
        const btnDisabled = codeCooldownSeconds > 0 ? 'disabled' : '';
        const emailState = codeCooldownSeconds > 0 ? `readonly style="opacity: 0.7;" value="${confirmedRegistrationEmail}"` : '';

        container.innerHTML = `
            <form onsubmit="event.preventDefault(); validateRegister();">
                <div class="modal-logo" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                    <span style="font-weight:bold; font-size:16px;">${t('auth.register')}: ${planDisplayLabel} ($${chosenPrice})</span>
                    <span onclick="closeAuthModal()" style="cursor: pointer; color: #a3a3a3; font-size: 18px;">✕</span>
                </div>
                
                <div class="input-group" style="margin-bottom:10px;">
                    <label style="font-size: 11px; color: #a3a3a3; display: block; margin-bottom: 4px;">${t('auth.nickname')}</label>
                    <input type="text" class="auth-input" placeholder="${t('auth.usernamePlaceholder')}" id="regUsername" oninput="clearFormError('errorContainer', 'regUsername'); clearFieldValidationState('regUsername')">
                </div>
                
                <div class="input-group" style="margin-bottom:10px;">
                    <label style="font-size: 11px; color: #a3a3a3; display: block; margin-bottom: 4px;">${t('auth.email')}</label>
                    <input type="email" class="auth-input" placeholder="${t('auth.emailPlaceholder')}" id="regEmail" ${emailState} oninput="clearFormError('errorContainer', 'regEmail'); clearFieldValidationState('regEmail')">
                </div>
                
                <div class="input-group" style="margin-bottom:10px;">
                    <label style="font-size: 11px; color: #a3a3a3; display: block; margin-bottom: 4px;">${t('auth.password')}</label>
                    <div class="password-wrapper" style="position:relative;">
                        <input type="password" class="auth-input" placeholder="${t('auth.passwordPlaceholder')}" id="regPass" style="padding-right: 35px;" oninput="clearFormError('errorContainer', 'regPass'); clearFieldValidationState('regPass')">
                        <span class="password-toggle-icon" onclick="togglePasswordVisibility('regPass', this)" style="position:absolute; right:12px; top:50%; transform:translateY(-50%); cursor:pointer; font-size:14px;">👁️</span>
                    </div>
                </div>
                
                <div class="input-group" style="margin-bottom:14px;">
                    <label style="font-size: 11px; color: #a3a3a3; display: block; margin-bottom: 4px;">${t('auth.code')}</label>
                    <div style="display: flex; gap: 8px;">
                        <input type="text" class="auth-input" placeholder="${t('auth.codePlaceholder')}" id="regCode" style="flex: 1; margin: 0;" oninput="clearFormError('errorContainer', 'regCode'); clearFieldValidationState('regCode')">
                        <button type="button" id="sendCodeBtn" onclick="sendVerificationEmailCode()" ${btnDisabled} class="auth-input" style="width: auto; background:#1f1f1f; color:#fff; cursor:pointer; font-weight:600;">${btnText}</button>
                    </div>
                </div>
                
                <button type="submit" class="btn-modal-primary" style="width:100%; padding:10px;">${t('auth.register')}</button>
                <div id="errorContainer" style="margin-top:10px;"></div>
            </form>
        `;
    }
}

async function sendVerificationEmailCode() {
    if (codeCooldownSeconds > 0) return;
    const emailInput = document.getElementById('regEmail');
    const email = emailInput.value.trim();
    const err = document.getElementById('errorContainer');
    const btn = document.getElementById('sendCodeBtn');

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
        setFormError('errorContainer', t('errors.invalidEmail'), 'error', 'regEmail');
        return;
    }

    emailInput.readOnly = true;
    emailInput.style.opacity = '0.7';
    confirmedRegistrationEmail = email;
    setButtonLoading(btn, true, t('auth.sendCode'));

    try {
        const response = await fetch('/api/send-code', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });
        if (!response.ok) {
            throw new Error('request failed');
        }
        setFormError('errorContainer', t('auth.codeSent'), 'success');
        showNotification(t('auth.codeSent'));
    } catch (e) {
        setFormError('errorContainer', t('errors.networkError'));
        showNotification(t('errors.networkError'), 'error');
    }

    codeCooldownSeconds = 60;
    btn.innerText = `${codeCooldownSeconds}s`;

    codeCooldownTimer = setInterval(() => {
        codeCooldownSeconds--;
        const currentBtn = document.getElementById('sendCodeBtn');
        if (codeCooldownSeconds <= 0) {
            clearInterval(codeCooldownTimer);
            if (currentBtn) {
                currentBtn.innerText = t('auth.sendCode');
                currentBtn.disabled = false;
                currentBtn.classList.remove('btn-loading');
            }
            const currentEmailInput = document.getElementById('regEmail');
            if (currentEmailInput) {
                currentEmailInput.readOnly = false;
                currentEmailInput.style.opacity = '1';
            }
        } else if (currentBtn) {
            currentBtn.innerText = `${codeCooldownSeconds}s`;
        }
    }, 1000);
}

function setPayNetwork(netName, address, amount) {
    document.getElementById('activePayNet').innerText = netName;
    renderPaymentQR(address, amount);
}

function scrollToFeatures() {
    const heading = document.getElementById('features-heading');
    if (heading) {
        heading.scrollIntoView({ behavior: 'smooth' });
    }
}

function renderPaymentQR(walletAddress, displayAmount) {
    const qrEl = document.getElementById('qrcodeContainer');
    if (qrEl && window.qrcode) {
        try {
            qrEl.innerHTML = '';
            const qr = qrcode(0, 'M');
            qr.addData(`ethereum:${walletAddress}?value=${displayAmount}`);
            qr.make();
            qrEl.innerHTML = qr.createSvgTag({cellSize: 4, margin: 1});
            const svg = qrEl.querySelector('svg');
            if (svg) { svg.style.width = '100%'; svg.style.height = '100%'; svg.style.display = 'block'; }
        } catch(e) {}
    }
}

function copyWalletAddress(address, btn) {
    navigator.clipboard.writeText(address);
    const originalText = btn.innerHTML;
    btn.innerHTML = '✅ OK!';
    setTimeout(() => { btn.innerHTML = originalText; }, 2000);
}

async function startPlanPayment() {
    const chosenPlan = localStorage.getItem('selected_plan') || 'Standard';
    const basePrice = PLAN_PRICES[chosenPlan] || 95;
    const status = document.getElementById('paymentStatusContainer');
    const txid = document.getElementById('txidInput').value.trim();

    if (!txid) {
        status.innerHTML = `<div style="color:#ef4444; font-size:12px; margin-top:8px;">${t('errors.txidRequired')}</div>`;
        return;
    }

    try {
        const createRes = await fetch('/api/payment/create-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ plan: chosenPlan, amount: basePrice, client_session_id: clientSessionId })
        });
        const createData = await createRes.json();
        
        const confirmRes = await fetch('/api/payment/confirm', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ payment_session_id: createData.payment_session_id, client_session_id: clientSessionId, txid: txid })
        });
        const confirmData = await confirmRes.json();

        if (!confirmRes.ok) {
            status.innerHTML = `<div style="color:#ef4444; font-size:12px; margin-top:8px;">${confirmData.detail || t('errors.paymentFailed')}</div>`;
            return;
        }

        paymentUnlocked = true;
        paymentAccessToken = confirmData.payment_token;
        sessionStorage.setItem('ax_payment_token', paymentAccessToken);
        sessionStorage.setItem('ax_paid_session_id', clientSessionId);

        showNotification("OK!");
        setTimeout(() => openModal('register'), 800);
    } catch (e) {
        status.innerHTML = `<div style="color:#ef4444; font-size:12px; margin-top:8px;">${t('errors.networkError')}</div>`;
    }
}

async function validateRegister() {
    const username = document.getElementById('regUsername').value.trim();
    const email = document.getElementById('regEmail').value.trim();
    const pass = document.getElementById('regPass').value.trim();
    const code = document.getElementById('regCode').value.trim();
    const chosenPlan = localStorage.getItem('selected_plan') || 'Standard';
    const submitBtn = document.querySelector('#modalContainer .btn-modal-primary');

    if (!username) {
        setFormError('errorContainer', t('errors.fillAllFields'), 'error', 'regUsername');
        document.getElementById('regUsername')?.focus();
        return;
    }
    if (!email) {
        setFormError('errorContainer', t('errors.fillAllFields'), 'error', 'regEmail');
        document.getElementById('regEmail')?.focus();
        return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        setFormError('errorContainer', t('errors.invalidEmail'), 'error', 'regEmail');
        document.getElementById('regEmail')?.focus();
        return;
    }
    if (!pass) {
        setFormError('errorContainer', t('errors.fillAllFields'), 'error', 'regPass');
        document.getElementById('regPass')?.focus();
        return;
    }
    if (pass.length < 6) {
        setFormError('errorContainer', t('errors.passwordTooShort'), 'error', 'regPass');
        document.getElementById('regPass')?.focus();
        return;
    }
    if (!code) {
        setFormError('errorContainer', t('errors.fillAllFields'), 'error', 'regCode');
        document.getElementById('regCode')?.focus();
        return;
    }

    setButtonLoading(submitBtn, true, t('auth.register'));

    const requestData = {
        username,
        email,
        password: pass,
        code,
        plan: chosenPlan,
        payment_token: localStorage.getItem('payment_token') || '',
        client_session_id: localStorage.getItem('client_session_id') || '',
        fingerprint: localStorage.getItem('fingerprint') || 'web_client'
    };

    try {
        const response = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestData)
        });

        const result = await response.json();

        if (!response.ok) {
            let errMsg = t('errors.genericRequestFailed');
            if (result.detail) {
                if (Array.isArray(result.detail)) {
                    errMsg = result.detail.map(e => e.msg === 'Field required' ? t('errors.fillAllFields') : e.msg).join(', ');
                } else {
                    errMsg = result.detail;
                }
            }
            setFormError('errorContainer', errMsg);
            return;
        }

        if (typeof clearPaymentAccess === 'function') {
            clearPaymentAccess();
        }
        setFormError('errorContainer', t('auth.registerSuccess'), 'success');
        showNotification(t('auth.registerSuccess'));
        setTimeout(() => openModal('login'), 1200);
    } catch (error) {
        setFormError('errorContainer', t('errors.networkError'));
    } finally {
        setButtonLoading(submitBtn, false, t('auth.register'));
    }
}

async function validateLogin() {
    const username = document.getElementById('loginUsername').value.trim();
    const pass = document.getElementById('loginPass').value.trim();
    const err = document.getElementById('loginErrorContainer');
    const submitBtn = document.querySelector('#modalContainer .btn-modal-primary');

    if (!username) {
        setFormError('loginErrorContainer', t('errors.fillAllFields'), 'error', 'loginUsername');
        document.getElementById('loginUsername')?.focus();
        return;
    }
    if (!pass) {
        setFormError('loginErrorContainer', t('errors.fillAllFields'), 'error', 'loginPass');
        document.getElementById('loginPass')?.focus();
        return;
    }
    if (pass.length < 6) {
        setFormError('loginErrorContainer', t('errors.passwordTooShort'), 'error', 'loginPass');
        document.getElementById('loginPass')?.focus();
        return;
    }

    setButtonLoading(submitBtn, true, t('auth.login'));

    try {
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password: pass, fingerprint: deviceFingerprint })
        });
        const data = await res.json();

        if (res.ok) {
            localStorage.setItem('airdrop_username', data.username);
            userPlan = data.plan || 'Standard';
            subscriptionDaysLeft = data.days_left ?? 29;
            handleLoginSuccess();
        } else {
            let errMsg = t('errors.loginFailed');
            if (data.detail) errMsg = Array.isArray(data.detail) ? data.detail.map(e => e.msg).join(', ') : data.detail;
            setFormError('loginErrorContainer', errMsg);
        }
    } catch (error) {
        setFormError('loginErrorContainer', t('errors.networkError'));
    } finally {
        setButtonLoading(submitBtn, false, t('auth.login'));
    }
}

function handleLoginSuccess() {
    isLoggedIn = true;
    const loginBtn = document.getElementById('login-btn');
    if (loginBtn) loginBtn.style.display = 'none';
    document.getElementById('authModal').classList.remove('show');
    document.getElementById('main-content').style.display = 'none';
    document.getElementById('dashboard-content').style.display = 'flex';
    const mobileNav = document.getElementById('mobileNavBar');
    if(mobileNav) mobileNav.style.display = ''; 
    currentSection = 'Account';
    renderDashboardContent('Account');
    showNotification("OK!");
}

function switchMenu(element, sectionName) {
    currentSection = sectionName;
    localStorage.setItem('airdrop_current_section', sectionName);
    renderDashboardContent(sectionName);
}

async function addNewWalletToDB() {
    const username = localStorage.getItem('airdrop_username') || "Robert";
    const address = document.getElementById('newWalletAddress').value.trim();
    const pk = document.getElementById('newWalletPk').value.trim();
    const proxy = document.getElementById('newWalletProxy').value.trim();
    const msg = document.getElementById('walletResponseMsg');

    const res = await fetch('/api/wallets/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, wallet_address: address, encrypted_pk: pk, proxy })
    });
    const data = await res.json();
    if(res.ok) {
        showNotification("OK!");
        document.getElementById('newWalletAddress').value = '';
        document.getElementById('newWalletPk').value = '';
        document.getElementById('newWalletProxy').value = '';
        loadWalletsFromDB();
    } else {
        let errText = data.detail;
        if (Array.isArray(errText)) errText = errText.map(e => e.msg).join(', ');
        msg.innerHTML = `<span style="color: #ef4444;">${errText}</span>`;
    }
}

async function loadWalletsFromDB() {
    const username = localStorage.getItem('airdrop_username') || "Robert";
    const container = document.getElementById('walletsListContainer');
    if(!container) return;
    const res = await fetch(`/api/wallets/${username}`);
    const data = await res.json();
    userPlan = data.plan;
    const t = translations[currentLang];
    
    const badge = document.getElementById('slot-info-badge');
    if(badge) badge.innerText = `${t.slotsLabel}: ${data.wallets.length} / ${data.max_slots} (${data.plan})`;
    
    if(data.wallets.length > 0) {
        container.id = 'walletsListContainer';
        container.innerHTML = data.wallets.map(w => {
            const mockBalance = (Math.abs(hashCode(w.wallet_address)) % 1500 + 45).toFixed(2);
            return `
                <div style="background: var(--bg-main); border: 1px solid var(--border-color); padding: 14px; border-radius: 12px; display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <div style="color: #fff; font-weight: 600; font-size: 13px; font-family:monospace;">${w.wallet_address}</div>
                        <div style="color: var(--text-muted); font-size: 12px; margin-top:2px;">${t.balLabel} <b style="color:#fff;">$${mockBalance}</b> | ${t.proxyLabel} ${w.proxy || t.proxyNone}</div>
                    </div>
                    <div style="display:flex; gap:6px;">
                        <button type="button" onclick="testWalletProxy(${w.id}, this)" style="background: rgba(34,197,94,0.1); color: #22c55e; border: 1px solid rgba(34,197,94,0.2); padding: 6px 10px; border-radius: 8px; font-size: 12px; cursor:pointer;">${t.btnTest}</button>
                        <button type="button" onclick="deleteWallet(${w.id})" style="background: rgba(239,68,68,0.1); color: #ef4444; border: 1px solid rgba(239,68,68,0.2); padding: 6px 10px; border-radius: 8px; font-size: 12px; cursor:pointer;">${t.btnDel}</button>
                    </div>
                </div>
            `;
        }).join('');
    } else {
        container.innerHTML = `<div style="color: var(--text-muted); font-size: 13px;">${t.noWal}</div>`;
    }
}

async function testWalletProxy(walletId, btn) {
    btn.innerHTML = '⏳...';
    btn.disabled = true;
    btn.style.background = 'rgba(255, 255, 255, 0.1)';
    btn.style.color = '#fff';
    btn.style.borderColor = 'rgba(255, 255, 255, 0.2)';

    try {
        const res = await fetch(`/api/wallets/test-proxy/${walletId}`, { method: 'POST' });
        const data = await res.json();
        
        if (res.ok && data.status === 'success') {
            const match = data.message.match(/Пинг: (\d+)ms/);
            const ping = match ? parseInt(match[1]) : 0;
            if (ping >= 1000) {
                btn.style.background = 'rgba(234, 179, 8, 0.1)';
                btn.style.color = '#eab308';
                btn.style.borderColor = 'rgba(234, 179, 8, 0.2)';
                btn.innerHTML = `⚠️ ${ping}ms`;
            } else {
                btn.style.background = 'rgba(34, 197, 94, 0.1)';
                btn.style.color = '#22c55e';
                btn.style.borderColor = 'rgba(34, 197, 94, 0.2)';
                btn.innerHTML = '✅ OK';
            }
        } else {
            btn.style.background = 'rgba(239, 68, 68, 0.1)';
            btn.style.color = '#ef4444';
            btn.style.borderColor = 'rgba(239, 68, 68, 0.2)';
            btn.innerHTML = '❌';
        }
    } catch (e) {
        btn.style.background = 'rgba(239, 68, 68, 0.1)';
        btn.style.color = '#ef4444';
        btn.style.borderColor = 'rgba(239, 68, 68, 0.2)';
        btn.innerHTML = '❌';
    }
    btn.disabled = false;
}

async function deleteWallet(id) {
    await fetch(`/api/wallets/delete/${id}`, { method: 'DELETE' });
    loadWalletsFromDB();
}

async function buyExtraSlot() {
    const username = localStorage.getItem('airdrop_username') || "Robert";
    const res = await fetch('/api/wallets/buy-slot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username })
    });
    const data = await res.json();
    if (res.ok) {
        showNotification("OK!");
        loadWalletsFromDB();
        const balEl = document.getElementById('userBalanceValue');
        if (balEl && data.balance !== undefined) balEl.innerText = `$${data.balance.toFixed(2)}`;
    } else {
        showNotification(data.detail || "Error", "error");
    }
}

// --- Планировщик и Настройки ---
function toggleSchedulerState(checkbox) {
    const wrapper = document.getElementById('schedulerSettingsWrapper');
    if (!wrapper) return;
    if (checkbox.checked) {
        wrapper.style.opacity = '1';
        wrapper.style.pointerEvents = 'auto';
    } else {
        wrapper.style.opacity = '0.35';
        wrapper.style.pointerEvents = 'none';
    }
}

function handleCalendarDayClick(element) {
    element.classList.toggle('active');
    updateDailyConfigsUI();
}

function updateDailyConfigsUI() {
    const container = document.getElementById('dailyTimeConfigsContainer');
    if (!container) return;
    const t = translations[currentLang];
    const hideAllBanners = localStorage.getItem('hide_all_banners') === 'true';
    
    const activeDays = [];
    document.querySelectorAll('#globalCalendarGrid .calendar-day.active').forEach(el => {
        activeDays.push(el.getAttribute('data-raw-day'));
    });

    if (activeDays.length === 0) {
        container.innerHTML = `<div style="font-size: 13px; color: var(--text-muted); font-style: italic; padding: 6px;">-</div>`;
        return;
    }

    let htmlContent = hideAllBanners ? '' : `
        <div style="font-size: 13px; color: #b19cd9; background: rgba(157,78,221,0.1); padding: 10px 14px; border-radius: 10px; border: 1px solid rgba(157,78,221,0.3); margin-bottom: 14px; line-height: 1.4;">
            ${t.timeAlert}
        </div>
    `;

    htmlContent += activeDays.map(day => {
        const savedTime = localStorage.getItem(`day_time_${day}`) || `${String(Math.floor(Math.random()*15)+8).padStart(2,'0')}:${String(Math.floor(Math.random()*60)).padStart(2,'0')}`;
        const savedMinDelay = localStorage.getItem(`day_min_delay_${day}`) || 60;
        const savedMaxDelay = localStorage.getItem(`day_max_delay_${day}`) || 300;
        const displayDay = t.calDays[day] || day;

        return `
            <div style="display: flex; justify-content: space-between; align-items: center; background: var(--bg-main); padding: 10px 14px; border-radius: 10px; border: 1px solid var(--border-color); margin-bottom: 6px; gap: 10px;" data-day="${day}">
                <div style="color: #fff; font-weight: bold; font-size: 13px; width: 35px;">${displayDay}</div>
                <div style="display: flex; gap: 10px; align-items: center; flex: 1; justify-content: flex-end; flex-wrap: wrap;">
                    
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <span style="font-size: 12px; color: var(--text-muted);">${t.tTime}</span>
                        <input type="text" class="auth-input day-time-val" value="${savedTime}" placeholder="15:30" maxlength="5"
                            style="padding: 6px; width: 60px; font-size: 13px; background: var(--bg-card); text-align: center;"
                            oninput="let v = this.value.replace(/[^0-9]/g, '').substring(0, 4); let h = v.substring(0, 2); let m = v.substring(2, 4); if (h && parseInt(h) > 23) h = '23'; if (m && parseInt(m) > 59) m = '59'; this.value = (v.length > 2) ? h + ':' + m : h;">
                    </div>
                    
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <span style="font-size: 12px; color: var(--text-muted);">${t.tMin}</span>
                        <input type="number" class="auth-input day-min-delay-val" value="${savedMinDelay}" min="15" max="7200" oninput="checkInputLimit(this, 7200)" style="padding: 6px; width: 65px; font-size: 13px; background: var(--bg-card);">
                    </div>
                    
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <span style="font-size: 12px; color: var(--text-muted);">${t.tMax}</span>
                        <input type="number" class="auth-input day-max-delay-val" value="${savedMaxDelay}" min="15" max="7200" oninput="checkInputLimit(this, 7200)" style="padding: 6px; width: 65px; font-size: 13px; background: var(--bg-card);">
                    </div>
                </div>
            </div>
        `;
    }).join('');
    container.innerHTML = htmlContent;
}

function randomizeGlobalSettings() {
    const now = Date.now();
    if (now - lastRandomizeTimestamp < 2500) return;
    lastRandomizeTimestamp = now;

    const allDays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
    const targetCount = Math.floor(Math.random() * 4) + 1;
    const shuffledDays = [...allDays].sort(() => 0.5 - Math.random());
    const selectedDays = shuffledDays.slice(0, targetCount);

    const dayElements = document.querySelectorAll('#globalCalendarGrid .calendar-day');
    dayElements.forEach(el => {
        if (selectedDays.includes(el.getAttribute('data-raw-day'))) el.classList.add('active');
        else el.classList.remove('active');
    });
    updateDailyConfigsUI();

    document.querySelectorAll('#dailyTimeConfigsContainer > div[data-day]').forEach(row => {
        const randHour = String(Math.floor(Math.random() * 15) + 8).padStart(2, '0');
        const randMin = String(Math.floor(Math.random() * 60)).padStart(2, '0');
        row.querySelector('.day-time-val').value = `${randHour}:${randMin}`;
        
        const minDelay = Math.floor(Math.random() * 60) + 15; 
        const maxDelay = minDelay + Math.floor(Math.random() * 240) + 60; 
        
        row.querySelector('.day-min-delay-val').value = minDelay;
        const maxField = row.querySelector('.day-max-delay-val');
        maxField.value = maxDelay;
        checkInputLimit(maxField, 7200);
    });

    const gweiInput = document.getElementById('globalGweiInput');
    if(gweiInput) {
        gweiInput.value = Math.floor(Math.random() * 120) + 25;
        checkInputLimit(gweiInput, 300);
    }
}

async function saveGlobalProfileSettings() {
    const isSchedulerEnabled = document.getElementById('bgSchedulerToggle')?.checked;
    const activeDays = [];
    document.querySelectorAll('#globalCalendarGrid .calendar-day.active').forEach(el => {
        activeDays.push(el.getAttribute('data-raw-day'));
    });

    if (isSchedulerEnabled && activeDays.length === 0) return;

    let hasError = false;
    const dailySchedule = {};
    document.querySelectorAll('#dailyTimeConfigsContainer > div[data-day]').forEach(row => {
        const day = row.getAttribute('data-day');
        const time = row.querySelector('.day-time-val').value;
        const minDelay = parseInt(row.querySelector('.day-min-delay-val').value);
        const maxDelay = parseInt(row.querySelector('.day-max-delay-val').value);
        if (isNaN(minDelay) || isNaN(maxDelay) || minDelay < 15 || maxDelay > 7200 || minDelay >= maxDelay) hasError = true;
        dailySchedule[day] = { time, minDelay, maxDelay };
    });
    if (hasError) return;

    let gwei = parseInt(document.getElementById('globalGweiInput')?.value || 30);
    if (isNaN(gwei) || gwei < 5 || gwei > 300) return;

    const now = Date.now();
    if (now - lastSaveTimestamp < 1500) return;
    lastSaveTimestamp = now;

    const telegram = document.getElementById('globalTelegramInput')?.value.trim() || '';
    localStorage.setItem('ax_telegram_chat_id', telegram);
    
    const notifySettings = document.getElementById('notifSettingsToggle')?.checked ?? true;
    const notifyStart = document.getElementById('notifStartToggle')?.checked ?? true;
    const notifySuccess = document.getElementById('notifSuccessToggle')?.checked ?? true;
    const notifyError = document.getElementById('notifErrorToggle')?.checked ?? true;

    localStorage.setItem('ax_notify_settings', notifySettings);
    localStorage.setItem('ax_notify_start', notifyStart);
    localStorage.setItem('ax_notify_success', notifySuccess);
    localStorage.setItem('ax_notify_error', notifyError);

    document.querySelectorAll('#dailyTimeConfigsContainer > div[data-day]').forEach(row => {
        const day = row.getAttribute('data-day');
        localStorage.setItem(`day_time_${day}`, row.querySelector('.day-time-val').value);
        localStorage.setItem(`day_min_delay_${day}`, parseInt(row.querySelector('.day-min-delay-val').value));
        localStorage.setItem(`day_max_delay_${day}`, parseInt(row.querySelector('.day-max-delay-val').value));
    });

    const username = localStorage.getItem('airdrop_username') || "Robert";
    const profileConfig = { 
        username,
        schedulerEnabled: isSchedulerEnabled,
        days: activeDays, 
        schedule: dailySchedule, 
        gwei, 
        telegram,
        notifySettings,
        notifyStart,
        notifySuccess,
        notifyError,
        language: currentLang
    };
    
    try {
        const response = await fetch('/api/settings/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(profileConfig)
        });
        const result = await response.json();
        if (response.ok && result.status === 'success') {
            showNotification("OK!");
        } else {
            showNotification(result.detail || "Error", "error");
        }
    } catch (err) {
        showNotification("Error", "error");
    }
}

function toggleHideBanners(checkbox) {
    localStorage.setItem('hide_all_banners', checkbox.checked);
    const t = translations[currentLang];
    showNotification(checkbox.checked ? t.msgBannersHidden : t.msgBannersShown, "success");
    renderDashboardContent(currentSection);
}

// --- Фарм и сканирование лута ---
async function startAutoFarming() {
    const netSelect = document.getElementById('farmNetwork');
    const net = netSelect ? netSelect.value : '';
    const log = document.getElementById('farm-console-logs');
    const t = translations[currentLang];

    if (!net) {
        showNotification(t.logErrNet, "error");
        if (log) log.innerHTML += `<br><span style="color: #ef4444; font-weight: bold;">⛔ ${t.logErrNet}</span>`;
        return;
    }

    if (userInternalBalance < 1.50) {
        showNotification(t.logErrBal, "error");
        if (log) log.innerHTML += `<br><span style="color: #ef4444; font-weight: bold;">⛔ ${t.logErrBal}</span>`;
        return;
    }

    if (log) log.innerHTML += `<br><span style="color: var(--text-muted);">${t.logStart} ${net}... ${t.logCost}: $1.50</span>`;
    
    const username = localStorage.getItem('airdrop_username') || "Robert";
    try {
        const res = await fetch('/api/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ wallet: "all", network: net, username })
        });
        const data = await res.json();
        
        if (res.ok) {
            if (log) log.innerHTML += `<br><span style="color: #22c55e;">✅ Фарм-сессия успешно завершена!</span>`;
            
            if (data.telegram_sent) {
                if (log) log.innerHTML += `<br><span style="color: #22c55e;">📤 Отчет успешно доставлен в Telegram!</span>`;
            } else if (!data.chat_id_configured) {
                if (log) log.innerHTML += `<br><span style="color: #eab308;">⚠️ Telegram пропущен: укажите Chat ID в настройках профиля.</span>`;
            } else {
                if (log) log.innerHTML += `<br><span style="color: #ef4444;">❌ Ошибка отправки в Telegram (проверьте, отправлен ли /start боту).</span>`;
            }

            if (data.new_balance !== undefined) {
                userInternalBalance = data.new_balance;
                const balEl = document.getElementById('userBalanceValue');
                if (balEl) balEl.innerText = `$${userInternalBalance.toFixed(2)}`;
            }
        } else {
            if (log) log.innerHTML += `<br><span style="color: #ef4444;">❌ Ошибка: ${data.detail}</span>`;
        }
    } catch (e) {
        showNotification("Error", "error");
    }
}

async function startScanningDrops() {
    const log = document.getElementById('drop-logs');
    const username = localStorage.getItem('airdrop_username') || "Robert";
    const res = await fetch(`/api/scan/${username}`, { method: 'POST' });
    const data = await res.json();
    if (log) log.innerHTML += `<br><span style="color: #22c55e;">✅ Checked: ${data.data.total_wallets_scanned} | Found: ${data.data.found_drops.length}</span>`;
}

async function topUpBalanceModal() {
    const modal = document.getElementById('authModal');
    const container = document.getElementById('modalContainer');
    if (!modal || !container) return;

    modal.classList.add('show');
    const defaultAmount = "25";
    const t = translations[currentLang];

    container.innerHTML = `
        <div class="modal-logo" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
            <span style="font-weight:bold; font-size:16px;">💳 ${t.btnTopUp}</span>
            <span onclick="closeAuthModal()" style="cursor: pointer; color: #a3a3a3; font-size: 18px;">✕</span>
        </div>
        
        <div class="input-group" style="margin-bottom:12px;">
            <label style="font-size: 12px; color: #a3a3a3; display: block; margin-bottom: 4px;">USD</label>
            <input type="number" class="auth-input" value="25" id="topupAmountInput" min="1" max="10000" style="padding: 10px; font-size: 14px;" oninput="updateTopupQR(this.value)">
        </div>

        <div style="margin-bottom: 12px;">
            <label style="font-size: 12px; color: #a3a3a3; display: block; margin-bottom: 4px;">${t.payNetwork}</label>
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px;">
                <button type="button" class="btn-dark-sm auth-input" id="net-base" onclick="setTopupNetwork('Base', '${MASTER_WALLET}')" style="background:#1f1f1f; border-color:#fff; cursor:pointer;">Base L2</button>
                <button type="button" class="btn-dark-sm auth-input" id="net-arb" onclick="setTopupNetwork('Arbitrum', '${MASTER_WALLET}')" style="cursor:pointer;">Arbitrum</button>
                <button type="button" class="btn-dark-sm auth-input" id="net-eth" onclick="setTopupNetwork('Ethereum', '${MASTER_WALLET}')" style="cursor:pointer;">Ethereum</button>
            </div>
        </div>

        <div style="background:#0a0a0a; border:1px solid var(--border-color); border-radius:12px; padding:12px; margin-bottom:12px; text-align:center;">
            <div style="font-size:12px; color:#a3a3a3; margin-bottom:2px;">${t.payWallet} (<span id="activeTopupNet">Base L2</span>):</div>
            <div style="background:#181818; padding:6px 8px; border-radius:8px; font-family:monospace; font-size:12px; color:#fff; word-break:break-all; margin-bottom:6px;">${MASTER_WALLET}</div>
            <button type="button" class="auth-input" style="margin: 0 auto; font-size: 12px; padding: 6px 12px; width:auto; cursor:pointer;" onclick="copyWalletAddress('${MASTER_WALLET}', this)">${t.payCopy}</button>
            <div id="qrcodeTopupContainer" style="display:flex; justify-content:center; align-items:center; margin:10px auto 0 auto; background:#fff; padding:8px; border-radius:8px; width:110px; height:110px; box-sizing:border-box; overflow:hidden;"></div>
        </div>

        <div class="input-group" style="margin-bottom:12px;">
            <label style="font-size: 12px; color: #a3a3a3; display: block; margin-bottom: 4px;">${t.payTxid}</label>
            <input type="text" class="auth-input" placeholder="0x..." id="topupTxidInput">
        </div>

        <button type="button" class="btn-modal-primary" onclick="submitTopUpBalance()" style="width:100%; padding:10px;">OK</button>
        <div id="topupStatusContainer"></div>
    `;
    setTimeout(() => renderTopupQR(MASTER_WALLET, defaultAmount), 100);
}

function setTopupNetwork(netName, address) {
    document.getElementById('activeTopupNet').innerText = netName;
    const amount = document.getElementById('topupAmountInput').value || '25';
    renderTopupQR(address, amount);
}

function updateTopupQR(amount) {
    renderTopupQR(MASTER_WALLET, amount || '25');
}

function renderTopupQR(walletAddress, displayAmount) {
    const qrEl = document.getElementById('qrcodeTopupContainer');
    if (qrEl && window.qrcode) {
        try {
            qrEl.innerHTML = '';
            const qr = qrcode(0, 'M');
            qr.addData(`ethereum:${walletAddress}?value=${displayAmount}`);
            qr.make();
            qrEl.innerHTML = qr.createSvgTag({cellSize: 4, margin: 1});
            const svg = qrEl.querySelector('svg');
            if (svg) { svg.style.width = '100%'; svg.style.height = '100%'; svg.style.display = 'block'; }
        } catch(e) {}
    }
}

async function submitTopUpBalance() {
    const amountInput = document.getElementById('topupAmountInput').value.trim();
    const txidInput = document.getElementById('topupTxidInput').value.trim();
    const status = document.getElementById('topupStatusContainer');

    const amount = parseFloat(amountInput);
    if (isNaN(amount) || amount <= 0 || !txidInput) {
        status.innerHTML = `<div style="color:#ef4444; font-size:12px; margin-top:8px;">Error!</div>`;
        return;
    }

    const username = localStorage.getItem('airdrop_username') || "Robert";
    try {
        const res = await fetch('/api/balance/deposit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, amount, txid: txidInput })
        });
        const data = await res.json();
        
        if (res.ok && data.status === 'success') {
            userInternalBalance = data.new_balance;
            closeAuthModal();
            renderDashboardContent('Account');
        } else {
            status.innerHTML = `<div style="color:#ef4444; font-size:12px; margin-top:8px;">${data.detail || 'Error'}</div>`;
        }
    } catch (e) {
        status.innerHTML = `<div style="color:#ef4444; font-size:12px; margin-top:8px;">Error</div>`;
    }
}

async function loadPlatformStats() {
    try {
        const res = await fetch('/api/stats');
        const data = await res.json();
        window.cachedStatsData = data;
        const counterEl = document.getElementById('slots-counter-text');
        const t = translations[currentLang];
        
        if (counterEl) {
            counterEl.innerHTML = `${t.privateSoftware}. <b style="color:#fff; margin-left:8px;">${data.current_slots} / ${data.max_slots} SLOTS</b>`;
        }

        if (data.is_sold_out) {
            const farmBtn = document.getElementById('farm-btn');
            if (farmBtn) {
                farmBtn.innerText = "Sold Out";
                farmBtn.style.opacity = "0.5";
                farmBtn.style.pointerEvents = "none";
            }
        }
    } catch (e) {
        console.error("Stats Error:", e);
    }
}

function hideProxyTip() {
    localStorage.setItem('hideProxyTip', 'true');
    const box = document.getElementById('proxyTipBox');
    if (box) box.style.display = 'none';
}

// --- Рендеринг Дашборда ---
function renderDashboardContent(section) {
    currentSection = section;
    const t = translations[currentLang] || translations['ru'];
    const content = document.getElementById('dashboard-content');
    const username = localStorage.getItem('airdrop_username') || "Robert";
    const hideAllBanners = localStorage.getItem('hide_all_banners') === 'true';

    let centerHtml = '';
    
    if (section === 'Account') {
        let guideHtml = '';
        if (showWelcomeGuide && !hideAllBanners) {
            guideHtml = `
                <div style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 16px; padding: 18px; margin-bottom: 16px; position: relative;" id="welcomeGuideBox">
                    <span onclick="document.getElementById('welcomeGuideBox').style.display='none'; showWelcomeGuide=false;" style="position: absolute; right: 18px; top: 18px; cursor: pointer; color: var(--text-muted); font-size: 16px;">✕</span>
                    <h4 style="color: #fff; margin: 0 0 8px 0; font-size: 15px;">👋 ${t.accWelcome}, ${username}!</h4>
                    <p style="color: var(--text-muted); font-size: 13px; margin: 0; line-height: 1.5;">
                        ${t.accWelcomeDesc}
                    </p>
                </div>
            `;
        }

        centerHtml = `
            ${guideHtml}

            <div class="dashboard-card" style="margin-bottom: 16px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                    <h3 style="color: #fff; margin: 0; font-size: 16px;">${t.accTitle}</h3>
                    <button type="button" onclick="topUpBalanceModal()" class="btn-purple-lg" style="width:auto; padding:8px 16px; font-size:13px;">${t.btnTopUp}</button>
                </div>
                <div style="font-size:24px; font-weight:bold; color:#fff; margin-bottom:4px;" id="userBalanceValue">${t.loading}</div>
                <div style="font-size:13px; color:var(--text-muted);">${t.accDesc}</div>
            </div>

            <div class="dashboard-card" style="margin-bottom: 16px;">
                <h3 style="color: #fff; margin-top: 0; font-size: 16px;">${t.txTitle}</h3>
                <div id="transactionsListContainer" style="max-height:180px; overflow-y:auto; margin-top:10px;">${t.loading}</div>
            </div>

            <div class="dashboard-card">
                <h3 style="color: #fff; margin-top: 0; font-size: 16px;">${t.subTitle}</h3>
                <p style="color: var(--text-muted); font-size: 13px; line-height: 1.5;">${t.subPlan}: <b>${userPlan}</b> | ${t.subActive} (${subscriptionDaysLeft} ${t.days})</p>
                <button type="button" onclick="openPricingModal()" class="btn-dark-sm" style="margin-top:12px;">${t.btnChangePlan}</button>
            </div>
        `;

        const setEmptyState = () => {
            const balEl = document.getElementById('userBalanceValue');
            if (balEl) balEl.innerText = '$0.00';
            const txContainer = document.getElementById('transactionsListContainer');
            if (txContainer) {
                txContainer.innerHTML = `
                    <div style="color:var(--text-muted); font-size:13px; text-align:center; padding: 24px; border: 1px dashed var(--border-color); border-radius: 12px; background: rgba(255,255,255,0.02);">
                        ${t.noTx}
                    </div>
                `;
            }
        };

        setTimeout(async () => {
            try {
                const res = await fetch(`/api/balance/${username}`);
                if (!res.ok) { setEmptyState(); return; }
                const data = await res.json();
                
                if (data.status === 'success') {
                    userInternalBalance = data.balance || 0;
                    const balEl = document.getElementById('userBalanceValue');
                    if (balEl) balEl.innerText = `$${userInternalBalance.toFixed(2)}`;

                    const txContainer = document.getElementById('transactionsListContainer');
                    if (txContainer) {
                        if (data.transactions && data.transactions.length > 0) {
                            txContainer.innerHTML = data.transactions.map(tx => `
                                <div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-main); padding:10px 14px; border-radius:10px; margin-bottom:8px; font-size:13px; border:1px solid var(--border-color);">
                                    <div>
                                        <span style="color:#fff; font-weight:600;">${tx.type === 'deposit' ? t.txDep : tx.type === 'slot_purchase' ? t.txSlot : t.txGas}</span>
                                        <span style="color:var(--text-muted); font-size:12px; margin-left:8px;">${tx.date}</span>
                                    </div>
                                    <div style="text-align:right;">
                                        <span style="color:${tx.type === 'deposit' ? '#22c55e' : '#fff'}; font-weight:bold;">${tx.amount}</span>
                                    </div>
                                </div>
                            `).join('');
                        } else {
                            setEmptyState();
                        }
                    }
                } else {
                    setEmptyState();
                }
            } catch (e) {
                setEmptyState(); 
            }
        }, 50);

} else if (section === 'Settings') {
        const notifSettingsChecked = localStorage.getItem('ax_notify_settings') !== 'false' ? 'checked' : '';
        const notifStartChecked = localStorage.getItem('ax_notify_start') !== 'false' ? 'checked' : '';
        const notifSuccessChecked = localStorage.getItem('ax_notify_success') !== 'false' ? 'checked' : '';
        const notifErrorChecked = localStorage.getItem('ax_notify_error') !== 'false' ? 'checked' : '';
        const savedTelegramId = localStorage.getItem('ax_telegram_chat_id') || '';

        const antiSybilWarningHtml = hideAllBanners ? '' : `
            <div id="antiSybilWarningBox" style="background: linear-gradient(135deg, rgba(234, 179, 8, 0.12), rgba(234, 179, 8, 0.03)); border: 1px solid rgba(234, 179, 8, 0.35); border-radius: 16px; padding: 18px 20px; margin-bottom: 18px; display: flex; gap: 14px; align-items: flex-start; position: relative; box-shadow: 0 4px 20px rgba(0,0,0,0.2);">
                <span style="font-size: 20px; margin-top: 1px;">🛡️</span>
                <div style="flex: 1;">
                    <div style="color: #eab308; font-weight: bold; font-size: 14px; margin-bottom: 4px; letter-spacing: 0.3px;">${t.setWarnTitle}</div>
                    <div style="color: var(--text-muted); font-size: 13px; line-height: 1.5;">${t.setWarnDesc}</div>
                </div>
                <span onclick="document.getElementById('antiSybilWarningBox').style.display='none'" style="cursor: pointer; color: var(--text-muted); font-size: 16px; padding: 2px 6px; transition: color 0.2s;" onmouseover="this.style.color='#fff'" onmouseout="this.style.color='var(--text-muted)'">✕</span>
            </div>
        `;

        const telegramTipBoxHtml = hideAllBanners ? '' : `
            <div style="background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.3); border-radius: 10px; padding: 10px 12px; margin-top: 8px; font-size: 12px; color: var(--text-muted); line-height: 1.4;">
                ℹ️ ${t.tgTip} <b style="color:#fff;">AirdropX Bot (@AirdropX_Support_Bot)</b> ${t.tgTip2} <code style="color:#fff; background:#1f1f1f; padding:2px 4px; border-radius:4px;">/start</code> ${t.tgTip3}
            </div>
        `;

        centerHtml = `
            ${antiSybilWarningHtml}

            <div class="dashboard-card" style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 18px; padding: 22px; box-shadow: 0 8px 30px rgba(0,0,0,0.4); margin-bottom: 16px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 16px; border-bottom: 1px solid var(--border-color); padding-bottom: 14px;">
                    <div>
                        <h3 style="color: #fff; margin: 0 0 4px 0; font-size: 16px; font-weight: 600;">${t.setTitle}</h3>
                        <p style="color: var(--text-muted); font-size: 13px; margin: 0;">${t.setDesc}</p>
                    </div>
                    <button type="button" onclick="randomizeGlobalSettings()" style="background: linear-gradient(135deg, #2563eb, #1d4ed8); color:#fff; border:none; padding: 8px 14px; border-radius: 10px; font-size: 12px; cursor:pointer; font-weight: 600; box-shadow: 0 4px 12px rgba(37,99,235,0.3);">${t.btnRand}</button>
                </div>
                
                <div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-main); padding:14px 16px; border-radius:14px; border:1px solid var(--border-color); margin-bottom:18px;">
                    <div>
                        <div style="color:#fff; font-size:14px; font-weight:600;">${t.setBgTitle}</div>
                        <div style="color:var(--text-muted); font-size:12px; margin-top:2px;">${t.setBgDesc}</div>
                    </div>
                    <label class="toggle-switch">
                        <input type="checkbox" id="bgSchedulerToggle" checked onchange="toggleSchedulerState(this)">
                        <span class="toggle-slider"></span>
                    </label>
                </div>

                <div id="schedulerSettingsWrapper" style="transition: opacity 0.3s ease;">
                    <div style="font-size:13px; color:var(--text-muted); margin-bottom:8px; font-weight:600;">${t.setDays}</div>
                    
                    <div class="calendar-grid" id="globalCalendarGrid" style="margin-bottom:16px; display: flex; gap: 8px; flex-wrap: wrap;">
                        <div class="calendar-day active" data-raw-day="Пн" onclick="handleCalendarDayClick(this)" style="cursor:pointer; user-select:none; flex: 1; min-width: 45px; padding: 12px 6px; font-size: 13px;">${t.calDays['Пн']}</div>
                        <div class="calendar-day active" data-raw-day="Вт" onclick="handleCalendarDayClick(this)" style="cursor:pointer; user-select:none; flex: 1; min-width: 45px; padding: 12px 6px; font-size: 13px;">${t.calDays['Вт']}</div>
                        <div class="calendar-day active" data-raw-day="Ср" onclick="handleCalendarDayClick(this)" style="cursor:pointer; user-select:none; flex: 1; min-width: 45px; padding: 12px 6px; font-size: 13px;">${t.calDays['Ср']}</div>
                        <div class="calendar-day active" data-raw-day="Чт" onclick="handleCalendarDayClick(this)" style="cursor:pointer; user-select:none; flex: 1; min-width: 45px; padding: 12px 6px; font-size: 13px;">${t.calDays['Чт']}</div>
                        <div class="calendar-day" data-raw-day="Пт" onclick="handleCalendarDayClick(this)" style="cursor:pointer; user-select:none; flex: 1; min-width: 45px; padding: 12px 6px; font-size: 13px;">${t.calDays['Пт']}</div>
                        <div class="calendar-day" data-raw-day="Сб" onclick="handleCalendarDayClick(this)" style="cursor:pointer; user-select:none; flex: 1; min-width: 45px; padding: 12px 6px; font-size: 13px;">${t.calDays['Сб']}</div>
                        <div class="calendar-day" data-raw-day="Вс" onclick="handleCalendarDayClick(this)" style="cursor:pointer; user-select:none; flex: 1; min-width: 45px; padding: 12px 6px; font-size: 13px;">${t.calDays['Вс']}</div>
                    </div>

                    <div style="font-size:13px; color:var(--text-muted); margin-bottom:8px; font-weight:600;">${t.setTimeTitle}</div>
                    <div id="dailyTimeConfigsContainer" style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 18px;"></div>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 16px;">
                    <div>
                        <label style="font-size: 12px; color: var(--text-muted); display: block; margin-bottom: 6px;">${t.setGwei}</label>
                        <input type="number" class="auth-input" value="30" min="5" max="300" id="globalGweiInput" oninput="checkInputLimit(this, 300)" style="padding: 10px 12px; background: var(--bg-main); border-radius: 10px; font-size: 13px;">
                    </div>
                    <div>
                        <label style="font-size: 12px; color: var(--text-muted); display: block; margin-bottom: 6px;">${t.setTg}</label>
                        <input type="text" class="auth-input" placeholder="${t.tgPh}" id="globalTelegramInput" value="${savedTelegramId}" style="padding: 10px 12px; background: var(--bg-main); border-radius: 10px; font-size: 13px;">
                        ${telegramTipBoxHtml}
                    </div>
                </div>

                <div style="background: var(--bg-main); border: 1px solid var(--border-color); border-radius: 12px; padding: 16px; margin-bottom: 18px;">
                    <div style="font-size: 13px; color: #fff; font-weight: 600; margin-bottom: 12px;">${t.notifTitle}</div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 13px; color: var(--text-muted);">
                        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;"><input type="checkbox" id="notifSettingsToggle" ${notifSettingsChecked}> ${t.notif1}</label>
                        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;"><input type="checkbox" id="notifStartToggle" ${notifStartChecked}> ${t.notif2}</label>
                        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;"><input type="checkbox" id="notifSuccessToggle" ${notifSuccessChecked}> ${t.notif3}</label>
                        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;"><input type="checkbox" id="notifErrorToggle" ${notifErrorChecked}> ${t.notif4}</label>
                    </div>
                </div>

                <button type="button" onclick="saveGlobalProfileSettings()" class="btn-modal-primary" style="width:100%; padding: 12px; font-size: 14px; font-weight: 600; border-radius: 12px; cursor: pointer;">${t.btnSaveSet}</button>
            </div>

            <!-- Блок интерфейса и подсказок перемещен вниз и оформлен как карточка дашборда -->
            <div class="dashboard-card" style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 18px; padding: 22px; box-shadow: 0 8px 30px rgba(0,0,0,0.4);">
                <div style="color: #fff; font-weight: 700; font-size: 16px; margin-bottom: 4px;">${t.setInterfaceTitle}</div>
                <div style="color: var(--text-muted); font-size: 13px; margin-bottom: 14px;">${t.setInterfaceDesc}</div>
                <label style="display: flex; align-items: center; justify-content: space-between; cursor: pointer;">
                    <span style="color: #fff; font-size: 13px; font-weight: 500;">${t.setHideAllBanners}</span>
                    <label class="switch">
                        <input type="checkbox" ${hideAllBanners ? 'checked' : ''} onchange="toggleHideBanners(this)">
                        <span class="slider"></span>
                    </label>
                </label>
            </div>
        `;
        setTimeout(updateDailyConfigsUI, 50);

    } else if (section === 'Looter') {
        centerHtml = `
            <div class="dashboard-card">
                <h3 style="color: #fff; margin-top: 0; font-size: 16px;">🚀 ${t.lootTitle}</h3>
                <p style="color: var(--text-muted); font-size: 13px; line-height: 1.5;">${t.lootDesc}</p>
                <button type="button" onclick="startScanningDrops()" class="btn-purple-lg" style="font-size: 13px; padding: 12px 20px; width:auto; margin-top: 4px;">${t.btnScan}</button>
                <div id="drop-logs" style="margin-top: 16px; background: var(--bg-main); padding: 16px; border-radius: 12px; font-family: monospace; font-size: 13px; line-height: 1.5; color: var(--text-muted); min-height: 250px; max-height: 380px; overflow-y: auto; border: 1px solid var(--border-color);">${t.logInitLoot}</div>
            </div>
        `;
    } else if (section === 'Farming') {
        centerHtml = `
            <div class="dashboard-card">
                <h3 style="color: #fff; margin-top: 0; font-size: 16px;">${t.farmTitle}</h3>
                <p style="color: var(--text-muted); font-size: 13px; line-height: 1.5; margin-bottom: 12px;">${t.farmDesc} (${t.subPlan}: <b>${userPlan}</b>)</p>
                <label style="color: var(--text-muted); font-size: 12px; display: block; margin-bottom: 6px;">${t.netSelect}</label>
                <select class="auth-input" id="farmNetwork" style="margin-bottom: 14px; font-size: 13px; padding: 10px 12px;">
                    <option value="" disabled selected>${t.netPh}</option>
                    <option value="Base">Base L2</option>
                    <option value="Ethereum">Ethereum Mainnet</option>
                    <option value="Arbitrum">Arbitrum One</option>
                    <option value="Linea">Linea Mainnet</option>
                    <option value="Solana">Solana</option>
                    <option value="BNB Chain">BNB Chain (BSC)</option>
                    <option value="Polygon">Polygon (POL)</option>
                    <option value="Optimism">Optimism</option>
                    <option value="Tron">Tron</option>
                </select>
                <button type="button" onclick="startAutoFarming()" class="btn-purple-lg" style="font-size: 13px; padding: 12px 20px; width:auto;">${t.btnFarm}</button>
                <div id="farm-console-logs" style="margin-top: 16px; background: var(--bg-main); padding: 16px; border-radius: 12px; font-family: monospace; font-size: 13px; line-height: 1.5; color: #22c55e; min-height: 250px; max-height: 380px; overflow-y: auto; border: 1px solid var(--border-color);">${t.logWait}</div>
            </div>
        `;
    } else if (section === 'Wallets') {
        const isTipHidden = localStorage.getItem('hideProxyTip') === 'true' || hideAllBanners;
        const proxyTipHtml = isTipHidden ? '' : `
            <div id="proxyTipBox" style="background: rgba(59, 130, 246, 0.08); border: 1px solid rgba(59, 130, 246, 0.2); padding: 12px 14px; border-radius: 10px; font-size: 12px; color: #93c5fd; display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; box-sizing: border-box; line-height: 1.4;">
                <div style="display: flex; align-items: flex-start; gap: 8px;">
                    <span style="font-size: 14px; line-height: 1;">💡</span>
                    <div>
                        <b style="color: #bfdbfe;">${t.proxyTipTitle}</b> ${t.proxyTipDesc}
                    </div>
                </div>
                <button type="button" onclick="hideProxyTip()" style="background: none; border: none; color: #93c5fd; cursor: pointer; font-size: 16px; padding: 0; line-height: 1; opacity: 0.7;" title="X">×</button>
            </div>
        `;

        centerHtml = `
            <div class="dashboard-card" style="margin-bottom: 16px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                    <h3 style="color: #fff; margin: 0; font-size: 16px;">${t.walTitle}</h3>
                    <span id="slot-info-badge" style="font-size: 12px; background: #1f1f1f; color: #fff; padding: 6px 12px; border-radius: 8px; border: 1px solid var(--border-color);">${t.loading}</span>
                </div>
                <div id="walletsListContainer" style="display: flex; flex-direction: column; gap: 8px;">${t.loading}</div>
                <button type="button" onclick="buyExtraSlot()" class="auth-input" style="margin-top: 12px; width: auto; font-size: 13px; background:#1f1f1f; cursor:pointer; padding: 10px 16px;">${t.btnBuySlot}</button>
                <div id="buySlotMsg" style="margin-top: 6px; font-size:12px;"></div>
            </div>
            <div class="dashboard-card">
                <h3 style="color: #fff; margin-top: 0; font-size: 16px;">${t.walAddTitle}</h3>
                <div style="display: flex; flex-direction: column; gap: 10px;">
                    <input type="text" id="newWalletAddress" placeholder="${t.phAddr}" class="auth-input" style="font-size: 13px; padding: 10px 12px;">
                    <input type="password" id="newWalletPk" placeholder="${t.phPk}" class="auth-input" style="font-size: 13px; padding: 10px 12px;">
                    ${proxyTipHtml}
                    <input type="text" id="newWalletProxy" placeholder="${t.phProxy}" class="auth-input" style="font-size: 13px; padding: 10px 12px;">
                    <button type="button" onclick="addNewWalletToDB()" class="btn-modal-primary" style="margin-top:4px; padding: 12px; font-size: 14px;">${t.btnAddWal}</button>
                </div>
                <div id="walletResponseMsg" style="margin-top: 8px; font-size:12px;"></div>
            </div>
        `;
        setTimeout(loadWalletsFromDB, 50);
    } else if (section === 'Networks') {
        const networksHtml = NETWORKS_CONFIG.map(net => `
            <div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-main); padding:16px 20px; border-radius:16px; margin-bottom:10px; border:1px solid var(--border-color);">
                <div style="display:flex; align-items:center; gap:16px;">
                    <div style="display:flex; align-items:center; justify-content:center; width:32px; height:32px;">${net.icon}</div>
                    <div style="display: flex; flex-direction: column; gap: 4px;">
                        <div style="color:#fff; font-weight:700; font-size:15px;">${net.name} <span style="font-size: 12px; color: var(--text-muted); font-weight: normal;">(${net.symbol})</span></div>
                        <div style="font-size:13px; color: var(--text-muted);">${t.gasLabel} <span id="gas-${net.key}" style="color:#eab308; font-weight:bold;">${t.loading}</span></div>
                        <div style="color: #38bdf8; font-size: 13px; font-weight: 600; font-family: monospace;" id="timer-${net.key}">${formatCountdown(net.deadline)}</div>
                    </div>
                </div>
                <div>
                    <a href="${net.explorer}" target="_blank" style="text-decoration:none; background:#1f1f1f; color:#fff; padding:8px 14px; border-radius:10px; font-size:13px; border:1px solid var(--border-color); transition: background 0.2s;" onmouseover="this.style.background='#333'" onmouseout="this.style.background='#1f1f1f'">${t.btnExp}</a>
                </div>
            </div>
        `).join('');

        const networkGuideHtml = hideAllBanners ? '' : `
            <div id="guide-box" style="position: relative; background: rgba(157,78,221,0.08); border: 1px solid rgba(157,78,221,0.25); border-radius: 14px; padding: 16px 18px; margin-bottom: 18px; font-size: 13px; color: var(--text-muted); line-height: 1.5;">
                <button onclick="document.getElementById('guide-box').style.display='none'" style="position: absolute; top: 14px; right: 16px; background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 16px; font-weight: bold;" onmouseover="this.style.color='#fff'" onmouseout="this.style.color='var(--text-muted)'">✕</button>
                <b style="color: #fff;">${t.guideTitle}</b><br>
                • <b style="color: #c77dff;">Gwei</b> ${t.guideGwei}<br>
                • <b style="color: #c77dff;">Sun</b> ${t.guideSun}<br>
                • <b style="color: #c77dff;">Micro-lamports</b> ${t.guideLamports}<br>
                • <b style="color: #c77dff;">N/A</b> ${t.guideNA}
            </div>
        `;

        centerHtml = `
            <div class="dashboard-card">
                <h3 style="color: #fff; margin-top: 0; font-size: 16px; margin-bottom: 6px;">${t.netTitle}</h3>
                <p style="color: var(--text-muted); font-size: 13px; margin-bottom: 14px; line-height: 1.5;">${t.netDesc}</p>
                
                ${networkGuideHtml}

                <div>${networksHtml}</div>
            </div>
        `;

        if (window.networksTimerInterval) clearInterval(window.networksTimerInterval);
        window.networksTimerInterval = setInterval(() => {
            NETWORKS_CONFIG.forEach(net => {
                const timerEl = document.getElementById(`timer-${net.key}`);
                if (timerEl) {
                    timerEl.innerText = formatCountdown(net.deadline);
                }
            });
        }, 1000);

        setTimeout(async () => {
            for (let net of NETWORKS_CONFIG) {
                try {
                    const res = await fetch(`/api/gas/${net.key}`);
                    const data = await res.json();
                    const el = document.getElementById(`gas-${net.key}`);
                    if (el) el.innerText = data.gas || "N/A";
                } catch(e) {
                    const el = document.getElementById(`gas-${net.key}`);
                    if (el) el.innerText = "N/A";
                }
            }
        }, 100);
    }

    // Общий вывод дашборда
    content.innerHTML = `
        <div class="desktop-sidebar" style="height: fit-content; align-self: flex-start;">
            <div style="border-bottom: 1px solid var(--border-color); padding-bottom: 12px; margin-bottom: 8px;">
                <div style="font-weight: 600; color: #fff; font-size: 14px;">${username}</div>
                <div style="font-size: 12px; color: var(--text-muted);">${t.subPlan}: ${userPlan}</div>
                <div style="font-size: 11px; color: #22c55e; margin-top: 4px;">${t.subActive} (${subscriptionDaysLeft} ${t.days})</div>
            </div>

            <div style="display: flex; flex-direction: column; gap: 2px;">
                <div style="font-size: 11px; color: #737373; text-transform: uppercase; padding: 4px 8px; font-weight: bold;">${t.menuMain}</div>
                <div class="sidebar-menu-item ${section === 'Account' ? 'active' : ''}" onclick="switchMenu(this, 'Account')">${t.menuAcc}</div>
                <div class="sidebar-menu-item ${section === 'Looter' ? 'active' : ''}" onclick="switchMenu(this, 'Looter')">${t.menuLooter}</div>
                <div class="sidebar-menu-item ${section === 'Farming' ? 'active' : ''}" onclick="switchMenu(this, 'Farming')">${t.menuFarm}</div>
                <div class="sidebar-menu-item ${section === 'Wallets' ? 'active' : ''}" onclick="switchMenu(this, 'Wallets')">${t.menuWallets}</div>
                <div class="sidebar-menu-item ${section === 'Networks' ? 'active' : ''}" onclick="switchMenu(this, 'Networks')">${t.menuNet}</div>
                <div class="sidebar-menu-item ${section === 'Settings' ? 'active' : ''}" onclick="switchMenu(this, 'Settings')">${t.menuSet}</div>
                
                <div class="sidebar-menu-item" style="color: #ef4444; margin-top: 4px;" onclick="returnToMainSite()">
                    ${t.menuExit}
                </div>
            </div>
        </div>
        <div style="flex: 1; display: flex; flex-direction: column; gap: 16px; min-width: 0;">${centerHtml}</div>
    `;
}
