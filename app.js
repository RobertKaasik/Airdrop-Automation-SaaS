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
    const feedback = document.createElement('div');
    feedback.className = cls;
    feedback.textContent = String(message || '');
    container.replaceChildren(feedback);
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
        if (!button.dataset.defaultText) button.dataset.defaultText = button.innerText;
        button.classList.add('btn-loading');
        button.disabled = true;
        button.innerText = text || t('loading');
    } else {
        button.classList.remove('btn-loading');
        button.disabled = false;
        const defaultText = text || button.dataset.defaultText || '';
        if (defaultText) button.innerText = defaultText;
        delete button.dataset.defaultText;
    }
}
let userPlan = 'Standard';
let deviceFingerprint = generateDeviceFingerprint();
let subscriptionDaysLeft = 29;
let showWelcomeGuide = true;
let activeSafeStartStep = 0;

let codeCooldownTimer = null;
let codeCooldownSeconds = 0;
let confirmedRegistrationEmail = sessionStorage.getItem('ax_registration_email') || '';
let passwordResetCooldownTimer = null;
let passwordResetCooldownSeconds = 0;
let currentEditingWallet = null;
let activeOperationWalletId = null;
let activeOperationBalanceData = null;
let activeUniversalBridgeAsset = null;
let universalBridgeTokensByNetwork = {};
let activeUniversalBridgeQuote = null;
let universalBridgeRefreshTimer = null;
let universalBridgeCooldownTimer = null;
const universalBridgeRefreshCooldowns = new Map();
let directTransferWallets = [];
let directTransferBalanceData = null;
let operationsJournalFilter = 'all';
let operationsJournalCheckCooldownUntil = 0;
let lastSaveTimestamp = 0; 
let lastRandomizeTimestamp = 0; 
let cachedStatsData = { current_slots: 1, max_slots: 300, is_sold_out: false };

const PLAN_PRICES = { Standard: 29, Pro: 49, Premium: 89 };
const clientSessionId = getOrCreateClientSessionId();
let paymentAccessToken = sessionStorage.getItem('ax_payment_token') || '';
let paymentUnlocked = sessionStorage.getItem('ax_paid_session_id') === clientSessionId && !!paymentAccessToken;

if (typeof window.fetch === 'function') {
    const nativeFetch = window.fetch.bind(window);
    window.fetch = (resource, options = {}) => {
        const requestUrl = typeof resource === 'string' ? resource : resource.url;
        const accessToken = sessionStorage.getItem('ax_access_token');
        if (!accessToken || !requestUrl || !requestUrl.startsWith('/api/')) {
            return nativeFetch(resource, options);
        }
        const headers = new Headers(options.headers || {});
        headers.set('Authorization', `Bearer ${accessToken}`);
        return nativeFetch(resource, { ...options, headers }).then((response) => {
            if (response.status === 401 && !requestUrl.startsWith('/api/login')) {
                handleExpiredAuthSession();
            }
            return response;
        });
    };
}

const MASTER_WALLET = "0x5e5316Dea1c44d220d4c60A5fcC2949E5A06Fc66";
const BASE_MAINNET_CHAIN_ID = '0x2105';
const BASE_MAINNET_CONFIG = {
    chainId: BASE_MAINNET_CHAIN_ID,
    chainName: 'Base Mainnet',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: ['https://mainnet.base.org'],
    blockExplorerUrls: ['https://base.blockscout.com'],
};
const UNIVERSAL_BRIDGE_NETWORKS = {
    Ethereum: {
        chainId: '0x1', chainName: 'Ethereum Mainnet',
        nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
        rpcUrls: ['https://ethereum-rpc.publicnode.com'], blockExplorerUrls: ['https://etherscan.io'],
    },
    Base: BASE_MAINNET_CONFIG,
    Arbitrum: {
        chainId: '0xa4b1', chainName: 'Arbitrum One',
        nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
        rpcUrls: ['https://arb1.arbitrum.io/rpc'], blockExplorerUrls: ['https://arbiscan.io'],
    },
    Optimism: {
        chainId: '0xa', chainName: 'OP Mainnet',
        nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
        rpcUrls: ['https://mainnet.optimism.io'], blockExplorerUrls: ['https://optimistic.etherscan.io'],
    },
    Polygon: {
        chainId: '0x89', chainName: 'Polygon PoS',
        nativeCurrency: { name: 'POL', symbol: 'POL', decimals: 18 },
        rpcUrls: ['https://polygon-bor-rpc.publicnode.com'], blockExplorerUrls: ['https://polygonscan.com'],
    },
    Linea: {
        chainId: '0xe708', chainName: 'Linea',
        nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
        rpcUrls: ['https://rpc.linea.build'], blockExplorerUrls: ['https://lineascan.build'],
    },
    'BNB Chain': {
        chainId: '0x38', chainName: 'BNB Smart Chain',
        nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
        rpcUrls: ['https://bsc-rpc.publicnode.com'], blockExplorerUrls: ['https://bscscan.com'],
    },
};
const UNIVERSAL_BRIDGE_NATIVE_TOKEN = '0x0000000000000000000000000000000000000000';
const BASE_SEPOLIA_CHAIN_ID = '0x14a34';
const BASE_SEPOLIA_CONFIG = {
    chainId: BASE_SEPOLIA_CHAIN_ID,
    chainName: 'Base Sepolia',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: ['https://sepolia.base.org'],
    blockExplorerUrls: ['https://sepolia-explorer.base.org'],
};
const WALLETCONNECT_PROVIDER_MODULE_URL = 'https://esm.sh/@walletconnect/ethereum-provider@2.23.10?bundle&target=es2022';
let walletConnectProvider = null;
let walletConnectModulePromise = null;

const NETWORKS_CONFIG = [
    { name: "Ethereum", symbol: "ETH", key: "Ethereum", icon: '<img src="https://cryptologos.cc/logos/ethereum-eth-logo.svg?v=032" style="width:32px; height:32px;">', explorer: "https://etherscan.io" },
    { name: "Base", symbol: "ETH", key: "Base", icon: '<img src="https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/base/info/logo.png" style="width:32px; height:32px; border-radius:50%;">', explorer: "https://basescan.org" },
    { name: "Arbitrum", symbol: "ARB", key: "Arbitrum", icon: '<img src="https://cryptologos.cc/logos/arbitrum-arb-logo.svg?v=032" style="width:32px; height:32px;">', explorer: "https://arbiscan.io" },
    { name: "Linea", symbol: "ETH", key: "Linea", icon: '<img src="https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/linea/info/logo.png" style="width:32px; height:32px; border-radius:50%;">', explorer: "https://lineascan.build" },
    { name: "Solana", symbol: "SOL", key: "Solana", icon: '<img src="https://cryptologos.cc/logos/solana-sol-logo.svg?v=032" style="width:32px; height:32px;">', explorer: "https://solscan.io" },
    { name: "BNB Chain", symbol: "BNB", key: "BNB Chain", icon: '<img src="https://cryptologos.cc/logos/bnb-bnb-logo.svg?v=032" style="width:32px; height:32px;">', explorer: "https://bscscan.com" },
    { name: "Polygon", symbol: "POL", key: "Polygon", icon: '<img src="https://cryptologos.cc/logos/polygon-matic-logo.svg?v=032" style="width:32px; height:32px;">', explorer: "https://polygonscan.com" },
    { name: "Optimism", symbol: "OP", key: "Optimism", icon: '<img src="https://cryptologos.cc/logos/optimism-ethereum-op-logo.svg?v=032" style="width:32px; height:32px;">', explorer: "https://optimistic.etherscan.io" },
    { name: "Tron", symbol: "TRX", key: "Tron", icon: '<img src="https://cryptologos.cc/logos/tron-trx-logo.svg?v=032" style="width:32px; height:32px;">', explorer: "https://tronscan.org" }
];

// --- Инициализация при загрузке ---
document.getElementById('main-logo-btn').addEventListener('click', function(e) {
    e.preventDefault();
    logoutUser();
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
    const savedAccessToken = sessionStorage.getItem('ax_access_token');
    if (savedUsername && savedAccessToken) {
        isLoggedIn = true;
        document.documentElement.classList.add('ax-dashboard-active');
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
    syncEmailCodeCooldown();
    updateRegistrationContinueAction();
    if (!isLoggedIn && !paymentUnlocked && !isPendingRegistrationDismissed()) void restorePaidRegistrationAccess();
    
    // --- Инициализация продвинутых интерактивных анимаций ---
    initButtonGlowEffect();
    initFeatureCardsInteraction();
    initRouteLab();
    initSafeStart();
    initAirdropXVisualSystem();
});

// --- Вспомогательные функции ---
function getOrCreateClientSessionId() {
    let existing = sessionStorage.getItem('ax_client_session_id') || localStorage.getItem('ax_client_session_id');
    if (existing) {
        sessionStorage.setItem('ax_client_session_id', existing);
        localStorage.setItem('ax_client_session_id', existing);
        return existing;
    }
    if (window.crypto?.randomUUID) {
        existing = `sess_${window.crypto.randomUUID()}`;
    } else {
        const bytes = new Uint8Array(16);
        window.crypto.getRandomValues(bytes);
        existing = `sess_${Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')}`;
    }
    sessionStorage.setItem('ax_client_session_id', existing);
    localStorage.setItem('ax_client_session_id', existing);
    return existing;
}

function clearPaymentAccess() {
    paymentUnlocked = false;
    paymentAccessToken = '';
    sessionStorage.removeItem('ax_payment_token');
    sessionStorage.removeItem('ax_paid_session_id');
    sessionStorage.removeItem('ax_paid_plan');
    sessionStorage.removeItem('ax_subscription_payment_pending');
    updateRegistrationContinueAction();
}

function getPendingRegistrationDismissKey() {
    return `ax_registration_dismissed_${clientSessionId}`;
}

function isPendingRegistrationDismissed() {
    return localStorage.getItem(getPendingRegistrationDismissKey()) === '1';
}

function dismissPendingRegistration() {
    localStorage.setItem(getPendingRegistrationDismissKey(), '1');
    clearPaymentAccess();
    closeAuthModal();
    showNotification(t('auth.registrationDismissed'));
}

function updateRegistrationContinueAction() {
    const loginBtn = document.getElementById('login-btn');
    if (!loginBtn || isLoggedIn) return;
    const canContinue = paymentUnlocked && !!paymentAccessToken;
    loginBtn.textContent = canContinue ? t('resumeRegistration') : t('login');
    loginBtn.onclick = () => openModal(canContinue ? 'register' : 'login');
    loginBtn.classList.toggle('pending-registration-button', canContinue);
    loginBtn.title = canContinue ? t('resumeRegistrationHint') : '';
}

function generateDeviceFingerprint() {
    try {
        const stored = localStorage.getItem('ax_device_id');
        if (stored && /^device_[a-zA-Z0-9_-]{20,}$/.test(stored)) return stored;
        const value = window.crypto?.randomUUID
            ? `device_${window.crypto.randomUUID()}`
            : `device_${Array.from(window.crypto.getRandomValues(new Uint8Array(24)), byte => byte.toString(16).padStart(2, '0')).join('')}`;
        localStorage.setItem('ax_device_id', value);
        return value;
    } catch (e) {
        return `device_fallback_${navigator.userAgent.length}_${Date.now().toString(36)}`;
    }
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
    const iconEl = document.createElement('span');
    iconEl.textContent = icon;
    const textEl = document.createElement('span');
    textEl.innerHTML = String(text || '');
    toast.replaceChildren(iconEl, textEl);
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

function openAntiSybilModal() {
    const modal = document.getElementById('antiSybilModal');
    if (!modal) return;
    modal.classList.add('show');
}

function closeAntiSybilModal() {
    const modal = document.getElementById('antiSybilModal');
    if (!modal) return;
    modal.classList.remove('show');
}

function injectWalletSecurityBanner() {
    const existingBanner = document.getElementById('walletSecurityBanner');
    if (existingBanner) existingBanner.remove();

    if (!areInterfaceHintsEnabled()) return;

    const container = document.getElementById('walletsListContainer');
    if (!container || !container.parentElement) return;

    const banner = document.createElement('div');
    banner.id = 'walletSecurityBanner';
    banner.className = 'security-banner';
    banner.innerHTML = `
        <div class="security-banner__content">
            <div class="security-banner__icon">🛡️</div>
            <div class="security-banner__body">
                <div class="security-banner__title">Anti-Sybil защита активна</div>
                <div class="security-banner__text">Проверяем схемы активности и связанные адреса</div>
            </div>
        </div>
        <div class="security-banner__actions">
            <button type="button" class="security-banner__link" onclick="openAntiSybilModal();">Подробнее</button>
            <button type="button" class="security-banner__close" aria-label="Закрыть" onclick="this.closest('.security-banner').remove();">✕</button>
        </div>
    `;

    container.parentElement.insertBefore(banner, container);
}

function getRandomDelay(min, max) {
    const skew = Math.random();
    const range = max - min;
    const delay = min + (skew * skew * range);
    return Math.floor(delay);
}

function getAntiSybilJitter(baseValue, jitterPercent = 15) {
    const jitter = baseValue * (jitterPercent / 100);
    return baseValue + (Math.random() * jitter * 2 - jitter);
}

function rotateProxyIndex() {
    const currentIndex = parseInt(sessionStorage.getItem('ax_proxy_rotation_index') || '0', 10);
    const nextIndex = (currentIndex + 1) % 100;
    sessionStorage.setItem('ax_proxy_rotation_index', String(nextIndex));
    sessionStorage.setItem('ax_last_proxy_rotation', String(Date.now()));
    return nextIndex;
}

function shouldRotateProxy() {
    const lastRotation = parseInt(sessionStorage.getItem('ax_last_proxy_rotation') || '0', 10);
    const minInterval = 300000 + Math.random() * 300000;
    return (Date.now() - lastRotation) > minInterval;
}

function renderLanguageAwareText() {
    const lang = setLanguage(currentLang);
    updateRegistrationContinueAction();

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
    ['nav-features', 'navFeatures'], ['nav-safe-start', 'navSafeStart'], ['nav-how', 'navHow'], ['nav-pricing', 'navPricing'], ['hero-signing', 'heroSigning'],
    ['core-status-label', 'coreStatusLabel'], ['core-status-val', 'coreStatus'], ['features-heading', 'featuresHeading', true], ['features-desc', 'featuresDesc'], ['instr-title', 'instructionHeading'], ['faq-heading', 'faqHeading'],
    ['c1-t', 'c1t'], ['c1-d', 'c1d'], ['c2-t', 'c2t'], ['c2-d', 'c2d'], ['c3-t', 'c3t'], ['c3-d', 'c3d'],
    ['c4-t', 'c4t'], ['c4-d', 'c4d'], ['c6-t', 'c6t'], ['c6-d', 'c6d'], ['c7-tg-t', 'c7tgT'], ['c7-tg-d', 'c7tgD'], ['telegram-preview-title', 'telegramPreviewTitle'], ['telegram-preview-meta', 'telegramPreviewMeta'],
    ['c8-t', 'routeLabTitle'], ['c8-d', 'routeLabDesc'], ['route-tab-swap', 'routeLabSwap'], ['route-tab-bridge', 'routeLabBridge'], ['route-tab-defi', 'routeLabDefi'],
    ['c7-t', 'environmentCardTitle'], ['c7-d', 'environmentCardDesc'],
    ['preview-title', 'previewTitle', true], ['preview-desc', 'previewDesc'], ['preview-networks', 'previewNetworks'], ['preview-statuses', 'previewStatuses'], ['preview-no-keys', 'previewNoKeys'], ['preview-private-keys', 'previewPrivateKeys'],
    ['safe-start-eyebrow', 'safeStartEyebrow'], ['safe-start-title', 'safeStartTitle'], ['safe-start-desc', 'safeStartDesc'],
    ['safe-step-label-1', 'safeStartLabels.account'], ['safe-step-label-2', 'safeStartLabels.wallet'], ['safe-step-label-3', 'safeStartLabels.review'], ['safe-step-label-4', 'safeStartLabels.alerts'],
    ['summary-card-1-title', 'safeStartSummary.connectTitle'], ['summary-card-1-desc', 'safeStartSummary.connectDesc'], ['summary-card-2-title', 'safeStartSummary.reviewTitle'], ['summary-card-2-desc', 'safeStartSummary.reviewDesc'], ['summary-card-3-title', 'safeStartSummary.signTitle'], ['summary-card-3-desc', 'safeStartSummary.signDesc'],
    ['sc1-t', 'sc1t'], ['sc1-b1', 'sc1b1'], ['sc1-d1', 'sc1d1'], ['sc1-d2', 'sc1d2'], ['sc1-l1', 'sc1l1'], ['sc1-l2', 'sc1l2'], ['sc1-l3', 'sc1l3'],
    ['sc2-t', 'sc2t'], ['sc2-b1', 'sc2b1'], ['sc2-d1', 'sc2d1'], ['sc2-d2', 'sc2d2'], ['sc2-l1', 'sc2l1'], ['sc2-l2', 'sc2l2'], ['sc2-l3', 'sc2l3'],
    ['sc3-t', 'sc3t'], ['sc3-b1', 'sc3b1'], ['sc3-d1', 'sc3d1'], ['sc3-d2', 'sc3d2'], ['sc3-l1', 'sc3l1'], ['sc3-l2', 'sc3l2'], ['sc3-l3', 'sc3l3'],
    ['sc4-t', 'sc4t'], ['sc4-b1', 'sc4b1'], ['sc4-d1', 'sc4d1'], ['sc4-l1', 'sc4l1'], ['sc4-l2', 'sc4l2'], ['sc4-l3', 'sc4l3'],
    ['q1', 'q1'], ['a1', 'a1'], ['q2', 'q2'], ['a2', 'a2'], ['q3', 'q3'], ['a3', 'a3'], ['q4', 'q4'], ['a4', 'a4'],
    ['mn-looter', 'mnLooter'], ['mn-farm', 'mnFarm'], ['mn-proxy', 'mnProxy'], ['mn-stats', 'mnStats'], ['mn-more', 'mnMore'],
    ['p-title-modal', 'pTitleModal'], ['p-desc-modal', 'pDescModal'], ['p-std-top', 'subTop'], ['p-std-name', 'stdName'], ['p-std-per', 'stdPer'], ['p-std-f1', 'stdF1'], ['p-std-f2', 'stdF2'], ['p-std-f3', 'stdF3'], ['p-std-btn', 'stdBtn'],
    ['p-pro-badge', 'proBadge'], ['p-pro-top', 'subTop'], ['p-pro-name', 'proName'], ['p-pro-per', 'proPer'], ['p-pro-f1', 'proF1'], ['p-pro-f2', 'proF2'], ['p-pro-f3', 'proF3'], ['p-pro-f4', 'proF4'], ['p-pro-btn', 'proBtn'],
    ['p-prem-top', 'subTop'], ['p-prem-name', 'premName'], ['p-prem-per', 'premPer'], ['p-prem-f1', 'premF1'], ['p-prem-f2', 'premF2'], ['p-prem-f3', 'premF3'], ['p-prem-f4', 'premF4'], ['p-prem-btn', 'premBtn'],
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
    updateLocalizedDemoMedia();
    updateRouteLab();
    renderSafeStart(activeSafeStartStep);
    updateRegistrationContinueAction();
    syncEmailCodeCooldown();
}

const LOCALIZED_DEMO_MEDIA = [
    { id: 'demo-gas-media', name: 'gas', altKey: 'demoGasAlt' },
    { id: 'demo-wallets-media', name: 'wallets', altKey: 'demoWalletsAlt' },
    { id: 'demo-checks-media', name: 'checks', altKey: 'demoChecksAlt' },
    { id: 'demo-telegram-media', name: 'telegram', altKey: 'demoTelegramAlt' },
];

function updateLocalizedDemoMedia() {
    const language = getActiveLang();
    LOCALIZED_DEMO_MEDIA.forEach(({ id, name, altKey }) => {
        const image = document.getElementById(id);
        if (!image) return;
        const nextSource = `demo-${name}-${language}.gif?v=20260820`;
        if (image.getAttribute('src') !== nextSource) image.setAttribute('src', nextSource);
        image.setAttribute('alt', t(altKey));
    });
    const mainNav = document.getElementById('header-nav');
    if (mainNav) mainNav.setAttribute('aria-label', t('mainNavAria'));
    const heroProof = document.getElementById('hero-proof');
    if (heroProof) heroProof.setAttribute('aria-label', t('heroProofAria'));
    const routeLab = document.getElementById('route-lab');
    if (routeLab) routeLab.setAttribute('aria-label', t('routeLabAria'));
    const interfacePreview = document.getElementById('interface-preview');
    if (interfacePreview) interfacePreview.setAttribute('aria-label', t('previewAria'));
}

window.translateBackendMessage = function(msg) {
    if (!msg) return "";

    const activeLang = getActiveLang();
    const locale = translations[activeLang] || {};
    const exactMessages = locale.backend || {};
    if (exactMessages[msg]) return exactMessages[msg];
    if (msg === 'Subscription payments are temporarily unavailable while exact USDC settlement is configured.') {
        return locale.errors?.subscriptionPaymentsUnavailable || locale.errors?.paymentFailed || msg;
    }

    const dynamicPatterns = [
        ['invalidCodeAttempts', /^Invalid code! Attempts left:\s*(.*)$/],
        ['planLimitReached', /^Plan limit reached:\s*(.*)$/],
        ['slotPurchased', /^Slot purchased! Total slots:\s*(.*)$/],
        ['proxyWorking', /^Proxy is working! Ping:\s*(.*)$/],
        ['connectionError', /^Connection error:\s*(.*)$/],
        ['delayLimitExceeded', /^Delay limit exceeded for day\s*(.*)$/],
        ['deviceChangeLimit', /^Device change limit reached\. Try again in\s*(.*)$/]
    ];

    for (const [key, pattern] of dynamicPatterns) {
        const match = msg.match(pattern);
        const template = locale.backendDynamic?.[key];
        if (match && template) return template.replace('{details}', match[1].trim());
    }

    return msg;
};

function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, character => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    })[character]);
}

function translateBackendDetail(detail, fallbackKey = 'errors.genericRequestFailed') {
    let translated;
    if (Array.isArray(detail)) {
        translated = detail.map(item => {
            const message = item?.msg || '';
            return message === 'Field required' ? t('errors.fillAllFields') : window.translateBackendMessage(message);
        }).filter(Boolean).join(', ') || t(fallbackKey);
    } else {
        translated = typeof detail === 'string' && detail ? window.translateBackendMessage(detail) : t(fallbackKey);
    }
    return escapeHtml(translated);
}

function returnToMainSite() {
    isLoggedIn = false;
    document.documentElement.classList.remove('ax-dashboard-active');
    localStorage.removeItem('airdrop_username');
    localStorage.removeItem('airdrop_current_section');
    sessionStorage.removeItem('ax_access_token');
    sessionStorage.removeItem('ax_base_wallet_address');
    sessionStorage.removeItem('ax_active_wallet_address');
    
    const loginBtn = document.getElementById('login-btn');
    if (loginBtn) loginBtn.style.display = '';
    updateRegistrationContinueAction();

    document.getElementById('dashboard-content').style.display = 'none';
    const mobileNav = document.getElementById('mobileNavBar');
    if(mobileNav) mobileNav.style.display = 'none'; 
    document.getElementById('main-content').style.display = 'block';
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function logoutUser() {
    const accessToken = sessionStorage.getItem('ax_access_token');
    if (accessToken) {
        try {
            await fetch('/api/logout', { method: 'POST' });
        } catch (_) {
            // Local cleanup still protects the current browser if the server is offline.
        }
    }
    returnToMainSite();
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
    localStorage.removeItem('selected_onboarding');
    clearPaymentAccess();
    openModal('payment');
}

function closeAuthModal() { document.getElementById('authModal').classList.remove('show'); }

let appConfirmResolver = null;

function openAppConfirm({ title, message, confirmText }) {
    const modal = document.getElementById('appConfirmModal');
    if (!modal) return Promise.resolve(false);
    const locale = translations[getActiveLang()] || translations.ru;
    document.getElementById('appConfirmTitle').textContent = title || '';
    document.getElementById('appConfirmMessage').textContent = message || '';
    document.getElementById('appConfirmCancel').textContent = locale.confirmCancel;
    document.getElementById('appConfirmProceed').textContent = confirmText || locale.walletRemoveAction;
    modal.classList.add('show');
    return new Promise((resolve) => { appConfirmResolver = resolve; });
}

function finishAppConfirm(confirmed) {
    document.getElementById('appConfirmModal')?.classList.remove('show');
    const resolve = appConfirmResolver;
    appConfirmResolver = null;
    if (resolve) resolve(Boolean(confirmed));
}

function handleAppConfirmOverlayClick(event) {
    if (event.target.id === 'appConfirmModal' && mousedownOverlayTarget?.id === 'appConfirmModal') {
        finishAppConfirm(false);
    }
}

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
                    <div style="font-size:11px; color:#a3a3a3; margin-top:6px;">${t('auth.loginWithEmail')}</div>
                </div>
                <div class="input-group" style="margin-bottom:16px;">
                    <label style="font-size: 11px; color: #a3a3a3; display: block; margin-bottom: 4px;">${t('auth.password')}</label>
                    <div class="password-wrapper" style="position:relative;">
                        <input type="password" class="auth-input" placeholder="${t('auth.passwordPlaceholder')}" id="loginPass" style="padding-right: 35px;" oninput="clearFormError('loginErrorContainer', 'loginPass'); clearFieldValidationState('loginPass')">
                        <span class="password-toggle-icon" onclick="togglePasswordVisibility('loginPass', this)" style="position:absolute; right:12px; top:50%; transform:translateY(-50%); cursor:pointer; font-size:14px;">👁️</span>
                    </div>
                </div>
                <button type="submit" class="btn-modal-primary" style="width:100%; padding:12px;">${t('login')}</button>
                <button type="button" onclick="openModal('reset')" style="width:100%; margin-top:10px; padding:6px; border:0; background:transparent; color:#c4b5fd; cursor:pointer; font-size:12px;">${t('auth.forgotPassword')}</button>
                <div id="loginErrorContainer" style="margin-top:10px;"></div>
            </form>
        `;
    } else if (type === 'reset') {
        syncPasswordResetCooldown();
        const resetButtonDisabled = passwordResetCooldownSeconds > 0 ? 'disabled' : '';
        const resetButtonText = passwordResetCooldownSeconds > 0
            ? formatCodeCooldownLabel(passwordResetCooldownSeconds)
            : t('auth.sendResetCode');
        container.innerHTML = `
            <form onsubmit="event.preventDefault(); confirmPasswordReset();">
                <div class="modal-logo" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                    <span style="font-weight:bold; font-size:16px;">${t('auth.resetPassword')}</span>
                    <span onclick="closeAuthModal()" style="cursor:pointer; color:#a3a3a3; font-size:18px;">✕</span>
                </div>
                <p style="margin:0 0 14px; color:#a3a3a3; font-size:12px; line-height:1.5;">${t('auth.resetInstructions')}</p>
                <div class="input-group" style="margin-bottom:10px;">
                    <label style="font-size:11px; color:#a3a3a3; display:block; margin-bottom:4px;">${t('auth.email')}</label>
                    <input type="email" class="auth-input" placeholder="${t('auth.emailPlaceholder')}" id="resetEmail" oninput="clearFormError('resetErrorContainer', 'resetEmail'); clearFieldValidationState('resetEmail')">
                </div>
                <div class="input-group" style="margin-bottom:10px;">
                    <label style="font-size:11px; color:#a3a3a3; display:block; margin-bottom:4px;">${t('auth.code')}</label>
                    <div style="display:flex; gap:8px;">
                        <input type="text" class="auth-input" placeholder="${t('auth.codePlaceholder')}" id="resetCode" style="flex:1; margin:0;" oninput="clearFormError('resetErrorContainer', 'resetCode'); clearFieldValidationState('resetCode')">
                        <button type="button" id="sendResetCodeBtn" onclick="requestPasswordResetCode()" ${resetButtonDisabled} class="auth-input ${passwordResetCooldownSeconds > 0 ? 'btn-cooldown' : ''}" style="width:auto; background:#1f1f1f; color:#fff; cursor:pointer; font-weight:600;">${resetButtonText}</button>
                    </div>
                </div>
                <div class="input-group" style="margin-bottom:14px;">
                    <label style="font-size:11px; color:#a3a3a3; display:block; margin-bottom:4px;">${t('auth.newPassword')}</label>
                    <div class="password-wrapper" style="position:relative;">
                        <input type="password" class="auth-input" placeholder="${t('auth.passwordPlaceholder')}" id="resetPass" style="padding-right:35px;" oninput="clearFormError('resetErrorContainer', 'resetPass'); clearFieldValidationState('resetPass')">
                        <span class="password-toggle-icon" onclick="togglePasswordVisibility('resetPass', this)" style="position:absolute; right:12px; top:50%; transform:translateY(-50%); cursor:pointer; font-size:14px;">👁️</span>
                    </div>
                </div>
                <button type="submit" class="btn-modal-primary" style="width:100%; padding:10px;">${t('auth.resetSubmit')}</button>
                <button type="button" onclick="openModal('login')" style="width:100%; margin-top:8px; padding:5px; border:0; background:transparent; color:#a3a3a3; cursor:pointer; font-size:12px;">${t('auth.backToLogin')}</button>
                <div id="resetErrorContainer" style="margin-top:10px;"></div>
            </form>
        `;
    } else if (type === 'payment') {
        const chosenPlan = localStorage.getItem('selected_plan') || 'Standard';
        const basePrice = Number(localStorage.getItem('selected_price') || PLAN_PRICES[chosenPlan] || PLAN_PRICES.Standard);
        const displayAmount = basePrice.toFixed(2);
        const planDisplayLabel = chosenPlan === 'Standard' ? t('stdName') : chosenPlan === 'Pro' ? t('proName') : t('premName');

        container.innerHTML = `
            <div class="modal-logo" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                <span style="font-weight:bold; font-size:16px;">${t('payTitle')}: ${planDisplayLabel}</span>
                <span onclick="closeAuthModal()" style="cursor: pointer; color: #a3a3a3; font-size: 18px;">✕</span>
            </div>
            
            <div style="margin-bottom:12px; padding:10px 12px; border:1px solid rgba(96,165,250,.35); background:rgba(30,58,138,.13); border-radius:10px; color:#dbeafe; font-size:12px; line-height:1.5;">
                ${t('payWalletInstruction')}
            </div>

            <div style="background:#0a0a0a; border:1px solid var(--border-color); border-radius:12px; padding:12px; margin-bottom:12px; text-align:center;">
                <div style="font-size:11px; color:#a3a3a3; margin-bottom:2px;">${t('payAmount')}</div>
                <div id="paymentAmountValue" style="font-size:20px; color:#fff; font-weight:700; margin-bottom:8px;">${displayAmount} USDC</div>
                <div id="paymentTestModeNotice" style="display:none; font-size:11px; color:#86efac; margin-bottom:8px;"></div>
                <div style="font-size:11px; color:#a3a3a3;">${t('payAssetNotice')}</div>
            </div>

            <button type="button" id="paymentActionBtn" class="btn-modal-primary" onclick="startPlanPayment()" style="width:100%; padding:10px;">${t('payWithWallet')} · ${displayAmount} USDC</button>
            <div id="paymentStatusContainer"></div>
        `;
        restorePendingSubscriptionPayment();
    } else if (type === 'register') {
        syncEmailCodeCooldown();
        const chosenPlan = localStorage.getItem('selected_plan') || 'Standard';
        const chosenPrice = Number(localStorage.getItem('selected_price') || PLAN_PRICES[chosenPlan] || PLAN_PRICES.Standard);
        const planDisplayLabel = chosenPlan === 'Standard' ? t('stdName') : chosenPlan === 'Pro' ? t('proName') : t('premName');
        const btnText = codeCooldownSeconds > 0 ? formatCodeCooldownLabel(codeCooldownSeconds) : t('auth.sendCode');
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
                        <button type="button" id="sendCodeBtn" onclick="sendVerificationEmailCode()" ${btnDisabled} class="auth-input ${codeCooldownSeconds > 0 ? 'btn-cooldown' : ''}" style="width: auto; background:#1f1f1f; color:#fff; cursor:pointer; font-weight:600;">${btnText}</button>
                    </div>
                </div>
                
                <button type="submit" class="btn-modal-primary" style="width:100%; padding:10px;">${t('auth.register')}</button>
                <button type="button" onclick="dismissPendingRegistration()" style="width:100%; margin-top:8px; padding:5px; border:0; background:transparent; color:#a3a3a3; cursor:pointer; font-size:12px;">${t('auth.alreadyRegistered')}</button>
                <div id="errorContainer" style="margin-top:10px;"></div>
            </form>
        `;
    }
}

function getEmailCodeCooldownRemaining() {
    const until = Number(sessionStorage.getItem('ax_email_code_cooldown_until') || 0);
    return until > Date.now() ? Math.ceil((until - Date.now()) / 1000) : 0;
}

function formatCodeCooldownLabel(seconds) {
    return t('auth.resendInSeconds').replace('{seconds}', String(Math.max(0, seconds)));
}

function applyEmailCodeCooldownUi() {
    const button = document.getElementById('sendCodeBtn');
    const emailInput = document.getElementById('regEmail');
    if (codeCooldownSeconds <= 0) {
        if (button) {
            button.disabled = false;
            button.classList.remove('btn-loading', 'btn-cooldown');
            button.textContent = t('auth.sendCode');
        }
        if (emailInput) {
            emailInput.readOnly = false;
            emailInput.style.opacity = '1';
        }
        return;
    }
    if (button) {
        button.disabled = true;
        button.classList.remove('btn-loading');
        button.classList.add('btn-cooldown');
        button.textContent = formatCodeCooldownLabel(codeCooldownSeconds);
    }
    if (emailInput) {
        emailInput.readOnly = true;
        emailInput.style.opacity = '0.7';
    }
}

function syncEmailCodeCooldown() {
    codeCooldownSeconds = getEmailCodeCooldownRemaining();
    if (codeCooldownSeconds <= 0) {
        sessionStorage.removeItem('ax_email_code_cooldown_until');
        if (codeCooldownTimer) clearInterval(codeCooldownTimer);
        codeCooldownTimer = null;
        applyEmailCodeCooldownUi();
        return;
    }
    applyEmailCodeCooldownUi();
    if (codeCooldownTimer) return;
    codeCooldownTimer = setInterval(() => {
        codeCooldownSeconds = getEmailCodeCooldownRemaining();
        if (codeCooldownSeconds <= 0) {
            sessionStorage.removeItem('ax_email_code_cooldown_until');
            clearInterval(codeCooldownTimer);
            codeCooldownTimer = null;
        }
        applyEmailCodeCooldownUi();
    }, 1000);
}

function startEmailCodeCooldown(email) {
    confirmedRegistrationEmail = email;
    sessionStorage.setItem('ax_registration_email', email);
    sessionStorage.setItem('ax_email_code_cooldown_until', String(Date.now() + 60_000));
    if (codeCooldownTimer) clearInterval(codeCooldownTimer);
    codeCooldownTimer = null;
    syncEmailCodeCooldown();
}

function getPasswordResetCooldownRemaining() {
    const until = Number(sessionStorage.getItem('ax_password_reset_cooldown_until') || 0);
    return until > Date.now() ? Math.ceil((until - Date.now()) / 1000) : 0;
}

function applyPasswordResetCooldownUi() {
    const button = document.getElementById('sendResetCodeBtn');
    if (!button) return;
    if (passwordResetCooldownSeconds <= 0) {
        button.disabled = false;
        button.classList.remove('btn-loading', 'btn-cooldown');
        button.textContent = t('auth.sendResetCode');
        return;
    }
    button.disabled = true;
    button.classList.remove('btn-loading');
    button.classList.add('btn-cooldown');
    button.textContent = formatCodeCooldownLabel(passwordResetCooldownSeconds);
}

function syncPasswordResetCooldown() {
    passwordResetCooldownSeconds = getPasswordResetCooldownRemaining();
    if (passwordResetCooldownSeconds <= 0) {
        sessionStorage.removeItem('ax_password_reset_cooldown_until');
        if (passwordResetCooldownTimer) clearInterval(passwordResetCooldownTimer);
        passwordResetCooldownTimer = null;
        applyPasswordResetCooldownUi();
        return;
    }
    applyPasswordResetCooldownUi();
    if (passwordResetCooldownTimer) return;
    passwordResetCooldownTimer = setInterval(() => {
        passwordResetCooldownSeconds = getPasswordResetCooldownRemaining();
        if (passwordResetCooldownSeconds <= 0) {
            sessionStorage.removeItem('ax_password_reset_cooldown_until');
            clearInterval(passwordResetCooldownTimer);
            passwordResetCooldownTimer = null;
        }
        applyPasswordResetCooldownUi();
    }, 1000);
}

function startPasswordResetCooldown() {
    sessionStorage.setItem('ax_password_reset_cooldown_until', String(Date.now() + 60_000));
    if (passwordResetCooldownTimer) clearInterval(passwordResetCooldownTimer);
    passwordResetCooldownTimer = null;
    syncPasswordResetCooldown();
}

async function sendVerificationEmailCode() {
    if (getEmailCodeCooldownRemaining() > 0) return;
    const emailInput = document.getElementById('regEmail');
    const email = emailInput.value.trim();
    const btn = document.getElementById('sendCodeBtn');

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
        setFormError('errorContainer', t('errors.invalidEmail'), 'error', 'regEmail');
        return;
    }

    emailInput.readOnly = true;
    emailInput.style.opacity = '0.7';
    setButtonLoading(btn, true, t('auth.codeSending'));

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
        setButtonLoading(btn, false, t('auth.sendCode'));
        startEmailCodeCooldown(email);
    } catch (e) {
        setFormError('errorContainer', t('errors.networkError'));
        showNotification(t('errors.networkError'), 'error');
        setButtonLoading(btn, false, t('auth.sendCode'));
        emailInput.readOnly = false;
        emailInput.style.opacity = '1';
    }
}

async function requestPasswordResetCode() {
    if (getPasswordResetCooldownRemaining() > 0) return;
    const email = document.getElementById('resetEmail')?.value.trim() || '';
    const button = document.getElementById('sendResetCodeBtn');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        setFormError('resetErrorContainer', t('errors.invalidEmail'), 'error', 'resetEmail');
        return;
    }
    setButtonLoading(button, true, t('auth.codeSending'));
    try {
        const response = await fetch('/api/password-reset/request', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email }),
        });
        if (!response.ok) throw new Error('reset_code_request_failed');
        setFormError('resetErrorContainer', t('auth.resetCodeSent'), 'success');
        startPasswordResetCooldown();
    } catch (_) {
        setFormError('resetErrorContainer', t('errors.networkError'));
        setButtonLoading(button, false, t('auth.sendResetCode'));
    }
}

async function confirmPasswordReset() {
    const email = document.getElementById('resetEmail')?.value.trim() || '';
    const code = document.getElementById('resetCode')?.value.trim() || '';
    const password = document.getElementById('resetPass')?.value.trim() || '';
    const button = document.querySelector('#modalContainer .btn-modal-primary');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        setFormError('resetErrorContainer', t('errors.invalidEmail'), 'error', 'resetEmail');
        return;
    }
    if (!/^\d{6}$/.test(code)) {
        setFormError('resetErrorContainer', t('auth.invalidResetCode'), 'error', 'resetCode');
        return;
    }
    if (password.length < 12) {
        setFormError('resetErrorContainer', t('errors.registrationPasswordTooShort'), 'error', 'resetPass');
        return;
    }
    setButtonLoading(button, true, t('auth.resetSubmit'));
    try {
        const response = await fetch('/api/password-reset/confirm', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, code, password }),
        });
        const data = await response.json();
        if (!response.ok) {
            setFormError('resetErrorContainer', translateBackendDetail(data.detail, 'auth.invalidResetCode'));
            return;
        }
        sessionStorage.removeItem('ax_password_reset_cooldown_until');
        setFormError('resetErrorContainer', t('auth.passwordResetSuccess'), 'success');
        showNotification(t('auth.passwordResetSuccess'));
        setTimeout(() => openModal('login'), 1100);
    } catch (_) {
        setFormError('resetErrorContainer', t('errors.networkError'));
    } finally {
        setButtonLoading(button, false, t('auth.resetSubmit'));
    }
}

function scrollToFeatures() {
    const heading = document.getElementById('features-heading');
    if (heading) {
        heading.scrollIntoView({ behavior: 'smooth' });
    }
}

// --- Продвинутые интерактивные анимации в стиле Huly.io ---

/**
 * Инициализация эффекта свечения кнопок за курсором
 * Оптимизированный обработчик без утечек памяти
 */
function initButtonGlowEffect() {
    const glowButtons = document.querySelectorAll('.glow-button-target');
    
    glowButtons.forEach(button => {
        const handleMouseMove = (e) => {
            const rect = button.getBoundingClientRect();
            const x = ((e.clientX - rect.left) / rect.width) * 100;
            const y = ((e.clientY - rect.top) / rect.height) * 100;
            
            button.style.setProperty('--mouse-x', `${x}%`);
            button.style.setProperty('--mouse-y', `${y}%`);
        };
        
        const handleMouseLeave = () => {
            button.style.removeProperty('--mouse-x');
            button.style.removeProperty('--mouse-y');
        };
        
        // Используем passive listeners для лучшей производительности
        button.addEventListener('mousemove', handleMouseMove, { passive: true });
        button.addEventListener('mouseleave', handleMouseLeave, { passive: true });
    });
}

/**
 * Инициализация интерактивных карточек с эффектами 3D-tilt и Bento Box Border Glow
 */
function initFeatureCardsInteraction() {
    const cards = document.querySelectorAll('.feature-card-placeholder');
    const grid = document.querySelector('.features-placeholder-grid');
    
    if (!grid || cards.length === 0) return;
    
    // Глобальный обработчик для Border Glow эффекта
    const handleGridMouseMove = (e) => {
        const gridRect = grid.getBoundingClientRect();
        
        cards.forEach(card => {
            const cardRect = card.getBoundingClientRect();
            const cardCenterX = cardRect.left + cardRect.width / 2;
            const cardCenterY = cardRect.top + cardRect.height / 2;
            
            const deltaX = e.clientX - cardCenterX;
            const deltaY = e.clientY - cardCenterY;
            const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
            
            // Определяем, с какой стороны подсвечивать границу
            const angle = Math.atan2(deltaY, deltaX);
            const glowOpacity = Math.max(0, 1 - distance / 400);
            
            // Применяем градиент на границу
            if (glowOpacity > 0.05) {
                card.style.borderImage = `linear-gradient(${angle}rad, rgba(139, 92, 246, ${glowOpacity * 0.8}), rgba(168, 85, 247, ${glowOpacity * 0.4}), transparent 50%) 1`;
            } else {
                card.style.borderImage = '';
            }
        });
    };
    
    const handleGridMouseLeave = () => {
        cards.forEach(card => {
            card.style.borderImage = '';
        });
    };
    
    // 3D tilt эффект для каждой карточки
    cards.forEach(card => {
        const handleCardMouseMove = (e) => {
            const rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            const centerX = rect.width / 2;
            const centerY = rect.height / 2;
            
            // Вычисляем углы поворота (ограничиваем для плавности)
            const rotateX = ((y - centerY) / centerY) * -8;
            const rotateY = ((x - centerX) / centerX) * 8;
            
            card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-2px)`;
        };
        
        const handleCardMouseLeave = () => {
            card.style.transform = '';
        };
        
        card.addEventListener('mousemove', handleCardMouseMove, { passive: true });
        card.addEventListener('mouseleave', handleCardMouseLeave, { passive: true });
    });
    
    // Привязываем Border Glow к сетке
    grid.addEventListener('mousemove', handleGridMouseMove, { passive: true });
    grid.addEventListener('mouseleave', handleGridMouseLeave, { passive: true });
}

const ROUTE_LAB_ROUTES = {
    swap: { from: 'ETH', to: 'USDC', statusKey: 'routeLabSwapFlow' },
    bridge: { from: 'Base', to: 'Arbitrum', statusKey: 'routeLabBridgeFlow' },
    defi: { from: 'USDC', to: 'Aave', statusKey: 'routeLabDefiFlow' }
};

function updateRouteLab(mode) {
    const card = document.getElementById('route-lab-card');
    if (!card) return;
    const activeButton = card.querySelector('.route-lab__tabs button.active');
    const selectedMode = mode || activeButton?.dataset.routeMode || 'swap';
    const route = ROUTE_LAB_ROUTES[selectedMode] || ROUTE_LAB_ROUTES.swap;
    const from = document.getElementById('route-lab-from');
    const to = document.getElementById('route-lab-to');
    const status = document.getElementById('route-lab-status');
    if (from) from.textContent = route.from;
    if (to) to.textContent = route.to;
    if (status) status.textContent = t(route.statusKey);
    card.dataset.routeMode = selectedMode;
}

function initRouteLab() {
    const card = document.getElementById('route-lab-card');
    if (!card || card.dataset.routeReady === 'true') return;
    card.dataset.routeReady = 'true';
    card.querySelectorAll('.route-lab__tabs button').forEach(button => {
        button.addEventListener('click', () => {
            card.querySelectorAll('.route-lab__tabs button').forEach(item => {
                const selected = item === button;
                item.classList.toggle('active', selected);
                item.setAttribute('aria-pressed', selected ? 'true' : 'false');
            });
            card.classList.remove('route-changing');
            void card.offsetWidth;
            card.classList.add('route-changing');
            updateRouteLab(button.dataset.routeMode);
            window.setTimeout(() => card.classList.remove('route-changing'), 320);
        });
    });
    updateRouteLab();
}

function getSafeStartSteps() {
    const steps = translations[getActiveLang()]?.safeStartSteps;
    return Array.isArray(steps) ? steps : [];
}

function renderSafeStart(nextStep = activeSafeStartStep) {
    const panel = document.getElementById('safe-start-panel');
    const steps = getSafeStartSteps();
    if (!panel || !steps.length) return;

    document.getElementById('safe-stepper')?.setAttribute('aria-label', t('safeStartAria'));

    activeSafeStartStep = Math.max(0, Math.min(Number(nextStep) || 0, steps.length - 1));
    const step = steps[activeSafeStartStep];
    const byId = (id) => document.getElementById(id);
    const setText = (id, value) => {
        const element = byId(id);
        if (element) element.textContent = value || '';
    };

    setText('safe-start-current', String(activeSafeStartStep + 1).padStart(2, '0'));
    setText('safe-shot-number', String(activeSafeStartStep + 1).padStart(2, '0'));
    setText('safe-shot-title', step.title);
    setText('safe-shot-desc', step.description);
    setText('safe-shot-brow', step.screenEyebrow);
    setText('safe-shot-screen-title', step.screenTitle);
    setText('safe-shot-screen-desc', step.screenDescription);
    setText('safe-shot-row-1', step.rows?.[0]);
    setText('safe-shot-row-2', step.rows?.[1]);
    setText('safe-shot-row-3', step.rows?.[2]);
    setText('safe-shot-status', step.status);

    const list = byId('safe-shot-list');
    if (list) {
        list.replaceChildren(...(step.points || []).map(point => {
            const item = document.createElement('li');
            const marker = document.createElement('i');
            const content = document.createElement('span');
            content.textContent = point;
            item.append(marker, content);
            return item;
        }));
    }

    document.querySelectorAll('.safe-step').forEach((button, index) => {
        const selected = index === activeSafeStartStep;
        button.classList.toggle('active', selected);
        button.setAttribute('aria-selected', selected ? 'true' : 'false');
        button.tabIndex = selected ? 0 : -1;
    });

    const previous = byId('safe-step-prev');
    const following = byId('safe-step-next');
    if (previous) {
        previous.disabled = activeSafeStartStep === 0;
        previous.textContent = t('safeStartPrevious');
    }
    if (following) {
        following.textContent = activeSafeStartStep === steps.length - 1 ? t('safeStartFinish') : t('safeStartNext');
    }

    panel.classList.remove('is-switching');
    void panel.offsetWidth;
    panel.classList.add('is-switching');
}

function initSafeStart() {
    const stepper = document.getElementById('safe-stepper');
    if (!stepper || stepper.dataset.ready === 'true') return;
    stepper.dataset.ready = 'true';
    stepper.querySelectorAll('.safe-step').forEach(button => {
        button.addEventListener('click', () => renderSafeStart(Number(button.dataset.safeStep)));
    });
    document.getElementById('safe-step-prev')?.addEventListener('click', () => renderSafeStart(activeSafeStartStep - 1));
    document.getElementById('safe-step-next')?.addEventListener('click', () => {
        const steps = getSafeStartSteps();
        renderSafeStart(activeSafeStartStep === steps.length - 1 ? 0 : activeSafeStartStep + 1);
    });
    stepper.setAttribute('aria-label', t('safeStartAria'));
    renderSafeStart(activeSafeStartStep);
}

/**
 * React Bits-inspired progressive effects for the new AIRDROP-X surface.
 * The content remains fully usable when motion is disabled or unsupported.
 */
function initAirdropXVisualSystem() {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const supportsHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    const cards = document.querySelectorAll('.border-glow-card');
    cards.forEach(card => {
        card.addEventListener('pointermove', event => {
            const rect = card.getBoundingClientRect();
            card.style.setProperty('--card-x', `${event.clientX - rect.left}px`);
            card.style.setProperty('--card-y', `${event.clientY - rect.top}px`);
        }, { passive: true });
    });

    if (supportsHover && !reducedMotion) {
        document.querySelectorAll('.feature-card, .showcase-card, .pricing-card').forEach(card => {
            card.classList.add('ax-motion-card');
            card.addEventListener('pointermove', event => {
                const rect = card.getBoundingClientRect();
                const horizontal = (event.clientX - rect.left) / rect.width - 0.5;
                const vertical = (event.clientY - rect.top) / rect.height - 0.5;
                card.style.setProperty('--tilt-x', `${(-vertical * 4.5).toFixed(2)}deg`);
                card.style.setProperty('--tilt-y', `${(horizontal * 5.5).toFixed(2)}deg`);
            }, { passive: true });
            card.addEventListener('pointerleave', () => {
                card.style.setProperty('--tilt-x', '0deg');
                card.style.setProperty('--tilt-y', '0deg');
            }, { passive: true });
        });
    }

    if (!('IntersectionObserver' in window) || reducedMotion) {
        document.documentElement.classList.add('ax-reveal-ready');
        return;
    }

    const targets = document.querySelectorAll('.feature-card, .showcase-card, .interface-preview, .status-wrap');
    targets.forEach(target => target.classList.add('ax-reveal'));

    const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if (!entry.isIntersecting) return;
            entry.target.classList.add('ax-reveal--visible');
            observer.unobserve(entry.target);
        });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px' });

    targets.forEach(target => observer.observe(target));
    document.documentElement.classList.add('ax-reveal-ready');
}

function copyWalletAddress(address, btn) {
    navigator.clipboard.writeText(address);
    const originalText = btn.innerHTML;
    btn.innerHTML = '✅ OK!';
    setTimeout(() => { btn.innerHTML = originalText; }, 2000);
}

function setPaymentStatus(message, type = 'info') {
    const status = document.getElementById('paymentStatusContainer');
    if (!status) return;
    const color = type === 'error' ? '#fca5a5' : type === 'success' ? '#86efac' : '#c4b5fd';
    const line = document.createElement('div');
    line.style.cssText = `color:${color}; font-size:12px; line-height:1.5; margin-top:10px;`;
    line.textContent = String(message || '');
    status.replaceChildren(line);
}

function getPendingSubscriptionPayment() {
    try {
        const pending = JSON.parse(sessionStorage.getItem('ax_subscription_payment_pending') || 'null');
        if (pending?.client_session_id === clientSessionId && pending.payment_session_id && /^0x[0-9a-fA-F]{64}$/.test(pending.txid || '')) {
            return pending;
        }
    } catch (_) {}
    return null;
}

function setPendingSubscriptionPayment(pending) {
    sessionStorage.setItem('ax_subscription_payment_pending', JSON.stringify(pending));
}

function clearPendingSubscriptionPayment() {
    sessionStorage.removeItem('ax_subscription_payment_pending');
}

function parseUsdcAtomic(value) {
    const normalized = String(value || '').trim();
    if (!/^\d+(?:\.\d{1,6})?$/.test(normalized)) return null;
    const [whole, fraction = ''] = normalized.split('.');
    const atomic = BigInt(whole) * 1000000n + BigInt((fraction + '000000').slice(0, 6));
    return atomic > 0n ? atomic : null;
}

function buildErc20TransferData(receiver, amountAtomic) {
    if (!/^0x[0-9a-fA-F]{40}$/.test(receiver || '') || !amountAtomic || amountAtomic <= 0n) return null;
    const receiverWord = receiver.slice(2).toLowerCase().padStart(64, '0');
    const amountWord = amountAtomic.toString(16).padStart(64, '0');
    return `0xa9059cbb${receiverWord}${amountWord}`;
}

function restorePendingSubscriptionPayment() {
    const pending = getPendingSubscriptionPayment();
    if (!pending) return;
    setPaymentStatus(t('paySubmitted'), 'info');
    const button = document.getElementById('paymentActionBtn');
    restorePaymentActionButton(button, t('payCheckStatus'));
}

function restorePaymentActionButton(button, label) {
    if (!button) return;
    button.classList.remove('btn-loading');
    button.disabled = false;
    button.dataset.defaultText = label;
    button.textContent = label;
}

async function confirmSubscriptionPayment() {
    const pending = getPendingSubscriptionPayment();
    if (!pending) return false;
    const button = document.getElementById('paymentActionBtn');
    try {
        setButtonLoading(button, true, t('payConfirming'));
        setPaymentStatus(t('payConfirming'), 'info');
        const response = await fetch('/api/payment/confirm', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(pending),
        });
        const data = await response.json();
        if (!response.ok) {
            if (data.detail === 'Payment session not found') {
                return await recoverTestnetSubscriptionPayment(pending);
            }
            const isWaitingForConfirmation = data.detail === 'USDC payment is waiting for Base confirmation';
            setPaymentStatus(
                isWaitingForConfirmation ? t('payWaitingConfirmation') : translateBackendDetail(data.detail, 'errors.paymentFailed'),
                isWaitingForConfirmation ? 'info' : 'error',
            );
            return false;
        }
        completeSubscriptionPayment(data);
        return true;
    } catch (_) {
        setPaymentStatus(t('errors.networkError'), 'error');
        return false;
    } finally {
        if (!paymentUnlocked) restorePaymentActionButton(button, t('payCheckStatus'));
    }
}

function completeSubscriptionPayment(data) {
    storePaymentAccess(data);
    clearPendingSubscriptionPayment();
    setPaymentStatus(t('payConfirmed'), 'success');
    showNotification(t('payConfirmed'));
    setTimeout(() => openModal('register'), 800);
}

function storePaymentAccess(data) {
    if (!data?.payment_token) return false;
    localStorage.removeItem(getPendingRegistrationDismissKey());
    paymentUnlocked = true;
    paymentAccessToken = data.payment_token;
    sessionStorage.setItem('ax_payment_token', paymentAccessToken);
    sessionStorage.setItem('ax_paid_session_id', clientSessionId);
    updateRegistrationContinueAction();
    return true;
}

async function restorePaidRegistrationAccess() {
    try {
        const response = await fetch('/api/payment/resume-registration', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ client_session_id: clientSessionId }),
        });
        if (!response.ok) return false;
        const data = await response.json();
        return storePaymentAccess(data);
    } catch (_) {
        return false;
    }
}

async function recoverTestnetSubscriptionPayment(pending) {
    try {
        setPaymentStatus(t('payConfirming'), 'info');
        const response = await fetch('/api/payment/recover', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                txid: pending.txid,
                client_session_id: clientSessionId,
                plan: localStorage.getItem('selected_plan') || 'Standard',
                onboarding: false,
            }),
        });
        const data = await response.json();
        if (!response.ok) {
            const isWaitingForConfirmation = data.detail === 'USDC payment is waiting for Base confirmation';
            setPaymentStatus(
                isWaitingForConfirmation ? t('payWaitingConfirmation') : translateBackendDetail(data.detail, 'errors.paymentFailed'),
                isWaitingForConfirmation ? 'info' : 'error',
            );
            return false;
        }
        completeSubscriptionPayment(data);
        return true;
    } catch (_) {
        setPaymentStatus(t('errors.networkError'), 'error');
        return false;
    }
}

async function startPlanPayment() {
    if (getPendingSubscriptionPayment()) {
        await confirmSubscriptionPayment();
        return;
    }
    const locale = translations[getActiveLang()];
    const chosenPlan = localStorage.getItem('selected_plan') || 'Standard';
    const basePrice = PLAN_PRICES[chosenPlan] || PLAN_PRICES.Standard;
    const button = document.getElementById('paymentActionBtn');

    try {
        setButtonLoading(button, true, locale.payPreparing);
        const createRes = await fetch('/api/payment/create-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ plan: chosenPlan, amount: basePrice, onboarding: false, client_session_id: clientSessionId }),
        });
        const createData = await createRes.json();
        if (!createRes.ok) {
            setPaymentStatus(translateBackendDetail(createData.detail, 'errors.paymentFailed'), 'error');
            return;
        }

        const payment = createData.payment;
        updateSubscriptionPaymentSummary(payment, Boolean(createData.is_testnet));
        const provider = window.ethereum;
        if (!provider?.request || !payment) throw new Error('payment_wallet_unavailable');
        let accounts = await provider.request({ method: 'eth_accounts' });
        if (!Array.isArray(accounts) || !accounts[0]) accounts = await provider.request({ method: 'eth_requestAccounts' });
        const from = accounts?.[0];
        if (!/^0x[0-9a-fA-F]{40}$/.test(from || '')) throw new Error('payment_wallet_unavailable');
        if (Number(payment.chain_id) === 84532) {
            await switchToBaseSepolia(provider);
        } else if (Number(payment.chain_id) === 8453) {
            await switchToBaseMainnet(provider);
        } else {
            throw new Error('payment_network_unavailable');
        }
        await requestPaymentAssetVisibility(provider, payment);

        const amountAtomic = parseUsdcAtomic(payment.amount);
        const data = buildErc20TransferData(payment.receiver, amountAtomic);
        if (!data || !/^0x[0-9a-fA-F]{40}$/.test(payment.contract || '')) throw new Error('payment_details_invalid');
        setButtonLoading(button, true, locale.payWalletSigning);
        setPaymentStatus(locale.payWalletSigning, 'info');
        const txid = await provider.request({
            method: 'eth_sendTransaction',
            params: [{ from, to: payment.contract, data, value: '0x0' }],
        });
        setPendingSubscriptionPayment({
            payment_session_id: createData.payment_session_id,
            client_session_id: clientSessionId,
            txid,
        });
        setPaymentStatus(locale.paySubmitted, 'info');
        await confirmSubscriptionPayment();
    } catch (error) {
        const rejected = error?.code === 4001 || error?.code === 'ACTION_REJECTED';
        const message = rejected
            ? locale.payWalletRejected
            : (String(error?.message || '').includes('payment_wallet_unavailable') ? locale.payWalletUnavailable : locale.errors.networkError);
        setPaymentStatus(message, 'error');
    } finally {
        if (!paymentUnlocked) {
            restorePaymentActionButton(
                button,
                getPendingSubscriptionPayment() ? locale.payCheckStatus : locale.payWithWallet,
            );
        }
    }
}

async function requestPaymentAssetVisibility(provider, payment) {
    // This only asks the wallet to display the verified USDC token. It cannot
    // move funds and a wallet may safely decline or ignore the request.
    try {
        await provider.request({
            method: 'wallet_watchAsset',
            params: {
                type: 'ERC20',
                options: {
                    address: payment.contract,
                    symbol: payment.asset || 'USDC',
                    decimals: Number(payment.decimals) || 6,
                },
            },
        });
    } catch (_) {
        // Asset visibility is optional and must never block a signed payment.
    }
}

function updateSubscriptionPaymentSummary(payment, isTestnet) {
    const locale = translations[getActiveLang()];
    const amount = `${payment.amount} ${payment.asset || 'USDC'}`;
    const amountElement = document.getElementById('paymentAmountValue');
    const button = document.getElementById('paymentActionBtn');
    const testModeNotice = document.getElementById('paymentTestModeNotice');
    if (amountElement) amountElement.textContent = amount;
    if (button) button.textContent = `${locale.payWithWallet} · ${amount}`;
    if (testModeNotice) {
        testModeNotice.textContent = isTestnet ? locale.payTestMode : '';
        testModeNotice.style.display = isTestnet ? 'block' : 'none';
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
    if (pass.length < 12) {
        setFormError('errorContainer', t('errors.registrationPasswordTooShort'), 'error', 'regPass');
        document.getElementById('regPass')?.focus();
        return;
    }
    if (!code) {
        setFormError('errorContainer', t('errors.fillAllFields'), 'error', 'regCode');
        document.getElementById('regCode')?.focus();
        return;
    }

    setButtonLoading(submitBtn, true, t('auth.register'));

    try {
        // The server owns the payment state. Refresh the one-use token here so
        // a harmless page/server restart can never make a confirmed payment disappear.
        const paymentRestored = await restorePaidRegistrationAccess();
        if (!paymentRestored) {
            setFormError('errorContainer', t('errors.paymentRegistrationUnavailable'));
            return;
        }
        const requestData = {
            username,
            email,
            password: pass,
            code,
            plan: chosenPlan,
            payment_token: paymentAccessToken,
            client_session_id: clientSessionId,
            fingerprint: deviceFingerprint
        };
        const response = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestData)
        });

        const result = await response.json();

        if (!response.ok) {
            let errMsg = t('errors.genericRequestFailed');
            if (result.detail) {
                errMsg = translateBackendDetail(result.detail);
            }
            setFormError('errorContainer', errMsg);
            return;
        }

        if (typeof clearPaymentAccess === 'function') {
            clearPaymentAccess();
        }
        sessionStorage.removeItem('ax_registration_email');
        sessionStorage.removeItem('ax_email_code_cooldown_until');
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
            sessionStorage.setItem('ax_access_token', data.access_token);
            userPlan = data.plan || 'Standard';
            subscriptionDaysLeft = data.days_left ?? 29;
            handleLoginSuccess();
        } else {
            let errMsg = t('errors.loginFailed');
            if (data.detail) errMsg = translateBackendDetail(data.detail, 'errors.loginFailed');
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
    document.documentElement.classList.add('ax-dashboard-active');
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

let authExpiryHandled = false;

function handleExpiredAuthSession() {
    if (authExpiryHandled) return;
    authExpiryHandled = true;
    returnToMainSite();
    showNotification(t('sessionExpired'), 'error');
}

function closeWalletConnectModal() {
    document.getElementById('walletConnectModal')?.classList.remove('show');
}

function handleWalletConnectOverlayClick(event) {
    if (event.target.id === 'walletConnectModal' && mousedownOverlayTarget.id === 'walletConnectModal') {
        closeWalletConnectModal();
    }
}

let baseSwapConfirmationResolver = null;

function formatConfirmationUsd(amount, unitPrice) {
    const value = Number(amount);
    const price = Number(unitPrice);
    if (!Number.isFinite(value) || value <= 0 || !Number.isFinite(price) || price <= 0) return '';
    return `≈ $${(value * price).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function setBaseSwapConfirmationDetails(details) {
    const container = document.getElementById('baseSwapConfirmDetails');
    if (!container) return;
    const visibleDetails = (Array.isArray(details) ? details : []).filter((detail) => detail?.label && detail?.value);
    container.replaceChildren();
    if (!visibleDetails.length) {
        container.style.display = 'none';
        return;
    }
    for (const detail of visibleDetails) {
        const row = document.createElement('div');
        row.style.cssText = 'background:rgba(255,255,255,.025); border:1px solid var(--border-color); border-radius:9px; padding:8px 10px; min-width:0;';
        const label = document.createElement('div');
        label.textContent = detail.label;
        label.style.cssText = 'font-size:10px; color:var(--text-muted);';
        const value = document.createElement('div');
        value.textContent = detail.value;
        value.style.cssText = 'font-size:11px; color:#e9d5ff; font-weight:600; line-height:1.35; margin-top:3px; overflow-wrap:anywhere;';
        row.append(label, value);
        container.append(row);
    }
    container.style.display = 'grid';
}

function setBaseSwapConfirmationWarning(message = '') {
    const warning = document.getElementById('baseSwapConfirmWarning');
    if (!warning) return;
    warning.textContent = message;
    warning.style.display = message ? 'block' : 'none';
}

function getUniversalBridgeRouteWarning(quote) {
    const locale = translations[getActiveLang()];
    const fromToken = quote?.from_token || {};
    const toToken = quote?.to_token || {};
    const stableSymbols = new Set(['USDC', 'USDT', 'DAI']);
    const sourcePrice = Number(activeUniversalBridgeAsset?.unit_price_usd || fromToken.priceUSD || fromToken.price_usd);
    const sameAsset = String(fromToken.symbol || '').toUpperCase() === String(toToken.symbol || '').toUpperCase();
    const targetPrice = stableSymbols.has(String(toToken.symbol || '').toUpperCase())
        ? 1
        : Number(toToken.priceUSD || toToken.price_usd || (sameAsset ? sourcePrice : 0));
    const sourceValue = Number(quote?.amount_in) * sourcePrice;
    const minimumValue = Number(quote?.amount_out_min || quote?.amount_out) * targetPrice;
    if (!Number.isFinite(sourceValue) || !Number.isFinite(minimumValue) || sourceValue <= 0 || minimumValue <= 0) return '';
    const impactPercent = ((sourceValue - minimumValue) / sourceValue) * 100;
    if (!Number.isFinite(impactPercent) || impactPercent < 3) return '';
    return locale.universalBridgeCostWarning
        .replace('{percent}', impactPercent.toLocaleString(undefined, { maximumFractionDigits: 1 }))
        .replace('{loss}', `$${(sourceValue - minimumValue).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
}

function openBaseSwapConfirmation(amount, output) {
    const locale = translations[getActiveLang()];
    const modal = document.getElementById('baseSwapConfirmModal');
    if (!modal) return Promise.resolve(false);
    if (baseSwapConfirmationResolver) baseSwapConfirmationResolver(false);
    document.getElementById('baseSwapConfirmTitle').textContent = locale.baseSwapModalTitle;
    document.getElementById('baseSwapConfirmNetwork').textContent = locale.baseSwapModalNetwork;
    document.getElementById('baseSwapConfirmPayLabel').textContent = locale.baseSwapYouPay;
    document.getElementById('baseSwapConfirmPayValue').textContent = `${amount} ETH`;
    document.getElementById('baseSwapConfirmReceiveLabel').textContent = locale.baseSwapYouReceive;
    document.getElementById('baseSwapConfirmReceiveValue').textContent = `≈ ${output} USDC`;
    setBaseSwapConfirmationDetails([
        { label: locale.confirmationAmountUsd, value: formatConfirmationUsd(amount, getSelectedOperationAssetData()?.unit_price_usd) },
        { label: locale.confirmationNetworkFee, value: locale.confirmationNetworkFeeWallet },
        { label: locale.confirmationWalletCheck, value: locale.confirmationWalletCheckValue },
    ]);
    setBaseSwapConfirmationWarning('');
    document.getElementById('baseSwapConfirmNotice').textContent = locale.baseSwapModalNotice;
    document.getElementById('baseSwapConfirmCancel').textContent = locale.baseSwapModalCancel;
    document.getElementById('baseSwapConfirmProceed').textContent = locale.baseSwapModalProceed;
    modal.classList.add('show');
    return new Promise((resolve) => {
        baseSwapConfirmationResolver = resolve;
    });
}

function openBaseTransferConfirmation(amount, recipientAddress, recipientName) {
    const locale = translations[getActiveLang()];
    const modal = document.getElementById('baseSwapConfirmModal');
    if (!modal) return Promise.resolve(false);
    if (baseSwapConfirmationResolver) baseSwapConfirmationResolver(false);
    document.getElementById('baseSwapConfirmTitle').textContent = locale.directTransferModalTitle;
    document.getElementById('baseSwapConfirmNetwork').textContent = locale.directTransferModalNetwork;
    document.getElementById('baseSwapConfirmPayLabel').textContent = locale.directTransferModalPayLabel;
    document.getElementById('baseSwapConfirmPayValue').textContent = `${amount} ETH`;
    document.getElementById('baseSwapConfirmReceiveLabel').textContent = locale.directTransferModalReceiveLabel;
    document.getElementById('baseSwapConfirmReceiveValue').textContent = `${recipientName} · ${recipientAddress.slice(0, 6)}…${recipientAddress.slice(-4)}`;
    setBaseSwapConfirmationDetails([
        { label: locale.confirmationAmountUsd, value: formatConfirmationUsd(amount, getDirectTransferEthAsset()?.unit_price_usd) },
        { label: locale.confirmationNetworkFee, value: locale.confirmationNetworkFeeWallet },
        { label: locale.confirmationWalletCheck, value: locale.confirmationWalletCheckValue },
    ]);
    setBaseSwapConfirmationWarning('');
    document.getElementById('baseSwapConfirmNotice').textContent = locale.directTransferModalNotice;
    document.getElementById('baseSwapConfirmCancel').textContent = locale.baseSwapModalCancel;
    document.getElementById('baseSwapConfirmProceed').textContent = locale.directTransferModalProceed;
    modal.classList.add('show');
    return new Promise((resolve) => {
        baseSwapConfirmationResolver = resolve;
    });
}

function openUniversalBridgeConfirmation(quote, approval = false) {
    const locale = translations[getActiveLang()];
    const modal = document.getElementById('baseSwapConfirmModal');
    if (!modal) return Promise.resolve(false);
    if (baseSwapConfirmationResolver) baseSwapConfirmationResolver(false);
    const fromToken = quote?.from_token || {};
    const toToken = quote?.to_token || {};
    const routeText = `${quote?.from_network || ''} → ${quote?.to_network || ''}`;
    document.getElementById('baseSwapConfirmTitle').textContent = approval
        ? locale.universalBridgeApprovalModalTitle
        : locale.universalBridgeModalTitle;
    document.getElementById('baseSwapConfirmNetwork').textContent = approval
        ? locale.universalBridgeApprovalModalNetwork.replace('{network}', quote?.from_network || '')
        : locale.universalBridgeModalNetwork.replace('{route}', routeText);
    document.getElementById('baseSwapConfirmPayLabel').textContent = approval
        ? locale.universalBridgeApprovalPayLabel
        : locale.baseSwapYouPay;
    document.getElementById('baseSwapConfirmPayValue').textContent = approval
        ? `${quote?.amount_in || ''} ${fromToken.symbol || ''}`
        : `${quote?.amount_in || ''} ${fromToken.symbol || ''}`;
    document.getElementById('baseSwapConfirmReceiveLabel').textContent = approval
        ? locale.universalBridgeApprovalReceiveLabel
        : locale.baseSwapYouReceive;
    document.getElementById('baseSwapConfirmReceiveValue').textContent = approval
        ? `${String(quote?.approval?.spender || '').slice(0, 6)}…${String(quote?.approval?.spender || '').slice(-4)}`
        : `≥ ${quote?.amount_out_min || quote?.amount_out || ''} ${toToken.symbol || ''}`;
    const contractAddress = approval ? quote?.approval?.spender : quote?.transaction?.to;
    setBaseSwapConfirmationDetails([
        { label: locale.confirmationAmountUsd, value: formatConfirmationUsd(quote?.amount_in, activeUniversalBridgeAsset?.unit_price_usd) },
        { label: approval ? locale.confirmationApproval : locale.confirmationRouteContract, value: contractAddress || '' },
        { label: approval ? locale.confirmationApprovalScope : locale.confirmationNetworkFee, value: approval ? locale.confirmationApprovalExact : locale.confirmationNetworkFeeWallet },
        { label: locale.confirmationWalletCheck, value: locale.confirmationWalletCheckValue },
    ]);
    setBaseSwapConfirmationWarning(approval ? '' : getUniversalBridgeRouteWarning(quote));
    document.getElementById('baseSwapConfirmNotice').textContent = approval
        ? locale.universalBridgeApprovalModalNotice
        : locale.universalBridgeModalNotice
            .replace('{tool}', quote?.tool || 'LI.FI')
            .replace('{amount}', quote?.amount_out || '—')
            .replace('{symbol}', toToken.symbol || '');
    document.getElementById('baseSwapConfirmCancel').textContent = locale.baseSwapModalCancel;
    document.getElementById('baseSwapConfirmProceed').textContent = approval
        ? locale.universalBridgeApprovalProceed
        : locale.universalBridgeModalProceed;
    modal.classList.add('show');
    return new Promise((resolve) => {
        baseSwapConfirmationResolver = resolve;
    });
}

function openAaveSupplyConfirmation(quote, approval = false) {
    const locale = translations[getActiveLang()];
    const modal = document.getElementById('baseSwapConfirmModal');
    if (!modal) return Promise.resolve(false);
    if (baseSwapConfirmationResolver) baseSwapConfirmationResolver(false);
    const asset = quote?.asset || { symbol: 'USDC' };
    const pool = String(quote?.pool_address || '');
    document.getElementById('baseSwapConfirmTitle').textContent = approval
        ? locale.defiSupplyApprovalTitle
        : locale.defiSupplyModalTitle;
    document.getElementById('baseSwapConfirmNetwork').textContent = approval
        ? locale.defiSupplyApprovalNetwork
        : locale.defiSupplyModalNetwork;
    document.getElementById('baseSwapConfirmPayLabel').textContent = approval
        ? locale.defiSupplyApprovalPay
        : locale.defiSupplyPay;
    document.getElementById('baseSwapConfirmPayValue').textContent = `${quote?.amount || ''} ${asset.symbol || ''}`;
    document.getElementById('baseSwapConfirmReceiveLabel').textContent = approval
        ? locale.defiSupplyApprovalReceive
        : locale.defiSupplyReceive;
    document.getElementById('baseSwapConfirmReceiveValue').textContent = approval
        ? `${pool.slice(0, 6)}…${pool.slice(-4)}`
        : `a${asset.symbol || 'USDC'}`;
    setBaseSwapConfirmationDetails([
        { label: approval ? locale.confirmationApproval : locale.defiSupplyRate, value: approval ? pool : `${Number(quote?.annual_supply_rate_percent || 0).toLocaleString(undefined, { maximumFractionDigits: 4 })}%` },
        { label: approval ? locale.confirmationApprovalScope : locale.confirmationRouteContract, value: approval ? locale.confirmationApprovalExact : pool },
        { label: locale.confirmationNetworkFee, value: locale.confirmationNetworkFeeWallet },
        { label: locale.confirmationWalletCheck, value: locale.confirmationWalletCheckValue },
    ]);
    setBaseSwapConfirmationWarning(approval ? '' : locale.defiSupplyRateVariable);
    document.getElementById('baseSwapConfirmNotice').textContent = approval
        ? locale.defiSupplyApprovalNotice
        : locale.defiSupplyModalNotice;
    document.getElementById('baseSwapConfirmCancel').textContent = locale.baseSwapModalCancel;
    document.getElementById('baseSwapConfirmProceed').textContent = approval
        ? locale.defiSupplyApprovalProceed
        : locale.defiSupplyProceed;
    modal.classList.add('show');
    return new Promise((resolve) => {
        baseSwapConfirmationResolver = resolve;
    });
}

function openAaveWithdrawConfirmation(quote) {
    const locale = translations[getActiveLang()];
    const modal = document.getElementById('baseSwapConfirmModal');
    if (!modal) return Promise.resolve(false);
    if (baseSwapConfirmationResolver) baseSwapConfirmationResolver(false);
    const asset = quote?.asset || { symbol: 'USDC' };
    const pool = String(quote?.pool_address || '');
    document.getElementById('baseSwapConfirmTitle').textContent = locale.defiWithdrawModalTitle;
    document.getElementById('baseSwapConfirmNetwork').textContent = locale.defiWithdrawModalNetwork;
    document.getElementById('baseSwapConfirmPayLabel').textContent = locale.defiWithdrawPay;
    document.getElementById('baseSwapConfirmPayValue').textContent = `${quote?.amount || ''} a${asset.symbol || 'USDC'}`;
    document.getElementById('baseSwapConfirmReceiveLabel').textContent = locale.defiWithdrawReceive;
    document.getElementById('baseSwapConfirmReceiveValue').textContent = `${quote?.amount || ''} ${asset.symbol || 'USDC'}`;
    setBaseSwapConfirmationDetails([
        { label: locale.confirmationRouteContract, value: pool },
        { label: locale.confirmationNetworkFee, value: locale.confirmationNetworkFeeWallet },
        { label: locale.confirmationWalletCheck, value: locale.confirmationWalletCheckValue },
    ]);
    setBaseSwapConfirmationWarning('');
    document.getElementById('baseSwapConfirmNotice').textContent = locale.defiWithdrawModalNotice;
    document.getElementById('baseSwapConfirmCancel').textContent = locale.baseSwapModalCancel;
    document.getElementById('baseSwapConfirmProceed').textContent = locale.defiWithdrawProceed;
    modal.classList.add('show');
    return new Promise((resolve) => {
        baseSwapConfirmationResolver = resolve;
    });
}

function finishBaseSwapConfirmation(confirmed) {
    document.getElementById('baseSwapConfirmModal')?.classList.remove('show');
    const resolve = baseSwapConfirmationResolver;
    baseSwapConfirmationResolver = null;
    if (resolve) resolve(Boolean(confirmed));
}

function handleBaseSwapConfirmOverlayClick(event) {
    if (event.target.id === 'baseSwapConfirmModal' && mousedownOverlayTarget?.id === 'baseSwapConfirmModal') {
        finishBaseSwapConfirmation(false);
    }
}

function openWalletConnectQr(uri) {
    const locale = translations[getActiveLang()];
    const modal = document.getElementById('walletConnectModal');
    const title = document.getElementById('walletConnectModalTitle');
    const desc = document.getElementById('walletConnectModalDesc');
    const close = document.getElementById('walletConnectModalClose');
    const qrContainer = document.getElementById('walletConnectQrCode');
    if (!modal || !qrContainer || !window.qrcode) {
        showNotification(locale.walletConnectQrUnavailable, 'error');
        return;
    }
    title.textContent = locale.walletConnectQrTitle;
    desc.textContent = locale.walletConnectQrDesc;
    close.textContent = locale.walletConnectClose;
    qrContainer.innerHTML = '';
    const qr = qrcode(0, 'M');
    qr.addData(uri);
    qr.make();
    qrContainer.innerHTML = qr.createSvgTag({ cellSize: 5, margin: 1 });
    modal.classList.add('show');
}

function switchMenu(element, sectionName) {
    currentSection = sectionName;
    localStorage.setItem('airdrop_current_section', sectionName);
    renderDashboardContent(sectionName);
}

function switchActivityPane(pane) {
    const allowedPanes = new Set(['swap', 'plan', 'defi', 'quests', 'journal']);
    localStorage.setItem('ax_activity_pane', allowedPanes.has(pane) ? pane : 'swap');
    renderDashboardContent('Farming');
}

function getActiveBaseWalletAddress() {
    return sessionStorage.getItem('ax_active_wallet_address') || sessionStorage.getItem('ax_base_wallet_address') || '';
}

function setConnectedBaseWalletAddress(address) {
    const normalized = String(address || '').trim();
    if (!/^0x[0-9a-fA-F]{40}$/.test(normalized)) return;
    sessionStorage.setItem('ax_base_wallet_address', normalized);
    sessionStorage.setItem('ax_active_wallet_address', normalized);
}

function selectedEvmWalletAddresses(accounts) {
    const seen = new Set();
    return (Array.isArray(accounts) ? accounts : []).filter((address) => {
        if (!/^0x[0-9a-fA-F]{40}$/.test(address || '')) return false;
        const key = address.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

let walletConfigResolve = null;
let currentConfiguringAddress = '';

function openWalletConfigModal(address, resolve) {
    currentConfiguringAddress = address;
    walletConfigResolve = resolve;
    
    const modal = document.getElementById('walletConfigModal');
    const display = document.getElementById('walletConfigAddressDisplay');
    const labelInput = document.getElementById('walletConfigLabelInput');
    const proxyInput = document.getElementById('walletConfigProxyInput');
    const saveBtn = document.getElementById('walletConfigSaveBtn');
    
    if (display) display.textContent = address;
    if (labelInput) labelInput.value = '';
    if (proxyInput) proxyInput.value = '';
    if (saveBtn) saveBtn.disabled = true;
    
    if (modal) modal.classList.add('show');
}

function validateWalletConfigInputs() {
    const label = document.getElementById('walletConfigLabelInput')?.value.trim() || '';
    const proxy = document.getElementById('walletConfigProxyInput')?.value.trim() || '';
    const saveBtn = document.getElementById('walletConfigSaveBtn');
    if (saveBtn) {
        const isValid = label.length > 0 && proxy.length > 0;
        saveBtn.disabled = !isValid;
    }
}

function cancelWalletConfigModal() {
    const modal = document.getElementById('walletConfigModal');
    if (modal) modal.classList.remove('show');
    
    const resolve = walletConfigResolve;
    walletConfigResolve = null;
    currentConfiguringAddress = '';
    if (resolve) resolve();
}

async function saveWalletConfigModal() {
    const label = document.getElementById('walletConfigLabelInput')?.value.trim() || '';
    const proxy = document.getElementById('walletConfigProxyInput')?.value.trim() || '';
    const address = currentConfiguringAddress;
    const saveBtn = document.getElementById('walletConfigSaveBtn');

    if (!label || !proxy || !address) return;
    
    if (saveBtn) setButtonLoading(saveBtn, true, 'Сохранение...');

    try {
        const username = localStorage.getItem('airdrop_username') || "Robert";
        const res = await fetch('/api/wallets/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, wallet_address: address, label, proxy })
        });
        const data = await res.json();
        
        if (res.ok) {
            showNotification(translations[currentLang]?.walletAddSuccess || 'Кошелек успешно добавлен');
            const modal = document.getElementById('walletConfigModal');
            if (modal) modal.classList.remove('show');
            
            const resolve = walletConfigResolve;
            walletConfigResolve = null;
            currentConfiguringAddress = '';
            if (resolve) resolve();
        } else {
            const errText = translateBackendDetail(data.detail);
            showNotification(errText || 'Ошибка подключения кошелька', 'error');
        }
    } catch (e) {
        showNotification('Ошибка подключения кошелька', 'error');
    } finally {
        if (saveBtn) setButtonLoading(saveBtn, false, 'Сохранить');
    }
}

async function saveSelectedWalletAccounts(accounts) {
    const addresses = selectedEvmWalletAddresses(accounts);
    if (!addresses.length) return;
    
    for (const address of addresses) {
        await new Promise((resolve) => {
            openWalletConfigModal(address, resolve);
        });
    }
    if (document.getElementById('walletsListContainer')) await loadWalletsFromDB();
}

function updateBaseWalletConnectionState(address = sessionStorage.getItem('ax_base_wallet_address') || '') {
    const status = document.getElementById('baseWalletConnectionStatus');
    const addressInput = document.getElementById('newWalletAddress');
    const disconnectButton = document.getElementById('disconnectBaseWalletButton');
    if (addressInput && address) addressInput.value = address;
    if (status) {
        const t = translations[currentLang];
        status.innerText = address ? t.walletConnected.replace('{address}', `${address.slice(0, 6)}…${address.slice(-4)}`) : '';
        status.style.display = address ? 'block' : 'none';
    }
    if (disconnectButton) disconnectButton.style.display = address ? 'inline-flex' : 'none';
}

async function disconnectBaseWalletSession() {
    const t = translations[currentLang];
    try {
        if (walletConnectProvider?.session) await walletConnectProvider.disconnect();
    } catch (error) {
        console.warn('WalletConnect session disconnect failed', error);
    } finally {
        walletConnectProvider = null;
        sessionStorage.removeItem('ax_base_wallet_address');
        sessionStorage.removeItem('ax_active_wallet_address');
        updateBaseWalletConnectionState('');
        if (document.getElementById('walletsListContainer')) loadWalletsFromDB();
        showNotification(t.walletSessionDisconnected);
    }
}

async function connectBaseWallet() {
    const t = translations[currentLang];
    const provider = window.ethereum;
    if (!provider || typeof provider.request !== 'function') {
        showNotification(t.walletConnectUnsupported, 'error');
        return;
    }
    try {
        // MetaMask keeps the previously permitted account by default. Requesting the
        // eth_accounts permission again opens its account chooser when supported.
        if (provider.isMetaMask) {
            try {
                await provider.request({
                    method: 'wallet_requestPermissions',
                    params: [{ eth_accounts: {} }],
                });
            } catch (permissionError) {
                if (permissionError?.code === 4001) throw permissionError;
                // Some injected wallets do not implement the MetaMask permission API.
                if (permissionError?.code !== -32601) throw permissionError;
            }
        }
        const accounts = await provider.request({ method: 'eth_requestAccounts' });
        const selectedAccounts = selectedEvmWalletAddresses(accounts);
        if (!selectedAccounts[0]) throw new Error('No account returned');
        let chainId = await provider.request({ method: 'eth_chainId' });
        if (chainId !== BASE_MAINNET_CHAIN_ID) {
            try {
                await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: BASE_MAINNET_CHAIN_ID }] });
            } catch (switchError) {
                if (switchError?.code !== 4902) throw switchError;
                await provider.request({ method: 'wallet_addEthereumChain', params: [BASE_MAINNET_CONFIG] });
            }
            chainId = await provider.request({ method: 'eth_chainId' });
        }
        if (chainId !== BASE_MAINNET_CHAIN_ID) {
            showNotification(t.walletBaseRequired, 'error');
            return;
        }
        const address = selectedAccounts[0];
        setConnectedBaseWalletAddress(address);
        updateBaseWalletConnectionState(address);
        await saveSelectedWalletAccounts(selectedAccounts);
    } catch (error) {
        showNotification(t.walletConnectRejected, 'error');
    }
}

function normalizeEthInput(value) {
    const input = String(value || '').trim();
    if (!/^\d+(?:\.\d{1,18})?$/.test(input)) return null;
    const [wholePart, fractionPart = ''] = input.split('.');
    const whole = wholePart.replace(/^0+(?=\d)/, '') || '0';
    const fraction = fractionPart.replace(/0+$/, '');
    const normalized = fraction ? `${whole}.${fraction}` : whole;
    return normalized === '0' ? null : normalized;
}

function parseTestEthAmount(value) {
    const normalized = normalizeEthInput(value);
    if (!normalized) return null;
    const [whole, fraction = ''] = normalized.split('.');
    const wei = BigInt(whole) * (10n ** 18n) + BigInt((fraction + '0'.repeat(18)).slice(0, 18));
    return wei > 0n ? wei : null;
}

async function switchToBaseSepolia(provider) {
    let chainId = await provider.request({ method: 'eth_chainId' });
    if (chainId === BASE_SEPOLIA_CHAIN_ID) return;
    try {
        await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: BASE_SEPOLIA_CHAIN_ID }] });
    } catch (switchError) {
        if (switchError?.code !== 4902) throw switchError;
        await provider.request({ method: 'wallet_addEthereumChain', params: [BASE_SEPOLIA_CONFIG] });
    }
    chainId = await provider.request({ method: 'eth_chainId' });
    if (chainId !== BASE_SEPOLIA_CHAIN_ID) throw new Error('test_network_not_selected');
}

async function switchToBaseMainnet(provider) {
    let chainId = await provider.request({ method: 'eth_chainId' });
    if (chainId === BASE_MAINNET_CHAIN_ID) return;
    try {
        await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: BASE_MAINNET_CHAIN_ID }] });
    } catch (switchError) {
        if (switchError?.code !== 4902) throw switchError;
        await provider.request({ method: 'wallet_addEthereumChain', params: [BASE_MAINNET_CONFIG] });
    }
    chainId = await provider.request({ method: 'eth_chainId' });
    if (chainId !== BASE_MAINNET_CHAIN_ID) throw new Error('base_mainnet_not_selected');
}

async function switchToUniversalBridgeNetwork(provider, network) {
    const config = UNIVERSAL_BRIDGE_NETWORKS[network];
    if (!provider?.request || !config) throw new Error('universal_bridge_network_unsupported');
    let chainId = await provider.request({ method: 'eth_chainId' });
    if (String(chainId).toLowerCase() === config.chainId.toLowerCase()) return;
    try {
        await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: config.chainId }] });
    } catch (switchError) {
        if (switchError?.code !== 4902) throw switchError;
        await provider.request({ method: 'wallet_addEthereumChain', params: [config] });
    }
    chainId = await provider.request({ method: 'eth_chainId' });
    if (String(chainId).toLowerCase() !== config.chainId.toLowerCase()) {
        throw new Error('universal_bridge_network_not_selected');
    }
}

async function sendBaseSepoliaTestTransfer() {
    const locale = translations[getActiveLang()];
    const provider = window.ethereum;
    const result = document.getElementById('baseSepoliaTestResult');
    const recipient = document.getElementById('baseSepoliaTestRecipient')?.value.trim();
    const amountWei = parseTestEthAmount(document.getElementById('baseSepoliaTestAmount')?.value);
    const button = document.getElementById('baseSepoliaTestButton');
    if (!provider?.request) {
        showNotification(locale.testTransferWalletRequired, 'error');
        return;
    }
    if (!/^0x[0-9a-fA-F]{40}$/.test(recipient) || !amountWei || amountWei > 50000000000000000n) {
        if (result) result.innerHTML = `<span style="color:#fca5a5;">${locale.testTransferInvalid}</span>`;
        return;
    }
    try {
        setButtonLoading(button, true, locale.testTransferSigning);
        const accounts = await provider.request({ method: 'eth_requestAccounts' });
        if (!Array.isArray(accounts) || !accounts[0]) throw new Error('test_wallet_not_connected');
        await switchToBaseSepolia(provider);
        const hash = await provider.request({
            method: 'eth_sendTransaction',
            params: [{ from: accounts[0], to: recipient, value: `0x${amountWei.toString(16)}` }],
        });
        if (result) {
            const txUrl = `${BASE_SEPOLIA_CONFIG.blockExplorerUrls[0]}/tx/${encodeURIComponent(hash)}`;
            result.innerHTML = `<span style="color:#86efac;">${locale.testTransferSent}</span> <a href="${txUrl}" target="_blank" rel="noopener noreferrer" style="color:#c4b5fd;">${locale.testTransferOpenExplorer}</a>`;
        }
    } catch (error) {
        const isRejected = error?.code === 4001 || error?.code === 'ACTION_REJECTED';
        if (result) result.innerHTML = `<span style="color:#fca5a5;">${isRejected ? locale.testTransferRejected : locale.testTransferFailed}</span>`;
    } finally {
        setButtonLoading(button, false, locale.testTransferButton);
    }
}

let savedTransferTemplates = [];

function transferTemplateWalletName(wallet) {
    const locale = translations[getActiveLang()];
    return wallet.label || `${locale.walletDefaultName} ${wallet.id}`;
}

async function loadTransferCenter() {
    const container = document.getElementById('walletTransferCenter');
    if (!container) return;
    const locale = translations[getActiveLang()];
    try {
        const response = await fetch('/api/transfer-center');
        if (response.status === 401) return;
        const data = await response.json();
        if (!response.ok || !Array.isArray(data.wallets) || !Array.isArray(data.templates)) throw new Error('transfer_center_unavailable');
        savedTransferTemplates = data.templates;
        const walletById = new Map(data.wallets.map((wallet) => [wallet.id, wallet]));
        const recipients = data.wallets.length
            ? data.wallets.map((wallet) => `<option value="${Number(wallet.id)}">${escapeHtml(transferTemplateWalletName(wallet))} — ${escapeHtml(`${wallet.address.slice(0, 6)}…${wallet.address.slice(-4)}`)}</option>`).join('')
            : '';
        const createForm = data.wallets.length >= 2
            ? `<div style="display:grid; grid-template-columns:1.1fr 1.6fr .8fr; gap:10px;">
                    <input id="transferTemplateName" maxlength="60" class="auth-input" placeholder="${locale.transferTemplateName}" style="font-size:13px; padding:10px 12px;">
                    <select id="transferTemplateRecipient" class="auth-input" style="font-size:13px; padding:10px 12px;">${recipients}</select>
                    <input id="transferTemplateAmount" inputmode="decimal" class="auth-input" placeholder="0.001" style="font-size:13px; padding:10px 12px;">
               </div>
               <button type="button" onclick="createTransferTemplate()" class="btn-dark-sm" style="margin-top:10px; width:auto; padding:10px 14px; border-color:#7c3aed;">${locale.transferTemplateSave}</button>`
            : `<div style="color:var(--text-muted); font-size:13px; line-height:1.5;">${locale.transferNeedTwoWallets}</div>`;
        const templates = data.templates.length
            ? data.templates.map((template) => {
                const wallet = walletById.get(template.recipient_wallet_id);
                const recipientName = wallet ? transferTemplateWalletName(wallet) : `${template.recipient_address.slice(0, 6)}…${template.recipient_address.slice(-4)}`;
                return `<div style="background:var(--bg-main); border:1px solid var(--border-color); border-radius:12px; padding:13px; display:flex; justify-content:space-between; gap:12px; align-items:center;">
                    <div>
                        <div style="color:#fff; font-weight:700; font-size:13px;">${escapeHtml(template.name)}</div>
                        <div style="color:var(--text-muted); font-size:12px; margin-top:4px;">${escapeHtml(recipientName)} · ${escapeHtml(template.recipient_address.slice(0, 6))}…${escapeHtml(template.recipient_address.slice(-4))}</div>
                    </div>
                    <div style="display:flex; gap:7px; align-items:center; flex-wrap:wrap; justify-content:flex-end;">
                        <input id="transferTemplateAmount-${Number(template.id)}" inputmode="decimal" value="${escapeHtml(template.default_amount)}" class="auth-input" style="width:88px; padding:7px 9px; font-size:12px;">
                        <button type="button" id="transferTemplateSend-${Number(template.id)}" onclick="sendTransferTemplate(${Number(template.id)})" class="btn-dark-sm" style="padding:7px 10px; border-color:#7c3aed;">${locale.transferSend}</button>
                        <button type="button" onclick="deleteTransferTemplate(${Number(template.id)})" class="btn-dark-sm" style="padding:7px 10px; color:#fca5a5;">${locale.transferDelete}</button>
                    </div>
                </div>`;
            }).join('')
            : `<div style="color:var(--text-muted); font-size:13px;">${locale.transferNoTemplates}</div>`;
        const history = Array.isArray(data.history) && data.history.length
            ? data.history.map((record) => `<div style="display:flex; justify-content:space-between; gap:10px; font-size:12px; padding:9px 0; border-top:1px solid var(--border-color);">
                    <span style="color:var(--text-muted);">${escapeHtml(record.amount)} ETH · ${escapeHtml(`${record.to_address.slice(0, 6)}…${record.to_address.slice(-4)}`)}</span>
                    <a href="${BASE_MAINNET_CONFIG.blockExplorerUrls[0]}/tx/${encodeURIComponent(record.tx_hash)}" target="_blank" rel="noopener noreferrer" style="color:#c4b5fd; text-decoration:none;">${locale.transferOpenTx}</a>
                </div>`).join('')
            : `<div style="color:var(--text-muted); font-size:12px;">${locale.transferNoHistory}</div>`;
        container.innerHTML = `<div style="margin-bottom:14px;">${createForm}</div><div style="display:flex; flex-direction:column; gap:9px;">${templates}</div><div style="margin-top:16px; color:#fff; font-weight:700; font-size:13px;">${locale.transferHistoryTitle}</div><div>${history}</div><div id="transferCenterResult" style="margin-top:10px; font-size:12px;"></div>`;
    } catch (error) {
        container.innerHTML = `<div style="color:#fca5a5; font-size:13px;">${locale.transferLoadError}</div>`;
    }
}

async function createTransferTemplate() {
    const locale = translations[getActiveLang()];
    const payload = {
        name: document.getElementById('transferTemplateName')?.value || '',
        recipient_wallet_id: Number(document.getElementById('transferTemplateRecipient')?.value),
        default_amount: document.getElementById('transferTemplateAmount')?.value || '',
    };
    try {
        const response = await fetch('/api/transfer-templates', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || 'transfer_template_failed');
        showNotification(locale.transferTemplateSaved, 'success');
        await loadTransferCenter();
    } catch (error) {
        showNotification(translateBackendDetail(error.message) || locale.transferTemplateError, 'error');
    }
}

async function deleteTransferTemplate(templateId) {
    const locale = translations[getActiveLang()];
    if (!window.confirm(locale.transferDeleteConfirm)) return;
    try {
        const response = await fetch(`/api/transfer-templates/${templateId}`, { method: 'DELETE' });
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || 'transfer_template_failed');
        await loadTransferCenter();
    } catch (error) {
        showNotification(translateBackendDetail(error.message) || locale.transferTemplateError, 'error');
    }
}

async function sendTransferTemplate(templateId) {
    const locale = translations[getActiveLang()];
    const template = savedTransferTemplates.find((item) => item.id === templateId);
    const amount = document.getElementById(`transferTemplateAmount-${templateId}`)?.value || '';
    const amountWei = parseTestEthAmount(amount);
    const result = document.getElementById('transferCenterResult');
    const button = document.getElementById(`transferTemplateSend-${templateId}`);
    const provider = walletConnectProvider?.session ? walletConnectProvider : window.ethereum;
    if (!template || !amountWei || !provider?.request) {
        if (result) result.innerHTML = `<span style="color:#fca5a5;">${locale.transferInvalid}</span>`;
        return;
    }
    try {
        let accounts = await provider.request({ method: 'eth_accounts' });
        if (!Array.isArray(accounts) || !accounts[0]) accounts = await provider.request({ method: 'eth_requestAccounts' });
        const fromAddress = accounts?.[0];
        if (!/^0x[0-9a-fA-F]{40}$/.test(fromAddress || '') || fromAddress.toLowerCase() === template.recipient_address.toLowerCase()) {
            throw new Error('invalid_transfer_wallet');
        }
        if (!window.confirm(locale.transferConfirm.replace('{amount}', amount).replace('{recipient}', `${template.recipient_address.slice(0, 6)}…${template.recipient_address.slice(-4)}`))) return;
        setButtonLoading(button, true, locale.transferSigning);
        await switchToBaseMainnet(provider);
        const txHash = await provider.request({
            method: 'eth_sendTransaction',
            params: [{ from: fromAddress, to: template.recipient_address, value: `0x${amountWei.toString(16)}` }],
        });
        const recordResponse = await fetch('/api/transfer-records', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ template_id: template.id, from_address: fromAddress, to_address: template.recipient_address, amount, tx_hash: txHash }),
        });
        const txUrl = `${BASE_MAINNET_CONFIG.blockExplorerUrls[0]}/tx/${encodeURIComponent(txHash)}`;
        if (result) result.innerHTML = `<span style="color:#86efac;">${locale.transferSubmitted}</span> <a href="${txUrl}" target="_blank" rel="noopener noreferrer" style="color:#c4b5fd;">${locale.transferOpenTx}</a>`;
        if (recordResponse.ok) await loadTransferCenter();
    } catch (error) {
        const isRejected = error?.code === 4001 || error?.code === 'ACTION_REJECTED';
        if (result) result.innerHTML = `<span style="color:#fca5a5;">${isRejected ? locale.transferRejected : locale.transferFailed}</span>`;
    } finally {
        setButtonLoading(button, false, locale.transferSend);
    }
}

function getDirectTransferEthAsset() {
    const assets = Array.isArray(directTransferBalanceData?.visible_assets)
        ? directTransferBalanceData.visible_assets
        : [];
    return assets.find((asset) => asset.symbol === 'ETH') || null;
}

function updateDirectTransferAmount() {
    const availability = document.getElementById('directTransferAvailability');
    const amountUsd = document.getElementById('directTransferUsd');
    const input = document.getElementById('directTransferAmount');
    const locale = translations[getActiveLang()];
    const asset = getDirectTransferEthAsset();
    if (!availability || !amountUsd || !input || !asset) return false;
    const amount = Number(input.value);
    const available = Number(asset.available_to_send);
    if (!Number.isFinite(amount) || amount <= 0) {
        amountUsd.textContent = '';
        availability.textContent = locale.directTransferAvailable
            .replace('{amount}', asset.available_to_send)
            .replace('{reserve}', asset.gas_reserve || '0');
        availability.style.color = '#bfdbfe';
        return false;
    }
    amountUsd.textContent = locale.directTransferUsd.replace('{usd}', (amount * Number(asset.unit_price_usd)).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }));
    if (amount > available) {
        availability.textContent = locale.directTransferExceeds.replace('{amount}', asset.available_to_send);
        availability.style.color = '#fca5a5';
        return false;
    }
    availability.textContent = locale.directTransferAvailable
        .replace('{amount}', asset.available_to_send)
        .replace('{reserve}', asset.gas_reserve || '0');
    availability.style.color = '#86efac';
    return true;
}

function useDirectTransferMax() {
    const input = document.getElementById('directTransferAmount');
    const asset = getDirectTransferEthAsset();
    if (!input || !asset) return;
    input.value = asset.available_to_send;
    updateDirectTransferAmount();
}

async function loadDirectTransferPanel() {
    const container = document.getElementById('directTransferPanel');
    if (!container) return;
    const locale = translations[getActiveLang()];
    const activeAddress = getActiveBaseWalletAddress();
    if (!/^0x[0-9a-fA-F]{40}$/.test(activeAddress)) {
        container.textContent = locale.directTransferWalletRequired;
        container.style.color = '#fbbf24';
        return;
    }
    try {
        const transferResponse = await fetch('/api/transfer-center');
        const transferData = await transferResponse.json();
        if (!transferResponse.ok || !Array.isArray(transferData.wallets)) throw new Error('transfer_center_unavailable');
        const sender = transferData.wallets.find((wallet) => wallet.address?.toLowerCase() === activeAddress.toLowerCase());
        const recipients = transferData.wallets.filter((wallet) => wallet.address?.toLowerCase() !== activeAddress.toLowerCase());
        if (!sender || !recipients.length) {
            container.textContent = locale.directTransferNeedRecipient;
            container.style.color = 'var(--text-muted)';
            return;
        }
        const balanceResponse = await fetch(`/api/wallets/${sender.id}/network-balance/Base`);
        const balanceData = await balanceResponse.json();
        if (!balanceResponse.ok) throw new Error('base_balance_unavailable');
        const ethAsset = (balanceData.visible_assets || []).find((asset) => asset.symbol === 'ETH');
        if (!ethAsset || Number(ethAsset.available_to_send) <= 0) {
            container.textContent = locale.directTransferInsufficientEth;
            container.style.color = '#fbbf24';
            return;
        }
        directTransferWallets = transferData.wallets;
        directTransferBalanceData = balanceData;
        const recipientOptions = recipients.map((wallet) => `<option value="${Number(wallet.id)}">${escapeHtml(transferTemplateWalletName(wallet))} · ${escapeHtml(wallet.address.slice(0, 6))}…${escapeHtml(wallet.address.slice(-4))}</option>`).join('');
        const history = Array.isArray(transferData.history) && transferData.history.length
            ? transferData.history.slice(0, 5).map((record) => `<div style="display:flex; justify-content:space-between; gap:10px; font-size:12px; padding:8px 0; border-top:1px solid var(--border-color);"><span style="color:var(--text-muted);">${escapeHtml(record.amount)} ETH → ${escapeHtml(`${record.to_address.slice(0, 6)}…${record.to_address.slice(-4)}`)}</span><a href="${BASE_MAINNET_CONFIG.blockExplorerUrls[0]}/tx/${encodeURIComponent(record.tx_hash)}" target="_blank" rel="noopener noreferrer" style="color:#c4b5fd; text-decoration:none;">${locale.directTransferOpenTx}</a></div>`).join('')
            : `<div style="color:var(--text-muted); font-size:12px;">${locale.directTransferNoHistory}</div>`;
        container.style.color = '';
        container.innerHTML = `
            <div style="display:grid; grid-template-columns:1.4fr 1fr; gap:10px;">
                <label style="color:var(--text-muted); font-size:12px;">${locale.directTransferRecipient}<select id="directTransferRecipient" class="auth-input" style="margin-top:5px; font-size:13px; padding:10px 12px;">${recipientOptions}</select></label>
                <label style="color:var(--text-muted); font-size:12px;">${locale.directTransferAmount}<input id="directTransferAmount" inputmode="decimal" placeholder="0.001" oninput="updateDirectTransferAmount()" class="auth-input" style="margin-top:5px; font-size:13px; padding:10px 12px;"><div id="directTransferUsd" style="color:#c4b5fd; font-size:14px; font-weight:700; margin-top:6px;"></div></label>
            </div>
            <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; margin-top:8px;">
                <div id="directTransferAvailability" style="font-size:12px;"></div>
                <button type="button" onclick="useDirectTransferMax()" class="btn-dark-sm" style="padding:6px 10px; font-size:11px; white-space:nowrap;">${locale.directTransferMax}</button>
            </div>
            <button type="button" id="directTransferSendButton" onclick="sendDirectBaseTransfer()" class="btn-purple-lg" style="font-size:13px; padding:11px 16px; width:auto; margin-top:14px;">${locale.directTransferReview}</button>
            <div id="directTransferResult" style="font-size:12px; line-height:1.5; margin-top:10px;"></div>
            <details style="border-top:1px solid var(--border-color); margin-top:16px; padding-top:13px;"><summary style="color:var(--text-muted); cursor:pointer; font-size:12px;">${locale.directTransferHistory}</summary><div style="margin-top:9px;">${history}</div></details>`;
        updateDirectTransferAmount();
    } catch (_) {
        container.textContent = locale.directTransferLoadError;
        container.style.color = '#fca5a5';
    }
}

async function sendDirectBaseTransfer() {
    const locale = translations[getActiveLang()];
    const recipientId = Number(document.getElementById('directTransferRecipient')?.value);
    const recipient = directTransferWallets.find((wallet) => wallet.id === recipientId);
    const amount = document.getElementById('directTransferAmount')?.value.trim() || '';
    const amountWei = parseTestEthAmount(amount);
    const result = document.getElementById('directTransferResult');
    const button = document.getElementById('directTransferSendButton');
    const provider = walletConnectProvider?.session ? walletConnectProvider : window.ethereum;
    if (!recipient || !amountWei || !provider?.request || !updateDirectTransferAmount()) {
        if (result) result.innerHTML = `<span style="color:#fca5a5;">${locale.directTransferInvalid}</span>`;
        return;
    }
    try {
        let accounts = await provider.request({ method: 'eth_accounts' });
        if (!Array.isArray(accounts) || !accounts[0]) accounts = await provider.request({ method: 'eth_requestAccounts' });
        const fromAddress = accounts?.[0];
        const activeAddress = getActiveBaseWalletAddress();
        if (!/^0x[0-9a-fA-F]{40}$/.test(fromAddress || '') || fromAddress.toLowerCase() !== activeAddress.toLowerCase() || fromAddress.toLowerCase() === recipient.address.toLowerCase()) {
            throw new Error('invalid_transfer_wallet');
        }
        if (!await openBaseTransferConfirmation(amount, recipient.address, transferTemplateWalletName(recipient))) return;
        setButtonLoading(button, true, locale.directTransferSigning);
        await switchToBaseMainnet(provider);
        const txHash = await provider.request({
            method: 'eth_sendTransaction',
            params: [{ from: fromAddress, to: recipient.address, value: `0x${amountWei.toString(16)}` }],
        });
        try {
            await fetch('/api/transfer-records/direct', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ recipient_wallet_id: recipient.id, from_address: fromAddress, to_address: recipient.address, amount, tx_hash: txHash }),
            });
        } catch (_) {
            // The wallet submitted the transaction; history can be refreshed later.
        }
        const txUrl = `${BASE_MAINNET_CONFIG.blockExplorerUrls[0]}/tx/${encodeURIComponent(txHash)}`;
        if (result) result.innerHTML = `<span style="color:#86efac;">${locale.directTransferSubmitted}</span> <a href="${txUrl}" target="_blank" rel="noopener noreferrer" style="color:#c4b5fd;">${locale.directTransferOpenTx}</a>`;
    } catch (error) {
        const isRejected = error?.code === 4001 || error?.code === 'ACTION_REJECTED';
        if (result) result.innerHTML = `<span style="color:#fca5a5;">${isRejected ? locale.directTransferRejected : locale.directTransferFailed}</span>`;
    } finally {
        setButtonLoading(button, false, locale.directTransferReview);
    }
}

let activeBaseSwapQuote = null;
let activeAaveSupplyQuote = null;
let activeAaveWithdrawQuote = null;

function formatUsdcAmount(rawAmount) {
    try {
        const raw = BigInt(String(rawAmount || '0'));
        const whole = raw / 1000000n;
        const fraction = (raw % 1000000n).toString().padStart(6, '0').slice(0, 4).replace(/0+$/, '');
        return `${whole.toString()}${fraction ? `.${fraction}` : ''}`;
    } catch (_) {
        return '';
    }
}

async function loadBaseSwapHistory() {
    const locale = translations[getActiveLang()];
    const container = document.getElementById('baseSwapHistory');
    if (!container) return;
    try {
        const response = await fetch('/api/base-swap/history');
        const data = await response.json();
        if (!response.ok || !Array.isArray(data.records)) throw new Error('base_swap_history_unavailable');
        if (!data.records.length) {
            container.innerHTML = `<div style="color:var(--text-muted); font-size:12px;">${locale.baseSwapNoHistory}</div>`;
            return;
        }
        container.innerHTML = data.records.map((record) => {
            const output = formatUsdcAmount(record.amount_out);
            const txUrl = `${BASE_MAINNET_CONFIG.blockExplorerUrls[0]}/tx/${encodeURIComponent(record.tx_hash)}`;
            const date = new Date(Number(record.created_at) * 1000).toLocaleString();
            return `<div style="background:var(--bg-main); border:1px solid var(--border-color); border-radius:9px; padding:9px 10px; display:flex; justify-content:space-between; gap:10px; align-items:center; margin-top:7px;"><div><div style="color:#fff; font-size:12px;">${escapeHtml(record.amount_in)} ETH → ${escapeHtml(output || '—')} USDC</div><div style="color:var(--text-muted); font-size:11px; margin-top:3px;">${escapeHtml(date)} • ${locale.baseSwapStatusSubmitted}</div></div><a href="${txUrl}" target="_blank" rel="noopener noreferrer" style="color:#c4b5fd; font-size:12px; white-space:nowrap;">${locale.baseSwapOpenTx}</a></div>`;
        }).join('');
    } catch (_) {
        container.innerHTML = `<div style="color:#fca5a5; font-size:12px;">${locale.baseSwapHistoryUnavailable}</div>`;
    }
}

async function requestBaseSwapQuote() {
    const locale = translations[getActiveLang()];
    const amount = normalizeEthInput(document.getElementById('operationAmount')?.value || document.getElementById('baseSwapAmount')?.value);
    const connectedAddress = getActiveBaseWalletAddress();
    const result = document.getElementById('baseSwapResult');
    const button = document.getElementById('baseSwapQuoteButton');
    if (!validateOperationAmount()) return;
    if (!/^0x[0-9a-fA-F]{40}$/.test(connectedAddress)) {
        if (result) result.innerHTML = `<span style="color:#fca5a5;">${locale.baseSwapWalletRequired}</span>`;
        return;
    }
    if (!amount || !parseTestEthAmount(amount)) {
        if (result) result.innerHTML = `<span style="color:#fca5a5;">${locale.baseSwapInvalidAmount}</span>`;
        return;
    }
    const provider = walletConnectProvider?.session ? walletConnectProvider : window.ethereum;
    try {
        const accounts = provider?.request ? await provider.request({ method: 'eth_accounts' }) : [];
        if (!Array.isArray(accounts) || !accounts[0] || accounts[0].toLowerCase() !== connectedAddress.toLowerCase()) {
            if (result) result.innerHTML = `<span style="color:#fca5a5;">${locale.baseSwapActiveWalletMismatch}</span>`;
            return;
        }
    } catch (_) {
        if (result) result.innerHTML = `<span style="color:#fca5a5;">${locale.baseSwapActiveWalletMismatch}</span>`;
        return;
    }
    try {
        setButtonLoading(button, true, locale.baseSwapQuoting);
        const response = await fetch('/api/base-swap/quote', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ wallet_address: connectedAddress, amount, slippage: 0.5 }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || 'base_swap_quote_failed');
        activeBaseSwapQuote = data;
        const amountOut = formatUsdcAmount(data.amount_out);
        if (result) {
            result.innerHTML = `<div style="color:#86efac; font-weight:600;">${locale.baseSwapQuoteReady.replace('{amount}', amountOut || '—')}</div><div style="color:var(--text-muted); margin-top:4px;">${locale.baseSwapQuoteExpiry.replace('{seconds}', data.expires_in)}</div><button type="button" id="baseSwapSubmitButton" onclick="submitBaseSwap()" class="btn-purple-lg" style="font-size:13px; padding:10px 14px; width:auto; margin-top:10px;">${locale.baseSwapReview}</button>`;
        }
    } catch (error) {
        activeBaseSwapQuote = null;
        const errorMessage = String(error?.message || '');
        const displayMessage = errorMessage.includes('not configured')
            ? locale.baseSwapNotConfigured
            : (errorMessage.includes('Save this wallet in AIRDROP-X')
                ? locale.baseSwapWalletRequired
                : (translateBackendDetail(errorMessage) || locale.baseSwapQuoteError));
        if (result) result.innerHTML = `<span style="color:#fca5a5;">${displayMessage}</span>`;
    } finally {
        setButtonLoading(button, false, locale.baseSwapGetQuote);
    }
}

async function submitBaseSwap() {
    const locale = translations[getActiveLang()];
    const quote = activeBaseSwapQuote;
    const provider = walletConnectProvider?.session ? walletConnectProvider : window.ethereum;
    const result = document.getElementById('baseSwapResult');
    const button = document.getElementById('baseSwapSubmitButton');
    if (!quote || !provider?.request) {
        if (result) result.innerHTML = `<span style="color:#fca5a5;">${locale.baseSwapExpired}</span>`;
        return;
    }
    try {
        let accounts = await provider.request({ method: 'eth_accounts' });
        if (!Array.isArray(accounts) || !accounts[0]) accounts = await provider.request({ method: 'eth_requestAccounts' });
        const fromAddress = accounts?.[0];
        const connectedAddress = getActiveBaseWalletAddress();
        if (!/^0x[0-9a-fA-F]{40}$/.test(fromAddress || '') || fromAddress.toLowerCase() !== connectedAddress.toLowerCase()) {
            if (result) result.innerHTML = `<span style="color:#fca5a5;">${locale.baseSwapActiveWalletMismatch}</span>`;
            return;
        }
        const expectedOutput = formatUsdcAmount(quote.amount_out) || '—';
        if (!await openBaseSwapConfirmation(quote.amount_in, expectedOutput)) return;
        setButtonLoading(button, true, locale.baseSwapPreparing);
        const response = await fetch('/api/base-swap/build', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ quote_id: quote.quote_id }),
        });
        const data = await response.json();
        if (!response.ok || !data.transaction) throw new Error(data.detail || 'base_swap_build_failed');
        const tx = data.transaction;
        if (tx.chain_id !== 8453 || tx.from.toLowerCase() !== fromAddress.toLowerCase() || !/^0x[0-9a-fA-F]{40}$/.test(tx.to) || !/^0x[0-9a-fA-F]+$/.test(tx.data) || !/^(?:0|[1-9]\d*|0x[0-9a-fA-F]+)$/.test(String(tx.value))) {
            throw new Error('base_swap_transaction_invalid');
        }
        await switchToBaseMainnet(provider);
        setButtonLoading(button, true, locale.baseSwapSigning);
        const txHash = await provider.request({
            method: 'eth_sendTransaction',
            params: [{ from: fromAddress, to: tx.to, data: tx.data, value: `0x${BigInt(tx.value).toString(16)}` }],
        });
        activeBaseSwapQuote = null;
        if (data.submission_id) {
            try {
                await fetch('/api/base-swap/submissions', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ submission_id: data.submission_id, tx_hash: txHash }),
                });
                await loadBaseSwapHistory();
            } catch (_) {
                // The wallet already submitted the transaction; history can be refreshed later.
            }
        }
        const txUrl = `${BASE_MAINNET_CONFIG.blockExplorerUrls[0]}/tx/${encodeURIComponent(txHash)}`;
        if (result) result.innerHTML = `<span style="color:#86efac;">${locale.baseSwapSubmitted}</span> <a href="${txUrl}" target="_blank" rel="noopener noreferrer" style="color:#c4b5fd;">${locale.baseSwapOpenTx}</a>`;
    } catch (error) {
        const rejected = error?.code === 4001 || error?.code === 'ACTION_REJECTED';
        const errorMessage = String(error?.message || '');
        const displayMessage = errorMessage.includes('Base Swap quote expired')
            ? locale.baseSwapExpired
            : (translateBackendDetail(errorMessage) || locale.baseSwapFailed);
        if (result) result.innerHTML = `<span style="color:#fca5a5;">${rejected ? locale.baseSwapRejected : displayMessage}</span>`;
    } finally {
        setButtonLoading(button, false, locale.baseSwapReview);
    }
}

async function getWalletConnectProvider() {
    if (walletConnectProvider) return walletConnectProvider;
    const configResponse = await fetch('/api/walletconnect/config');
    const config = await configResponse.json();
    if (!configResponse.ok || !config.project_id) throw new Error('walletconnect_config_missing');

    if (!walletConnectModulePromise) {
        walletConnectModulePromise = import(WALLETCONNECT_PROVIDER_MODULE_URL);
    }
    const walletConnectModule = await walletConnectModulePromise;
    const EthereumProvider = walletConnectModule.EthereumProvider || walletConnectModule.default?.EthereumProvider || walletConnectModule.default;
    if (!EthereumProvider?.init) throw new Error('walletconnect_provider_unavailable');

    walletConnectProvider = await EthereumProvider.init({
        projectId: config.project_id,
        showQrModal: false,
        optionalChains: Object.values(UNIVERSAL_BRIDGE_NETWORKS).map((network) => parseInt(network.chainId, 16)),
        optionalMethods: ['eth_requestAccounts', 'eth_accounts', 'eth_chainId', 'eth_sendTransaction', 'wallet_switchEthereumChain', 'wallet_addEthereumChain', 'eth_call', 'eth_getTransactionReceipt'],
        optionalEvents: ['accountsChanged', 'chainChanged'],
        rpcMap: Object.fromEntries(Object.values(UNIVERSAL_BRIDGE_NETWORKS).map((network) => [parseInt(network.chainId, 16), network.rpcUrls[0]])),
        metadata: {
            name: 'AIRDROP-X',
            description: 'Non-custodial Base wallet connection',
            url: window.location.origin,
            icons: []
        }
    });
    walletConnectProvider.on('accountsChanged', (accounts) => {
        const address = Array.isArray(accounts) ? accounts[0] : '';
        if (address) {
            setConnectedBaseWalletAddress(address);
            updateBaseWalletConnectionState(address);
        }
    });
    walletConnectProvider.on('display_uri', openWalletConnectQr);
    walletConnectProvider.on('connect', closeWalletConnectModal);
    walletConnectProvider.on('disconnect', () => {
        walletConnectProvider = null;
        sessionStorage.removeItem('ax_base_wallet_address');
        sessionStorage.removeItem('ax_active_wallet_address');
        updateBaseWalletConnectionState('');
    });
    return walletConnectProvider;
}

async function connectWalletConnectBase() {
    const locale = translations[getActiveLang()];
    try {
        showNotification(locale.walletConnectLoading);
        const provider = await getWalletConnectProvider();
        const accounts = await provider.enable();
        const chainId = await provider.request({ method: 'eth_chainId' });
        if (chainId !== BASE_MAINNET_CHAIN_ID) {
            await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: BASE_MAINNET_CHAIN_ID }] });
        }
        const selectedAccounts = selectedEvmWalletAddresses(accounts);
        const address = selectedAccounts[0] || '';
        if (!address) throw new Error('walletconnect_no_address');
        setConnectedBaseWalletAddress(address);
        updateBaseWalletConnectionState(address);
        await saveSelectedWalletAccounts(selectedAccounts);
    } catch (error) {
        closeWalletConnectModal();
        console.error('WalletConnect connection failed', error);
        const reason = String(error?.message || '').toLowerCase();
        const message = error?.message === 'walletconnect_config_missing'
            ? locale.walletConnectConfigMissing
            : reason.includes('project') || reason.includes('origin') || reason.includes('allowlist')
                ? locale.walletConnectProjectError
                : reason.includes('relay') || reason.includes('websocket') || reason.includes('network')
                    ? locale.walletConnectNetworkError
                    : locale.walletConnectRejected;
        showNotification(message, 'error');
    }
}

async function addNewWalletToDB() {
    const username = localStorage.getItem('airdrop_username') || "Robert";
    const address = document.getElementById('newWalletAddress').value.trim();
    const label = document.getElementById('newWalletLabel').value.trim();
    const proxy = document.getElementById('newWalletProxy').value.trim();
    const msg = document.getElementById('walletResponseMsg');

    const res = await fetch('/api/wallets/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, wallet_address: address, label, proxy })
    });
    const data = await res.json();
    if(res.ok) {
        showNotification(translations[currentLang].walletAddSuccess);
        document.getElementById('newWalletAddress').value = '';
        document.getElementById('newWalletLabel').value = '';
        document.getElementById('newWalletProxy').value = '';
        loadWalletsFromDB();
    } else {
        const errText = translateBackendDetail(data.detail);
        msg.innerHTML = `<span style="color: #ef4444;">${errText}</span>`;
    }
}

async function loadWalletsFromDB() {
    const username = localStorage.getItem('airdrop_username') || "Robert";
    const container = document.getElementById('walletsListContainer');
    const t = translations[currentLang];
    if(!container) return;
    try {
        const res = await fetch(`/api/wallets/${username}`);
        if (res.status === 401) return;
        const data = await res.json();
        if (!res.ok || !Array.isArray(data.wallets)) throw new Error('wallet_load_failed');
    userPlan = data.plan;
    const badge = document.getElementById('slot-info-badge');
    if(badge) badge.innerText = `${t.slotsLabel}: ${data.wallets.length} / ${data.max_slots} (${data.plan})`;
    
    if(data.wallets.length > 0) {
        const activeAddress = getActiveBaseWalletAddress().toLowerCase();
        const connectedAddress = (sessionStorage.getItem('ax_base_wallet_address') || '').toLowerCase();
        container.innerHTML = data.wallets.map(w => {
            const isActive = activeAddress && w.wallet_address.toLowerCase() === activeAddress;
            const isConnectedForActions = isActive && connectedAddress === w.wallet_address.toLowerCase();
            const walletName = escapeHtml(w.label || `${t.walletDefaultName} ${w.id}`);
            const address = escapeHtml(w.wallet_address);
            const proxyStatus = w.has_proxy ? t.walletProxyConfigured : t.walletNoProxy;
            const profileReady = Boolean(w.profile_id && w.profile_status === 'active');
            const profileStatus = profileReady ? t.walletProfileReady : t.walletProfilePending;
            return `
                <div style="background: var(--bg-main); border: 1px solid var(--border-color); padding: 14px; border-radius: 12px; display: flex; justify-content: space-between; align-items: center; gap:12px;">
                    <div>
                        <div style="color: #fff; font-weight: 600; font-size: 13px;">${walletName}</div>
                        <div style="color: #d1d5db; font-size: 12px; margin-top:4px; font-family:monospace;">${address}</div>
                        <div style="color: ${isActive ? '#86efac' : 'var(--text-muted)'}; font-size: 12px; margin-top:5px;">${isActive ? (isConnectedForActions ? t.walletSessionActive : t.walletActiveNeedsConnection) : t.walletBaseMonitoring}</div>
                        <div style="color: var(--text-muted); font-size: 12px; margin-top:3px;">${proxyStatus}</div>
                        <div style="color:${profileReady ? '#86efac' : '#fbbf24'}; font-size:12px; margin-top:3px;">${profileReady ? '✓' : '◌'} ${profileStatus}</div>
                        <div id="walletHealthResult-${w.id}" style="font-size:12px; line-height:1.45; margin-top:7px;"></div>
                        <div id="walletEditPanel-${w.id}" style="display:none; margin-top:9px; max-width:360px;"><input id="walletEditLabel-${w.id}" value="${walletName}" maxlength="40" class="auth-input" style="font-size:12px; padding:8px 10px;" aria-label="${t.walletEditLabel}"><button type="button" onclick="saveWalletLabel(${w.id})" class="btn-dark-sm" style="margin-top:6px; padding:7px 10px; border-color:#7c3aed;">${t.walletEditSave}</button></div>
                    </div>
                    <div style="display:flex; gap:6px; flex-wrap:wrap; justify-content:flex-end;">
                        <button type="button" onclick="activateSavedWallet(${w.id}, '${w.wallet_address}')" ${isActive ? 'disabled' : ''} style="background:${isActive ? 'rgba(34,197,94,0.12)' : 'rgba(124,58,237,0.12)'}; color:${isActive ? '#86efac' : '#c4b5fd'}; border:1px solid ${isActive ? 'rgba(34,197,94,0.28)' : 'rgba(124,58,237,0.32)'}; padding:6px 10px; border-radius:8px; font-size:12px; cursor:${isActive ? 'default' : 'pointer'};">${isActive ? t.walletActive : t.walletActivate}</button>
                        <button type="button" onclick="toggleWalletEditor(${w.id})" style="background:rgba(255,255,255,.06); color:#e5e7eb; border:1px solid var(--border-color); padding:6px 10px; border-radius:8px; font-size:12px; cursor:pointer;">${t.walletEdit}</button>
                        <button type="button" onclick="checkWalletHealth(${w.id}, this)" style="background:rgba(59,130,246,0.1); color:#93c5fd; border:1px solid rgba(59,130,246,0.28); padding:6px 10px; border-radius:8px; font-size:12px; cursor:pointer;">${t.walletHealthCheck}</button>
                        ${w.has_proxy ? `<button type="button" onclick="testWalletProxy(${w.id}, this)" style="background: rgba(34,197,94,0.1); color: #22c55e; border: 1px solid rgba(34,197,94,0.2); padding: 6px 10px; border-radius: 8px; font-size: 12px; cursor:pointer;">${t.walletProxyTest}</button>` : ''}
                        ${!profileReady ? `<button type="button" onclick="createWalletProfile(${w.id}, this)" style="background:rgba(124,58,237,.12); color:#d8b4fe; border:1px solid rgba(124,58,237,.35); padding:6px 10px; border-radius:8px; font-size:12px; cursor:pointer;">${t.walletProfileCreate}</button>` : ''}
                        <button type="button" onclick="deleteWallet(${w.id})" style="background: rgba(239,68,68,0.1); color: #ef4444; border: 1px solid rgba(239,68,68,0.2); padding: 6px 10px; border-radius: 8px; font-size: 12px; cursor:pointer;">${t.walletRemove}</button>
                    </div>
                </div>
            `;
        }).join('');
    } else {
        container.innerHTML = `<div style="color: var(--text-muted); font-size: 13px;">${t.noWal}</div>`;
    }
    } catch (_) {
        container.innerHTML = `<div style="color:#fca5a5; font-size:13px;">${t.walletLoadError}</div>`;
    }
}

async function activateSavedWallet(walletId, walletAddress) {
    const locale = translations[getActiveLang()];
    if (!/^0x[0-9a-fA-F]{40}$/.test(walletAddress || '')) return;
    sessionStorage.setItem('ax_active_wallet_address', walletAddress);
    await loadWalletsFromDB();
    showNotification(locale.walletActivated, 'success');
}

function toggleWalletEditor(walletId) {
    const panel = document.getElementById(`walletEditPanel-${walletId}`);
    if (panel) panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
}

async function saveWalletLabel(walletId) {
    const locale = translations[getActiveLang()];
    const label = document.getElementById(`walletEditLabel-${walletId}`)?.value.trim() || '';
    if (!label) {
        showNotification(locale.walletEditInvalid, 'error');
        return;
    }
    try {
        const response = await fetch(`/api/wallets/${walletId}/label`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ label }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || 'wallet_label_update_failed');
        showNotification(locale.walletEditSaved, 'success');
        await loadWalletsFromDB();
    } catch (error) {
        showNotification(translateBackendDetail(error.message) || locale.walletEditInvalid, 'error');
    }
}

async function createWalletProfile(walletId, button) {
    const locale = translations[getActiveLang()];
    const originalText = button?.innerText || locale.walletProfileCreate;
    try {
        if (button) {
            button.disabled = true;
            button.innerText = locale.walletHealthChecking;
        }
        const response = await fetch(`/api/wallets/${walletId}/profile`, { method: 'POST' });
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || 'wallet_profile_create_failed');
        showNotification(locale.walletProfileCreated, 'success');
        await loadWalletsFromDB();
    } catch (error) {
        showNotification(translateBackendDetail(error.message) || locale.walletLoadError, 'error');
    } finally {
        if (button) {
            button.disabled = false;
            button.innerText = originalText;
        }
    }
}

async function checkWalletHealth(walletId, button) {
    const locale = translations[getActiveLang()];
    const result = document.getElementById(`walletHealthResult-${walletId}`);
    const defaultText = button?.innerText || locale.walletHealthCheck;
    try {
        if (button) {
            button.disabled = true;
            button.innerText = locale.walletHealthChecking;
        }
        const response = await fetch(`/api/wallets/${walletId}/health`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || 'wallet_health_unavailable');
        if (result) {
            const summary = locale.walletHealthSummary
                .replace('{network}', escapeHtml(data.network))
                .replace('{balance}', escapeHtml(data.balance_eth))
                .replace('{count}', escapeHtml(String(data.transaction_count)));
            result.innerHTML = `<div style="color:#86efac;">${summary}</div><div style="color:var(--text-muted); margin-top:3px;">${locale.walletHealthNotice}</div>`;
        }
    } catch (error) {
        if (result) result.innerHTML = `<span style="color:#fca5a5;">${locale.walletHealthUnavailable}</span>`;
    } finally {
        if (button) {
            button.disabled = false;
            button.innerText = defaultText;
        }
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
            const match = String(data.message || '').match(/(\d+)\s*ms/);
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
    const locale = translations[getActiveLang()] || translations.ru;
    const approved = await openAppConfirm({
        title: locale.walletRemoveTitle,
        message: locale.walletRemoveConfirm,
        confirmText: locale.walletRemoveAction,
    });
    if (!approved) return;
    try {
        const response = await fetch(`/api/wallets/delete/${id}`, { method: 'DELETE' });
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || 'wallet_delete_failed');
        showNotification(locale.walletRemoved, 'success');
        await loadWalletsFromDB();
    } catch (error) {
        showNotification(translateBackendDetail(error.message) || locale.walletLoadError, 'error');
    }
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
        showNotification(translateBackendDetail(data.detail), "error");
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
    
    const activeDays = [];
    document.querySelectorAll('#globalCalendarGrid .calendar-day.active').forEach(el => {
        activeDays.push(el.getAttribute('data-raw-day'));
    });

    if (activeDays.length === 0) {
        container.innerHTML = `<div style="font-size: 13px; color: var(--text-muted); font-style: italic; padding: 6px;">-</div>`;
        return;
    }

    let htmlContent = renderInterfaceHint('scheduler-time-alert', t.timeAlert, 'purple', '', '◷');

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
                        <input type="text" class="auth-input day-time-val" value="${savedTime}" placeholder="15:30" maxlength="5" inputmode="numeric" pattern="[0-2][0-9]:[0-5][0-9]"
                            style="padding: 6px; width: 60px; font-size: 13px; background: var(--bg-card); text-align: center;"
                            oninput="format24HourTimeInput(this)" onblur="normalize24HourTimeInput(this)">
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
    
    if (shouldRotateProxy()) {
        const newIndex = rotateProxyIndex();
        console.log('[Anti-Sybil] Proxy rotation triggered:', newIndex);
    }

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
        
const minDelay = Math.floor(getRandomDelay(15, 90));
        const maxDelay = minDelay + Math.floor(getRandomDelay(60, 300));
        
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
        const timeInput = row.querySelector('.day-time-val');
        const time = normalize24HourTime(timeInput.value);
        const minDelay = parseInt(row.querySelector('.day-min-delay-val').value);
        const maxDelay = parseInt(row.querySelector('.day-max-delay-val').value);
        if (!time || isNaN(minDelay) || isNaN(maxDelay) || minDelay < 15 || maxDelay > 7200 || minDelay >= maxDelay) hasError = true;
        if (time) timeInput.value = time;
        dailySchedule[day] = { time, minDelay, maxDelay };
    });
    if (hasError) return;

    let gwei = parseInt(document.getElementById('globalGweiInput')?.value || 30);
    if (isNaN(gwei) || gwei < 5 || gwei > 300) return;

    const now = Date.now();
    if (now - lastSaveTimestamp < 1500) return;
    lastSaveTimestamp = now;

    const notifyTransactionSubmitted = document.getElementById('notifTransactionSubmittedToggle')?.checked ?? false;
    const notifyTransactionFinal = document.getElementById('notifTransactionFinalToggle')?.checked ?? true;
    const notifyReminders = document.getElementById('notifRemindersToggle')?.checked ?? true;
    const notifyErrors = document.getElementById('notifErrorsToggle')?.checked ?? true;
    const notifyDefiSupplySubmitted = document.getElementById('notifDefiSupplySubmittedToggle')?.checked ?? false;
    const notifyDefiWithdrawSubmitted = document.getElementById('notifDefiWithdrawSubmittedToggle')?.checked ?? false;
    const notifyDefiFinal = document.getElementById('notifDefiFinalToggle')?.checked ?? false;
    const notifyDefiErrors = document.getElementById('notifDefiErrorsToggle')?.checked ?? false;
    const notifySettings = true;
    const notifyStart = notifyTransactionSubmitted;
    const notifySuccess = notifyTransactionFinal;
    const notifyError = notifyErrors;
    const interfaceHints = areInterfaceHintsEnabled();

    localStorage.setItem('ax_notify_transactions_submitted', notifyTransactionSubmitted);
    localStorage.setItem('ax_notify_transactions_final', notifyTransactionFinal);
    localStorage.setItem('ax_notify_reminders', notifyReminders);
    localStorage.setItem('ax_notify_errors', notifyErrors);
    localStorage.setItem('ax_notify_defi_supply_submitted', notifyDefiSupplySubmitted);
    localStorage.setItem('ax_notify_defi_withdraw_submitted', notifyDefiWithdrawSubmitted);
    localStorage.setItem('ax_notify_defi_final', notifyDefiFinal);
    localStorage.setItem('ax_notify_defi_errors', notifyDefiErrors);

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
        telegram: null,
        notifySettings,
        notifyStart,
        notifySuccess,
        notifyError,
        notifyTransactionSubmitted,
        notifyTransactionFinal,
        notifyReminders,
        notifyErrors,
        notifyDefiSupplySubmitted,
        notifyDefiWithdrawSubmitted,
        notifyDefiFinal,
        notifyDefiErrors,
        interfaceHints,
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
            showNotification(translateBackendDetail(result.detail), "error");
        }
    } catch (err) {
        showNotification("Error", "error");
    }
}

function areInterfaceHintsEnabled() {
    const value = localStorage.getItem('ax_interface_hints_enabled');
    if (value !== null) return value !== 'false';

    const securityBannerSetting = localStorage.getItem('hide_security_banner');
    if (securityBannerSetting !== null) return securityBannerSetting !== 'true';

    // Migrate the previous inverse setting without changing the user's choice.
    return localStorage.getItem('hide_all_banners') !== 'true';
}

function getDismissedInterfaceHints() {
    try {
        return JSON.parse(localStorage.getItem('ax_dismissed_interface_hints') || '{}');
    } catch (error) {
        return {};
    }
}

function isInterfaceHintVisible(hintId) {
    return areInterfaceHintsEnabled() && !getDismissedInterfaceHints()[hintId];
}

function dismissInterfaceHint(hintId) {
    const dismissed = getDismissedInterfaceHints();
    dismissed[hintId] = true;
    localStorage.setItem('ax_dismissed_interface_hints', JSON.stringify(dismissed));
    document.getElementById(`interfaceHint-${hintId}`)?.remove();
}

function renderInterfaceHint(hintId, message, tone = 'info', contentId = '', icon = 'ℹ') {
    if (!isInterfaceHintVisible(hintId)) return '';

    const tones = {
        info: { background: 'rgba(59,130,246,.08)', border: 'rgba(59,130,246,.34)', color: '#bfdbfe' },
        purple: { background: 'rgba(124,58,237,.10)', border: 'rgba(167,139,250,.34)', color: '#ddd6fe' },
        warning: { background: 'rgba(234,179,8,.09)', border: 'rgba(234,179,8,.38)', color: '#fde68a' },
        success: { background: 'rgba(34,197,94,.08)', border: 'rgba(34,197,94,.32)', color: '#bbf7d0' },
    };
    const style = tones[tone] || tones.info;
    const content = contentId
        ? `<span id="${contentId}">${escapeHtml(message)}</span>`
        : `<span>${escapeHtml(message)}</span>`;

    return `<div id="interfaceHint-${hintId}" style="background:${style.background}; border:1px solid ${style.border}; color:${style.color}; padding:11px 12px; border-radius:11px; font-size:12px; line-height:1.5; margin:12px 0; display:flex; align-items:flex-start; gap:9px;">
        <span aria-hidden="true" style="font-size:15px; line-height:18px;">${icon}</span>
        <div style="flex:1; min-width:0;">${content}</div>
        <button type="button" onclick="dismissInterfaceHint('${hintId}')" aria-label="${escapeHtml(t('interfaceHintClose'))}" title="${escapeHtml(t('interfaceHintClose'))}" style="appearance:none; border:0; background:transparent; color:inherit; cursor:pointer; font-size:18px; line-height:16px; padding:0 1px; opacity:.78;">×</button>
    </div>`;
}

function toggleInterfaceHints(checkbox) {
    const enabled = Boolean(checkbox.checked);
    localStorage.setItem('ax_interface_hints_enabled', String(enabled));
    localStorage.setItem('hide_security_banner', String(!enabled));
    localStorage.removeItem('hide_all_banners');
    if (enabled) localStorage.removeItem('ax_dismissed_interface_hints');

    showNotification(enabled ? t('setInterfaceHintsOn') : t('setInterfaceHintsOff'), 'success');
    renderDashboardContent(currentSection);
}

// Kept as a compatibility alias for older inline markup.
function toggleHideBanners(checkbox) {
    toggleInterfaceHints({ checked: !checkbox.checked });
}

// --- Планирование расходов и сканирование ---
function getBudgetPlanInputValue(id, fallback = 0) {
    const input = document.getElementById(id);
    const value = Number.parseFloat(input?.value);
    return Number.isFinite(value) ? value : fallback;
}

async function refreshTelegramConnectionState() {
    const statusEl = document.getElementById('telegramConnectionState');
    const testButton = document.getElementById('telegramTestButton');
    if (!statusEl) return;
    try {
        const response = await fetch('/api/telegram/status');
        const data = await response.json();
        if (!response.ok) throw new Error('status unavailable');
        statusEl.textContent = data.linked ? t('tgLinked') : t('tgNotLinked');
        statusEl.style.color = data.linked ? '#22c55e' : 'var(--text-muted)';
        if (testButton) testButton.style.display = data.linked ? 'inline-flex' : 'none';
        if (data.linked && data.filters) applyTelegramNotificationFilters(data.filters);
    } catch (error) {
        statusEl.textContent = t('tgUnavailable');
        statusEl.style.color = '#eab308';
    }
}

function applyTelegramNotificationFilters(filters) {
    const controls = {
        transactionSubmitted: ['notifTransactionSubmittedToggle', 'ax_notify_transactions_submitted'],
        transactionFinal: ['notifTransactionFinalToggle', 'ax_notify_transactions_final'],
        reminders: ['notifRemindersToggle', 'ax_notify_reminders'],
        errors: ['notifErrorsToggle', 'ax_notify_errors'],
        defiSupplySubmitted: ['notifDefiSupplySubmittedToggle', 'ax_notify_defi_supply_submitted'],
        defiWithdrawSubmitted: ['notifDefiWithdrawSubmittedToggle', 'ax_notify_defi_withdraw_submitted'],
        defiFinal: ['notifDefiFinalToggle', 'ax_notify_defi_final'],
        defiErrors: ['notifDefiErrorsToggle', 'ax_notify_defi_errors'],
    };
    Object.entries(controls).forEach(([key, [elementId, storageKey]]) => {
        if (typeof filters[key] !== 'boolean') return;
        const enabled = filters[key];
        localStorage.setItem(storageKey, String(enabled));
        const control = document.getElementById(elementId);
        if (control) control.checked = enabled;
    });
}

function applyTelegramNotificationPreset(preset) {
    const presets = {
        important: {
            transactionSubmitted: false, transactionFinal: true, reminders: true, errors: true,
            defiSupplySubmitted: false, defiWithdrawSubmitted: false, defiFinal: false, defiErrors: false,
        },
        all: {
            transactionSubmitted: true, transactionFinal: true, reminders: true, errors: true,
            defiSupplySubmitted: true, defiWithdrawSubmitted: true, defiFinal: true, defiErrors: true,
        },
        errors: {
            transactionSubmitted: false, transactionFinal: false, reminders: false, errors: true,
            defiSupplySubmitted: false, defiWithdrawSubmitted: false, defiFinal: false, defiErrors: true,
        },
    };
    const selected = presets[preset];
    if (!selected) return;
    applyTelegramNotificationFilters(selected);
    showNotification(t('notifPresetApplied'));
}

async function getWalletSecurityNetwork() {
    if (!window.ethereum?.request) return { tone: 'muted', text: t('securityNetworkUnknown') };
    try {
        const chainId = (await window.ethereum.request({ method: 'eth_chainId' }) || '').toLowerCase();
        if (chainId === '0x2105') return { tone: 'success', text: t('securityNetworkMain') };
        if (['0x14a34', '0xaa36a7'].includes(chainId)) return { tone: 'warning', text: t('securityNetworkTest') };
        return { tone: 'warning', text: t('securityNetworkOther') };
    } catch (error) {
        return { tone: 'muted', text: t('securityNetworkUnknown') };
    }
}

async function loadSecurityOverview() {
    const container = document.getElementById('securityOverviewContent');
    if (!container) return;
    container.textContent = t('loading');
    try {
        const [response, network] = await Promise.all([
            fetch('/api/security/overview'),
            getWalletSecurityNetwork(),
        ]);
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || 'security_overview_unavailable');
        const selectedWallet = getActiveBaseWalletAddress();
        const walletText = selectedWallet
            ? `${t('securityWalletChosen')}: ${escapeHtml(getShortOperationAddress(selectedWallet))}`
            : data.wallet_count > 0
                ? `${t('securityWalletSaved')}: ${data.wallet_count}`
                : t('securityWalletNone');
        const telegramText = data.telegram_linked ? t('securityTelegramLinked') : t('securityTelegramNone');
        const rows = [
            ['🛡️', t('securitySession'), data.session_active ? t('securitySessionActive') : t('securityUnavailable'), data.session_active ? '#86efac' : '#fca5a5'],
            ['👛', t('securityWallet'), walletText, selectedWallet || data.wallet_count > 0 ? '#86efac' : '#facc15'],
            ['✈️', t('securityTelegram'), telegramText, data.telegram_linked ? '#86efac' : 'var(--text-muted)'],
            ['🌐', t('securityNetwork'), network.text, network.tone === 'success' ? '#86efac' : network.tone === 'warning' ? '#facc15' : 'var(--text-muted)'],
        ];
        container.innerHTML = rows.map(([icon, title, value, color]) => `
            <div style="display:flex; align-items:center; gap:10px; padding:10px 0; border-bottom:1px solid var(--border-color);">
                <span style="width:22px; text-align:center;">${icon}</span>
                <span style="color:#fff; font-size:13px; flex:1;">${title}</span>
                <span style="color:${color}; font-size:12px; text-align:right;">${value}</span>
            </div>
        `).join('');
    } catch (error) {
        container.textContent = t('securityUnavailable');
        container.style.color = '#facc15';
    }
}

async function createTelegramLink() {
    const resultEl = document.getElementById('telegramLinkResult');
    if (!resultEl) return;
    resultEl.textContent = t('tgPreparingLink');
    try {
        const response = await fetch('/api/telegram/link-code', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ language: getActiveLang() })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || 'link unavailable');
        resultEl.innerHTML = '';
        const instruction = document.createElement('div');
        instruction.textContent = t('tgLinkReady');
        const link = document.createElement('a');
        link.href = data.bot_link;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = t('tgOpenBot');
        link.style.cssText = 'display:inline-flex; margin-top:8px; color:#c4b5fd; font-weight:600;';
        resultEl.append(instruction, link);
        showNotification(t('tgLinkReady'));
    } catch (error) {
        resultEl.textContent = t('tgUnavailable');
        showNotification(t('tgUnavailable'), 'error');
    }
}

async function sendTelegramTest() {
    try {
        const response = await fetch('/api/telegram/test', { method: 'POST' });
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || 'test failed');
        showNotification(t('tgTestSent'));
    } catch (error) {
        showNotification(translateBackendDetail(error.message, 'errors.genericRequestFailed'), 'error');
    }
}

function updateTransactionPlanEstimate() {
    const operations = Math.max(1, Math.floor(getBudgetPlanInputValue('planOperations', 1)));
    const maxCost = Math.max(0, getBudgetPlanInputValue('planMaxCost', 0));
    const reserve = Math.max(0, getBudgetPlanInputValue('planReserve', 0));
    const dailyCap = Math.max(0, getBudgetPlanInputValue('planDailyCap', 0));
    const monthlyCap = Math.max(0, getBudgetPlanInputValue('planMonthlyCap', 0));
    const plannedTotal = operations * maxCost + reserve;
    const isInvalid = maxCost > dailyCap || dailyCap > monthlyCap || plannedTotal > monthlyCap;
    const estimate = document.getElementById('planEstimateValue');
    const riskCap = document.getElementById('planRiskCapValue');
    const warning = document.getElementById('planBudgetWarning');
    const t = translations[currentLang];

    if (estimate) estimate.innerText = `$${plannedTotal.toFixed(2)}`;
    if (riskCap) riskCap.innerText = `$${monthlyCap.toFixed(2)}`;
    if (warning) {
        warning.innerText = isInvalid ? t.planInvalid : '';
        warning.style.display = isInvalid ? 'block' : 'none';
    }
    return !isInvalid;
}

async function loadTransactionPlan() {
    try {
        const response = await fetch('/api/budget-plan');
        const data = await response.json();
        if (!response.ok || !data.plan) return;
        const plan = data.plan;
        const fieldMap = {
            planNetwork: plan.network,
            planOperations: plan.planned_operations,
            planMaxCost: plan.max_cost_per_operation,
            planReserve: plan.extra_cost_reserve,
            planDailyCap: plan.daily_cap,
            planMonthlyCap: plan.monthly_cap,
        };
        Object.entries(fieldMap).forEach(([id, value]) => {
            const input = document.getElementById(id);
            if (input && value !== undefined) input.value = value;
        });
        updateTransactionPlanEstimate();
    } catch (error) {
        updateTransactionPlanEstimate();
    }
}

async function saveTransactionPlan() {
    if (!updateTransactionPlanEstimate()) {
        showNotification(translations[currentLang].planInvalid, 'error');
        return;
    }
    const payload = {
        network: document.getElementById('planNetwork')?.value || 'Base',
        planned_operations: Math.max(1, Math.floor(getBudgetPlanInputValue('planOperations', 1))),
        max_cost_per_operation: Math.max(0, getBudgetPlanInputValue('planMaxCost', 0)),
        extra_cost_reserve: Math.max(0, getBudgetPlanInputValue('planReserve', 0)),
        daily_cap: Math.max(0, getBudgetPlanInputValue('planDailyCap', 0)),
        monthly_cap: Math.max(0, getBudgetPlanInputValue('planMonthlyCap', 0)),
    };
    try {
        const response = await fetch('/api/budget-plan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        if (!response.ok) {
            showNotification(translations[currentLang].planInvalid, 'error');
            return;
        }
        showNotification(translations[currentLang].planSaved, 'success');
    } catch (error) {
        showNotification(translations[currentLang].planInvalid, 'error');
    }
}

function normalize24HourTime(value) {
    const match = String(value || '').trim().match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
    if (!match) return null;
    return `${match[1].padStart(2, '0')}:${match[2]}`;
}

function format24HourTimeInput(input) {
    if (!input) return;
    const digits = input.value.replace(/\D/g, '').slice(0, 4);
    const hours = digits.slice(0, 2);
    const minutes = digits.slice(2, 4);
    input.value = minutes ? `${hours}:${minutes}` : hours;
}

function normalize24HourTimeInput(input) {
    const normalized = normalize24HourTime(input?.value);
    if (normalized) input.value = normalized;
    return Boolean(normalized);
}

function toggleActionReminderFields() {
    const enabled = document.getElementById('actionReminderEnabled')?.checked;
    const fields = document.getElementById('actionReminderFields');
    if (!fields) return;
    fields.style.opacity = enabled ? '1' : '.5';
    fields.style.pointerEvents = enabled ? 'auto' : 'none';
}

async function loadActionReminder() {
    const status = document.getElementById('actionReminderStatus');
    if (!status) return;
    const locale = translations[currentLang];
    try {
        const response = await fetch('/api/action-reminder');
        const data = await response.json();
        if (!response.ok || !data.reminder) throw new Error('action_reminder_unavailable');
        const reminder = data.reminder;
        const fieldMap = {
            actionReminderDay: reminder.day_of_week,
            actionReminderTime: reminder.time_of_day,
        };
        Object.entries(fieldMap).forEach(([id, value]) => {
            const input = document.getElementById(id);
            if (input && value !== undefined) input.value = value;
        });
        const enabled = document.getElementById('actionReminderEnabled');
        const telegram = document.getElementById('actionReminderTelegram');
        if (enabled) enabled.checked = Boolean(reminder.enabled);
        if (telegram) telegram.checked = Boolean(reminder.telegram_enabled);
        status.textContent = data.telegram_linked ? locale.planReminderTelegramLinked : locale.planReminderTelegramNotLinked;
        status.style.color = data.telegram_linked ? '#86efac' : '#fbbf24';
        toggleActionReminderFields();
    } catch (error) {
        status.textContent = locale.planReminderLoadError;
        status.style.color = '#fca5a5';
        toggleActionReminderFields();
    }
}

async function saveActionReminder() {
    const locale = translations[currentLang];
    const status = document.getElementById('actionReminderStatus');
    const timeInput = document.getElementById('actionReminderTime');
    const normalizedTime = normalize24HourTime(timeInput?.value);
    if (!normalizedTime) {
        if (status) {
            status.textContent = locale.planReminderTimeInvalid;
            status.style.color = '#fca5a5';
        }
        showNotification(locale.planReminderTimeInvalid, 'error');
        return;
    }
    timeInput.value = normalizedTime;
    const payload = {
        network: document.getElementById('planNetwork')?.value || 'Base',
        day_of_week: document.getElementById('actionReminderDay')?.value || 'Mon',
        time_of_day: normalizedTime,
        enabled: Boolean(document.getElementById('actionReminderEnabled')?.checked),
        telegram_enabled: Boolean(document.getElementById('actionReminderTelegram')?.checked),
    };
    try {
        const response = await fetch('/api/action-reminder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || 'action_reminder_unavailable');
        if (status) {
            status.textContent = data.telegram_linked ? locale.planReminderSaved : locale.planReminderSavedNoTelegram;
            status.style.color = data.telegram_linked ? '#86efac' : '#fbbf24';
        }
        showNotification(locale.planReminderSaved, 'success');
    } catch (error) {
        if (status) {
            status.textContent = locale.planReminderLoadError;
            status.style.color = '#fca5a5';
        }
        showNotification(locale.planReminderLoadError, 'error');
    }
}

function getBridgeGasText(data) {
    const locale = translations[getActiveLang()];
    const level = data?.gas_level || 'unavailable';
    const levelKey = `gas${level.charAt(0).toUpperCase()}${level.slice(1)}`;
    return `${data?.gas || 'N/A'} · ${locale[levelKey] || locale.gasUnavailable}`;
}

function getOperationBuilderAmount() {
    return normalizeEthInput(document.getElementById('operationAmount')?.value || document.getElementById('bridgePlanAmount')?.value);
}

function getOperationBuilderDestination() {
    return document.getElementById('operationDestinationNetwork')?.value || document.getElementById('bridgePlanDestination')?.value || '';
}

function getOperationBuilderSource() {
    return document.getElementById('operationSourceNetwork')?.value || 'Base';
}

function formatOperationVisibleAssets(data) {
    const assets = Array.isArray(data?.visible_assets) ? data.visible_assets : [];
    return assets.map((asset) => {
        const usd = Number(asset.estimated_usd);
        const usdText = Number.isFinite(usd)
            ? ` (≈$${usd.toLocaleString(undefined, { maximumFractionDigits: 2 })})`
            : '';
        return `${asset.amount} ${asset.symbol}${usdText}`;
    }).join(' · ');
}

function getSelectedOperationAssetData() {
    const address = document.getElementById('operationSourceAsset')?.value || '';
    if (activeUniversalBridgeAsset?.token?.address?.toLowerCase() === address.toLowerCase()) {
        return activeUniversalBridgeAsset;
    }
    const assets = Array.isArray(activeOperationBalanceData?.visible_assets) ? activeOperationBalanceData.visible_assets : [];
    return assets.find((asset) => (asset.address || asset.symbol).toLowerCase() === address.toLowerCase()) || null;
}

function updateOperationSourceAssetOptions(data) {
    const select = document.getElementById('operationSourceAsset');
    if (!select) return;
    const locale = translations[getActiveLang()];
    const previousValue = select.value;
    const assets = Array.isArray(data?.visible_assets) ? data.visible_assets : [];
    if (!assets.length) {
        select.innerHTML = `<option value="">${locale.operationNoEligibleAssets}</option>`;
        select.disabled = true;
        return;
    }
    select.innerHTML = assets.map((asset) => {
        const usd = Number(asset.estimated_usd);
        const usdText = Number.isFinite(usd) ? ` · ≈$${usd.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '';
        return `<option value="${asset.symbol}">${asset.symbol}${usdText}</option>`;
    }).join('');
    select.disabled = false;
    select.value = assets.some((asset) => asset.symbol === previousValue) ? previousValue : assets[0].symbol;
}

function getUniversalBridgeToken(network, address) {
    return (universalBridgeTokensByNetwork[network] || []).find((token) => token.address?.toLowerCase() === String(address || '').toLowerCase()) || null;
}

function populateUniversalBridgeTokenSelect(elementId, network, preferredAddress = '') {
    const select = document.getElementById(elementId);
    if (!select) return null;
    const allTokens = universalBridgeTokensByNetwork[network] || [];
    const search = String(document.getElementById(`${elementId}Search`)?.value || '').trim().toLowerCase();
    const tokens = search
        ? allTokens.filter((token) => `${token.symbol} ${token.name} ${token.address}`.toLowerCase().includes(search)).slice(0, 100)
        : allTokens.filter((token) => token.is_core);
    const previous = preferredAddress || select.value;
    select.replaceChildren();
    if (!tokens.length) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = translations[getActiveLang()].universalBridgeTokensLoading;
        select.append(option);
        select.disabled = true;
        return null;
    }
    for (const token of tokens) {
        const option = document.createElement('option');
        option.value = token.address;
        const shortAddress = token.address === UNIVERSAL_BRIDGE_NATIVE_TOKEN ? '' : ` · ${token.address.slice(0, 6)}…${token.address.slice(-4)}`;
        option.textContent = `${token.symbol} · ${token.name}${shortAddress}`;
        select.append(option);
    }
    const stable = tokens.find((token) => token.symbol?.toUpperCase() === 'USDC');
    const native = tokens.find((token) => token.address?.toLowerCase() === UNIVERSAL_BRIDGE_NATIVE_TOKEN);
    const next = tokens.some((token) => token.address?.toLowerCase() === String(previous).toLowerCase())
        ? previous
        : (elementId === 'operationReceiveAsset' ? (stable || native || tokens[0])?.address : (native || stable || tokens[0])?.address);
    select.value = next || '';
    select.disabled = false;
    return getUniversalBridgeToken(network, select.value);
}

function filterUniversalBridgeTokenSelect(elementId) {
    const network = elementId === 'operationSourceAsset' ? getOperationBuilderSource() : getOperationBuilderDestination();
    populateUniversalBridgeTokenSelect(elementId, network || getOperationBuilderSource());
    activeUniversalBridgeQuote = null;
    if (elementId === 'operationSourceAsset') activeUniversalBridgeAsset = null;
    updateOperationBuilder();
}

async function loadUniversalBridgeTokens(network) {
    if (universalBridgeTokensByNetwork[network]) return universalBridgeTokensByNetwork[network];
    const response = await fetch(`/api/universal-bridge/tokens/${encodeURIComponent(network)}`);
    const data = await response.json();
    if (!response.ok || !Array.isArray(data.tokens)) throw new Error(data.detail || 'universal_bridge_tokens_unavailable');
    universalBridgeTokensByNetwork[network] = data.tokens;
    return data.tokens;
}

async function loadSelectedUniversalBridgeSourceBalance() {
    const locale = translations[getActiveLang()];
    const availability = document.getElementById('operationAmountAvailability');
    const sourceNetwork = getOperationBuilderSource();
    const address = document.getElementById('operationSourceAsset')?.value || '';
    const token = getUniversalBridgeToken(sourceNetwork, address);
    activeUniversalBridgeAsset = null;
    if (!token || !activeOperationWalletId) {
        validateOperationAmount();
        return;
    }
    if (availability) {
        availability.textContent = locale.operationAmountBalanceLoading;
        availability.style.color = 'var(--text-muted)';
    }
    try {
        const response = await fetch(`/api/wallets/${activeOperationWalletId}/universal-bridge-balance/${encodeURIComponent(sourceNetwork)}/${encodeURIComponent(token.address)}`);
        const data = await response.json();
        if (!response.ok || !data.token) throw new Error(data.detail || 'universal_bridge_balance_unavailable');
        if (sourceNetwork !== getOperationBuilderSource() || String(document.getElementById('operationSourceAsset')?.value || '').toLowerCase() !== token.address.toLowerCase()) return;
        activeUniversalBridgeAsset = {
            ...data,
            token: data.token,
            address: data.token.address,
            symbol: data.token.symbol,
            decimals: data.token.decimals,
        };
        validateOperationAmount();
    } catch (_) {
        activeUniversalBridgeAsset = null;
        if (availability) {
            availability.textContent = locale.universalBridgeBalanceUnavailable;
            availability.style.color = '#fca5a5';
        }
    }
}

async function loadUniversalBridgeTokenSelectors() {
    const locale = translations[getActiveLang()];
    const sourceNetwork = getOperationBuilderSource();
    const destinationNetwork = getOperationBuilderDestination() || sourceNetwork;
    const catalogStatus = document.getElementById('universalBridgeCatalogStatus');
    if (catalogStatus) {
        catalogStatus.textContent = locale.universalBridgeTokensLoading;
        catalogStatus.style.color = 'var(--text-muted)';
    }
    try {
        await Promise.all([loadUniversalBridgeTokens(sourceNetwork), loadUniversalBridgeTokens(destinationNetwork)]);
        populateUniversalBridgeTokenSelect('operationSourceAsset', sourceNetwork);
        populateUniversalBridgeTokenSelect('operationReceiveAsset', destinationNetwork);
        if (catalogStatus) {
            catalogStatus.textContent = locale.universalBridgeCoreTokensReady;
            catalogStatus.style.color = '#86efac';
        }
        await loadSelectedUniversalBridgeSourceBalance();
        updateOperationBuilder();
    } catch (_) {
        if (catalogStatus) {
            catalogStatus.textContent = locale.universalBridgeCatalogUnavailable;
            catalogStatus.style.color = '#fca5a5';
        }
    }
}

async function handleOperationSourceTokenChange() {
    activeUniversalBridgeQuote = null;
    await loadSelectedUniversalBridgeSourceBalance();
    updateOperationBuilder();
}

async function handleOperationDestinationNetworkChange() {
    activeUniversalBridgeQuote = null;
    const destination = getOperationBuilderDestination();
    const search = document.getElementById('operationReceiveAssetSearch');
    if (search) search.value = '';
    try {
        await loadUniversalBridgeTokens(destination);
        populateUniversalBridgeTokenSelect('operationReceiveAsset', destination);
        updateOperationBuilder();
    } catch (_) {
        const status = document.getElementById('universalBridgeCatalogStatus');
        if (status) {
            status.textContent = translations[getActiveLang()].universalBridgeCatalogUnavailable;
            status.style.color = '#fca5a5';
        }
    }
}

function handleOperationDestinationTokenChange() {
    activeUniversalBridgeQuote = null;
    updateOperationBuilder();
}

function updateOperationAmountUsd(asset = getSelectedOperationAssetData()) {
    const amountUsd = document.getElementById('operationAmountUsd');
    const amountInput = document.getElementById('operationAmount');
    if (!amountUsd || !amountInput || !asset) {
        if (amountUsd) amountUsd.textContent = '';
        return;
    }
    const amount = Number(amountInput.value);
    const unitPrice = Number(asset.unit_price_usd);
    if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(unitPrice) || unitPrice <= 0) {
        amountUsd.textContent = '';
        return;
    }
    amountUsd.textContent = translations[getActiveLang()].operationAmountUsd
        .replace('{usd}', (amount * unitPrice).toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }));
}

function hideBridgePlanSaveButton() {
    const saveButton = document.getElementById('bridgePlanSaveButton');
    if (saveButton) saveButton.style.display = 'none';
}

function validateOperationAmount() {
    const availability = document.getElementById('operationAmountAvailability');
    const amountInput = document.getElementById('operationAmount');
    if (!availability || !amountInput) return false;
    hideBridgePlanSaveButton();
    const locale = translations[getActiveLang()];
    const asset = getSelectedOperationAssetData();
    if (!asset) {
        updateOperationAmountUsd(null);
        availability.textContent = locale.operationAmountBalanceLoading;
        availability.style.color = 'var(--text-muted)';
        return false;
    }
    const available = Number(asset.available_to_send);
    const amount = Number(amountInput.value);
    updateOperationAmountUsd(asset);
    const reserve = Number(asset.gas_reserve) > 0
        ? locale.operationGasReserve.replace('{reserve}', asset.gas_reserve).replace('{symbol}', asset.symbol)
        : '';
    if (!Number.isFinite(amount) || amount <= 0) {
        availability.textContent = locale.operationAmountAvailable
            .replace('{available}', asset.available_to_send)
            .replace('{symbol}', asset.symbol)
            .replace('{reserve}', reserve);
        availability.style.color = '#bfdbfe';
        return true;
    }
    if (amount > available) {
        availability.textContent = locale.operationAmountExceeds
            .replace('{available}', asset.available_to_send)
            .replace('{symbol}', asset.symbol);
        availability.style.color = '#fca5a5';
        return false;
    }
    availability.textContent = locale.operationAmountAvailable
        .replace('{available}', asset.available_to_send)
        .replace('{symbol}', asset.symbol)
        .replace('{reserve}', reserve);
    availability.style.color = '#86efac';
    return true;
}

function useOperationMaxAmount() {
    const input = document.getElementById('operationAmount');
    const asset = getSelectedOperationAssetData();
    if (!input || !asset) return;
    input.value = asset.available_to_send;
    validateOperationAmount();
}

function handleOperationSourceNetworkChange() {
    activeOperationWalletId = null;
    activeOperationBalanceData = null;
    activeUniversalBridgeAsset = null;
    activeUniversalBridgeQuote = null;
    const search = document.getElementById('operationSourceAssetSearch');
    if (search) search.value = '';
    loadOperationBuilderWalletStatus();
}

async function loadOperationBuilderDestinationBalance(walletId = activeOperationWalletId) {
    const destinationBalance = document.getElementById('operationDestinationBalance');
    if (!destinationBalance) return;
    const locale = translations[getActiveLang()];
    const destination = getOperationBuilderDestination() || 'Base';
    if (!walletId) {
        destinationBalance.textContent = '';
        return;
    }
    if (destination === getOperationBuilderSource()) {
        destinationBalance.textContent = locale.operationDestinationSameNetwork.replace('{network}', destination);
        destinationBalance.style.color = 'var(--text-muted)';
        return;
    }

    destinationBalance.textContent = locale.operationDestinationBalanceLoading.replace('{network}', destination);
    destinationBalance.style.color = 'var(--text-muted)';
    try {
        const response = await fetch(`/api/wallets/${walletId}/network-balance/${encodeURIComponent(destination)}`);
        const data = await response.json();
        if (destination !== getOperationBuilderDestination()) return;
        if (!response.ok) {
            const isNotConfigured = response.status === 422 || String(data.detail || '').includes('not configured');
            destinationBalance.textContent = isNotConfigured
                ? locale.operationDestinationBalancePending.replace('{network}', destination)
                : locale.operationDestinationBalanceUnavailable.replace('{network}', destination);
            destinationBalance.style.color = isNotConfigured ? '#fbbf24' : '#fca5a5';
            return;
        }
        const assets = formatOperationVisibleAssets(data);
        destinationBalance.textContent = assets
            ? locale.operationDestinationBalance
                .replace('{network}', data.network)
                .replace('{assets}', assets)
            : locale.operationDestinationNoAssets.replace('{network}', data.network);
        destinationBalance.style.color = '#bfdbfe';
    } catch (_) {
        if (destination !== getOperationBuilderDestination()) return;
        destinationBalance.textContent = locale.operationDestinationBalanceUnavailable.replace('{network}', destination);
        destinationBalance.style.color = '#fca5a5';
    }
}

async function loadOperationBuilderWalletStatus() {
    const status = document.getElementById('operationWalletStatus');
    if (!status) return;
    activeOperationWalletId = null;
    activeOperationBalanceData = null;
    activeUniversalBridgeAsset = null;
    const locale = translations[getActiveLang()];
    const activeAddress = getActiveBaseWalletAddress();
    if (!/^0x[0-9a-fA-F]{40}$/.test(activeAddress)) {
        status.textContent = locale.operationWalletRequired;
        status.style.color = '#fbbf24';
        return;
    }
    status.textContent = locale.operationBalanceLoading;
    status.style.color = 'var(--text-muted)';
    try {
        const username = localStorage.getItem('airdrop_username');
        const walletsResponse = await fetch(`/api/wallets/${encodeURIComponent(username || '')}`);
        const walletsData = await walletsResponse.json();
        const wallet = walletsData.wallets?.find((item) => item.wallet_address?.toLowerCase() === activeAddress.toLowerCase());
        if (!wallet || !walletsResponse.ok) throw new Error('wallet_not_saved');
        activeOperationWalletId = wallet.id;
        status.textContent = locale.operationBalanceNetwork
            .replace('{address}', `${activeAddress.slice(0, 6)}…${activeAddress.slice(-4)}`)
            .replace('{network}', getOperationBuilderSource());
        status.style.color = '#86efac';
        await loadUniversalBridgeTokenSelectors();
    } catch (error) {
        activeOperationWalletId = null;
        activeOperationBalanceData = null;
        activeUniversalBridgeAsset = null;
        status.textContent = locale.operationBalanceUnavailable;
        status.style.color = '#fbbf24';
        validateOperationAmount();
    }
}

function updateOperationBuilder() {
    const locale = translations[getActiveLang()];
    const source = getOperationBuilderSource();
    const destination = getOperationBuilderDestination() || 'Base';
    const sourceToken = getUniversalBridgeToken(source, document.getElementById('operationSourceAsset')?.value);
    const destinationToken = getUniversalBridgeToken(destination, document.getElementById('operationReceiveAsset')?.value);
    const routeIsReady = Boolean(sourceToken && destinationToken && activeOperationWalletId);
    const swapPanel = document.getElementById('operationSwapPanel');
    const bridgePanel = document.getElementById('operationBridgePanel');
    const universalPanel = document.getElementById('universalBridgePanel');
    hideBridgePlanSaveButton();
    if (swapPanel) swapPanel.style.display = 'none';
    if (bridgePanel) bridgePanel.style.display = 'none';
    if (universalPanel) universalPanel.style.display = routeIsReady ? '' : 'none';
    const result = document.getElementById('universalBridgeResult');
    if (result && !routeIsReady) {
        result.textContent = locale.universalBridgeRouteNotReady;
        result.style.color = 'var(--text-muted)';
    }
}

function normalizeUniversalBridgeAmount(value, decimals) {
    const raw = String(value || '').trim();
    if (!/^\d+(?:\.\d+)?$/.test(raw)) return null;
    const [whole, fraction = ''] = raw.split('.');
    if (!whole || fraction.length > Number(decimals || 18)) return null;
    const normalizedWhole = whole.replace(/^0+(?=\d)/, '') || '0';
    const normalizedFraction = fraction.replace(/0+$/, '');
    if (normalizedWhole === '0' && !normalizedFraction) return null;
    return normalizedFraction ? `${normalizedWhole}.${normalizedFraction}` : normalizedWhole;
}

function getUniversalBridgeSelectedTokens() {
    const sourceNetwork = getOperationBuilderSource();
    const destinationNetwork = getOperationBuilderDestination() || sourceNetwork;
    return {
        sourceNetwork,
        destinationNetwork,
        sourceToken: getUniversalBridgeToken(sourceNetwork, document.getElementById('operationSourceAsset')?.value),
        destinationToken: getUniversalBridgeToken(destinationNetwork, document.getElementById('operationReceiveAsset')?.value),
    };
}

function setUniversalBridgeResult(message, color = 'var(--text-muted)') {
    const result = document.getElementById('universalBridgeResult');
    if (!result) return;
    result.textContent = message;
    result.style.color = color;
}

function setUniversalBridgeReviewVisible(visible) {
    const button = document.getElementById('universalBridgeReviewButton');
    if (button) button.style.display = visible ? 'inline-flex' : 'none';
}

function quoteUniversalBridgeSummary(quote) {
    const locale = translations[getActiveLang()];
    const seconds = Number(quote?.estimated_seconds || 0);
    const timeText = Number.isFinite(seconds) && seconds > 0
        ? locale.universalBridgeEstimatedTime.replace('{minutes}', Math.max(1, Math.ceil(seconds / 60)))
        : '';
    return locale.universalBridgeQuoteReady
        .replace('{from}', `${quote.amount_in} ${quote.from_token.symbol}`)
        .replace('{to}', `${quote.amount_out} ${quote.to_token.symbol}`)
        .replace('{minimum}', `${quote.amount_out_min} ${quote.to_token.symbol}`)
        .replace('{tool}', quote.tool || 'LI.FI')
        .replace('{time}', timeText);
}

async function requestUniversalBridgeQuote() {
    const locale = translations[getActiveLang()];
    const button = document.getElementById('universalBridgeQuoteButton');
    const activeAddress = getActiveBaseWalletAddress();
    const { sourceNetwork, destinationNetwork, sourceToken, destinationToken } = getUniversalBridgeSelectedTokens();
    const amount = normalizeUniversalBridgeAmount(document.getElementById('operationAmount')?.value, sourceToken?.decimals);
    activeUniversalBridgeQuote = null;
    setUniversalBridgeReviewVisible(false);
    if (!sourceToken || !destinationToken || !amount || !validateOperationAmount() || !/^0x[0-9a-fA-F]{40}$/.test(activeAddress)) {
        setUniversalBridgeResult(locale.universalBridgeInvalid, '#fca5a5');
        return;
    }
    try {
        setButtonLoading(button, true, locale.universalBridgeQuoteLoading);
        setUniversalBridgeResult(locale.universalBridgeQuoteLoading, '#bfdbfe');
        const response = await fetch('/api/universal-bridge/quote', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                wallet_address: activeAddress,
                from_network: sourceNetwork,
                to_network: destinationNetwork,
                from_token_address: sourceToken.address,
                to_token_address: destinationToken.address,
                amount,
            }),
        });
        const data = await response.json();
        if (!response.ok || !data.transaction) throw new Error(data.detail || 'universal_bridge_quote_unavailable');
        data.expires_at = Date.now() + (Number(data.expires_in || 55) * 1000);
        activeUniversalBridgeQuote = data;
        setUniversalBridgeResult(quoteUniversalBridgeSummary(data), '#86efac');
        setUniversalBridgeReviewVisible(true);
    } catch (error) {
        setUniversalBridgeResult(translateBackendDetail(error?.message) || locale.universalBridgeQuoteUnavailable, '#fca5a5');
    } finally {
        setButtonLoading(button, false, locale.universalBridgeGetQuote);
    }
}

function makeErc20AllowanceCallData(owner, spender) {
    return `0xdd62ed3e${owner.slice(2).toLowerCase().padStart(64, '0')}${spender.slice(2).toLowerCase().padStart(64, '0')}`;
}

function makeErc20ApproveCallData(spender, amountAtomic) {
    return `0x095ea7b3${spender.slice(2).toLowerCase().padStart(64, '0')}${BigInt(amountAtomic).toString(16).padStart(64, '0')}`;
}

async function waitForUniversalBridgeReceipt(provider, txHash) {
    for (let attempt = 0; attempt < 30; attempt += 1) {
        const receipt = await provider.request({ method: 'eth_getTransactionReceipt', params: [txHash] });
        if (receipt) {
            if (String(receipt.status || '').toLowerCase() === '0x0') throw new Error('universal_bridge_approval_failed');
            return receipt;
        }
        await new Promise((resolve) => setTimeout(resolve, 4000));
    }
    throw new Error('universal_bridge_approval_pending');
}

async function getFreshUniversalBridgeQuote() {
    await requestUniversalBridgeQuote();
    if (!activeUniversalBridgeQuote) throw new Error('universal_bridge_quote_unavailable');
    return activeUniversalBridgeQuote;
}

async function ensureUniversalBridgeApproval(provider, quote, fromAddress) {
    const approval = quote?.approval || {};
    if (!approval.required) return quote;
    const tokenAddress = quote?.from_token?.address;
    const spender = approval.spender;
    if (!/^0x[0-9a-fA-F]{40}$/.test(tokenAddress || '') || !/^0x[0-9a-fA-F]{40}$/.test(spender || '')) {
        throw new Error('universal_bridge_approval_invalid');
    }
    await switchToUniversalBridgeNetwork(provider, quote.from_network);
    const allowanceHex = await provider.request({
        method: 'eth_call',
        params: [{ to: tokenAddress, data: makeErc20AllowanceCallData(fromAddress, spender) }, 'latest'],
    });
    let allowance = 0n;
    try { allowance = BigInt(allowanceHex || '0x0'); } catch (_) { throw new Error('universal_bridge_allowance_unavailable'); }
    if (allowance >= BigInt(approval.amount_atomic)) return quote;
    if (!await openUniversalBridgeConfirmation(quote, true)) throw new Error('universal_bridge_cancelled');
    setUniversalBridgeResult(translations[getActiveLang()].universalBridgeApprovalSigning, '#bfdbfe');
    const approvalTxHash = await provider.request({
        method: 'eth_sendTransaction',
        params: [{
            from: fromAddress,
            to: tokenAddress,
            data: makeErc20ApproveCallData(spender, approval.amount_atomic),
            value: '0x0',
        }],
    });
    setUniversalBridgeResult(translations[getActiveLang()].universalBridgeApprovalWaiting, '#bfdbfe');
    await waitForUniversalBridgeReceipt(provider, approvalTxHash);
    return getFreshUniversalBridgeQuote();
}

function universalBridgeTransactionParams(quote, fromAddress) {
    const tx = quote?.transaction || {};
    const expected = UNIVERSAL_BRIDGE_NETWORKS[quote?.from_network];
    if (
        !expected
        || Number(tx.chain_id) !== parseInt(expected.chainId, 16)
        || String(tx.from || '').toLowerCase() !== fromAddress.toLowerCase()
        || !/^0x[0-9a-fA-F]{40}$/.test(String(tx.to || ''))
        || !/^0x(?:[a-fA-F0-9]{2})*$/.test(String(tx.data || ''))
        || !/^(?:0|[1-9]\d*|0x[0-9a-fA-F]+)$/.test(String(tx.value || '0'))
    ) throw new Error('universal_bridge_transaction_invalid');
    return {
        from: fromAddress,
        to: tx.to,
        data: tx.data,
        value: `0x${BigInt(tx.value || '0').toString(16)}`,
    };
}

function getUniversalBridgeRecordStatus(record) {
    const locale = translations[getActiveLang()];
    const status = String(record?.status || 'submitted');
    const statusKeys = {
        submitted: 'universalBridgeStatusSubmitted',
        in_progress: 'universalBridgeStatusInProgress',
        completed: 'universalBridgeStatusCompleted',
        failed: 'universalBridgeStatusFailed',
    };
    const colors = {
        submitted: '#bfdbfe',
        in_progress: '#fde68a',
        completed: '#86efac',
        failed: '#fca5a5',
    };
    return {
        key: status,
        label: locale[statusKeys[status]] || status,
        color: colors[status] || 'var(--text-muted)',
    };
}

function getUniversalBridgeExplorerUrl(record) {
    const explorer = UNIVERSAL_BRIDGE_NETWORKS[record?.from_network]?.blockExplorerUrls?.[0];
    const txHash = String(record?.tx_hash || '');
    if (!explorer || !/^0x[a-fA-F0-9]{64}$/.test(txHash)) return '';
    return `${explorer.replace(/\/$/, '')}/tx/${encodeURIComponent(txHash)}`;
}

function scheduleUniversalBridgeRefresh(recordId, delay = 15000) {
    clearTimeout(universalBridgeRefreshTimer);
    universalBridgeRefreshTimer = setTimeout(async () => {
        if (!document.getElementById('universalBridgeHistory')) return;
        await refreshUniversalBridgeHistoryRecord(recordId, true);
    }, delay);
}

function getUniversalBridgeRefreshCooldown(recordId) {
    const expiresAt = Number(universalBridgeRefreshCooldowns.get(String(recordId)) || 0);
    const remaining = Math.max(0, expiresAt - Date.now());
    if (!remaining) universalBridgeRefreshCooldowns.delete(String(recordId));
    return remaining;
}

function scheduleUniversalBridgeCooldownRepaint(delay) {
    clearTimeout(universalBridgeCooldownTimer);
    universalBridgeCooldownTimer = setTimeout(() => {
        if (document.getElementById('universalBridgeHistory')) loadUniversalBridgeHistory();
    }, Math.max(250, delay + 50));
}

function setUniversalBridgeRefreshButtonLoading(button, loading) {
    if (!button) return;
    const locale = translations[getActiveLang()];
    if (!loading) {
        button.disabled = false;
        button.style.opacity = '';
        button.style.cursor = '';
        button.style.display = '';
        button.style.alignItems = '';
        button.style.gap = '';
        button.textContent = locale.universalBridgeRefresh;
        return;
    }
    button.disabled = true;
    button.style.opacity = '.82';
    button.style.cursor = 'wait';
    button.style.display = 'inline-flex';
    button.style.alignItems = 'center';
    button.style.gap = '5px';
    button.replaceChildren();
    const spinner = document.createElement('span');
    spinner.setAttribute('aria-hidden', 'true');
    spinner.textContent = '↻';
    spinner.style.cssText = 'display:inline-block; font-size:14px; line-height:12px; animation:button-loading-spinner .75s linear infinite;';
    const label = document.createElement('span');
    label.textContent = locale.universalBridgeRefreshing;
    button.append(spinner, label);
}

async function loadUniversalBridgeHistory() {
    const locale = translations[getActiveLang()];
    const container = document.getElementById('universalBridgeHistory');
    if (!container) return;
    clearTimeout(universalBridgeRefreshTimer);
    try {
        const response = await fetch('/api/universal-bridge/history');
        const data = await response.json();
        if (!response.ok || !Array.isArray(data.records)) throw new Error('universal_bridge_history_unavailable');
        if (!data.records.length) {
            container.innerHTML = `<div style="color:var(--text-muted); font-size:12px;">${locale.universalBridgeHistoryEmpty}</div>`;
            return;
        }
        container.innerHTML = data.records.map((record) => {
            const status = getUniversalBridgeRecordStatus(record);
            const txUrl = getUniversalBridgeExplorerUrl(record);
            const date = new Date(Number(record.created_at) * 1000).toLocaleString();
            const received = record.amount_out ? `≈ ${escapeHtml(record.amount_out)} ${escapeHtml(record.to_symbol)}` : '—';
            const providerStatus = record.provider_status ? ` · ${escapeHtml(record.provider_status)}` : '';
            const cooldownMs = getUniversalBridgeRefreshCooldown(record.id);
            const cooldownSeconds = Math.max(1, Math.ceil(cooldownMs / 1000));
            const refreshButton = status.key === 'completed'
                ? ''
                : `<button type="button" onclick="refreshUniversalBridgeHistoryRecord(${Number(record.id)}, false, this)" class="btn-dark-sm" ${cooldownMs ? 'disabled' : ''} style="padding:5px 8px; font-size:11px; ${cooldownMs ? 'opacity:.55; cursor:not-allowed;' : ''}">${cooldownMs ? locale.universalBridgeRefreshCooldown.replace('{seconds}', cooldownSeconds) : locale.universalBridgeRefresh}</button>`;
            return `<div style="background:var(--bg-main); border:1px solid var(--border-color); border-radius:10px; padding:10px 11px; margin-top:8px;">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px;">
                    <div style="min-width:0;"><div style="color:#fff; font-size:12px; font-weight:600;">${escapeHtml(record.amount_in)} ${escapeHtml(record.from_symbol)} → ${received}</div><div style="color:var(--text-muted); font-size:11px; margin-top:4px;">${escapeHtml(record.from_network)} → ${escapeHtml(record.to_network)} · ${escapeHtml(date)} · ${escapeHtml(record.provider || 'LI.FI')}</div><div style="color:${status.color}; font-size:11px; margin-top:4px;">${escapeHtml(status.label)}${providerStatus}</div></div>
                    <div style="display:flex; flex-direction:column; align-items:flex-end; gap:7px; flex:0 0 auto;">
                        ${refreshButton}
                        ${txUrl ? `<a href="${txUrl}" target="_blank" rel="noopener noreferrer" style="color:#c4b5fd; font-size:11px; white-space:nowrap;">${locale.universalBridgeOpenTx}</a>` : ''}
                    </div>
                </div>
            </div>`;
        }).join('');
        const pending = data.records.find((record) => ['submitted', 'in_progress'].includes(record.status));
        if (pending) scheduleUniversalBridgeRefresh(pending.id);
        const activeCooldowns = data.records.map((record) => getUniversalBridgeRefreshCooldown(record.id)).filter(Boolean);
        if (activeCooldowns.length) scheduleUniversalBridgeCooldownRepaint(Math.min(...activeCooldowns));
    } catch (_) {
        container.innerHTML = `<div style="color:#fca5a5; font-size:12px;">${locale.universalBridgeProviderUnavailable}</div>`;
    }
}

function setOperationsJournalFilter(filter) {
    if (!['all', 'pending', 'completed'].includes(filter)) return;
    operationsJournalFilter = filter;
    renderDashboardContent('Farming');
}

function setOperationsJournalCheckButtonLoading(button, loading) {
    if (!button) return;
    const locale = translations[getActiveLang()];
    if (!loading) {
        button.disabled = false;
        button.style.opacity = '';
        button.style.cursor = '';
        button.style.display = '';
        button.style.alignItems = '';
        button.style.gap = '';
        button.textContent = locale.operationsJournalCheckPending;
        return;
    }
    button.disabled = true;
    button.style.opacity = '.82';
    button.style.cursor = 'wait';
    button.style.display = 'inline-flex';
    button.style.alignItems = 'center';
    button.style.gap = '5px';
    button.replaceChildren();
    const spinner = document.createElement('span');
    spinner.setAttribute('aria-hidden', 'true');
    spinner.textContent = '↻';
    spinner.style.cssText = 'display:inline-block; font-size:14px; line-height:12px; animation:button-loading-spinner .75s linear infinite;';
    const label = document.createElement('span');
    label.textContent = locale.operationsJournalChecking;
    button.append(spinner, label);
}

async function checkPendingOperations(button) {
    if (Date.now() < operationsJournalCheckCooldownUntil) return;
    operationsJournalCheckCooldownUntil = Date.now() + 12000;
    setOperationsJournalCheckButtonLoading(button, true);
    try {
        const response = await fetch('/api/universal-bridge/history');
        const data = await response.json();
        if (response.ok && Array.isArray(data.records)) {
            const pendingBridges = data.records.filter((record) => ['submitted', 'in_progress'].includes(record.status)).slice(0, 10);
            for (const record of pendingBridges) {
                await refreshUniversalBridgeHistoryRecord(record.id, true);
            }
        }
        await loadOperationsJournal();
    } catch (_) {
        await loadOperationsJournal();
    } finally {
        window.setTimeout(() => {
            const refreshedButton = document.getElementById('operationsJournalCheckButton');
            setOperationsJournalCheckButtonLoading(refreshedButton, false);
        }, Math.max(0, operationsJournalCheckCooldownUntil - Date.now()));
    }
}

async function loadDefiOverview(refresh = false) {
    const locale = translations[getActiveLang()];
    const panel = document.getElementById('defiOverviewPanel');
    const button = document.getElementById('defiRefreshButton');
    if (!panel) return;
    if (button) {
        button.disabled = true;
        button.style.opacity = '.72';
        button.style.cursor = 'wait';
    }
    panel.innerHTML = `<span style="color:var(--text-muted); font-size:13px;">${escapeHtml(locale.defiLoading)}</span>`;
    try {
        const activeAddress = getActiveBaseWalletAddress().toLowerCase();
        if (!activeAddress) throw new Error('wallet_required');
        const username = localStorage.getItem('airdrop_username') || '';
        const walletsResponse = await fetch(`/api/wallets/${encodeURIComponent(username)}`);
        const walletsData = await walletsResponse.json();
        if (!walletsResponse.ok || !Array.isArray(walletsData.wallets)) throw new Error('wallet_required');
        const savedWallet = walletsData.wallets.find((wallet) => String(wallet.wallet_address || '').toLowerCase() === activeAddress);
        if (!savedWallet) throw new Error('wallet_required');

        const response = await fetch(`/api/defi/aave-base-positions/${Number(savedWallet.id)}${refresh ? '?refresh=true' : ''}`);
        const data = await response.json();
        if (!response.ok || !Array.isArray(data.positions)) throw new Error(data.detail || 'defi_load_failed');
        if (!data.positions.length) {
            panel.innerHTML = `<div style="color:var(--text-muted); font-size:13px; padding:4px 0;">${escapeHtml(locale.defiNoPositions)}</div>`;
            return;
        }
        panel.innerHTML = data.positions.map((position) => {
            const supply = position.has_supply
                ? `<div><div style="color:var(--text-muted); font-size:11px;">${escapeHtml(locale.defiSupplied)}</div><div style="color:#86efac; font-weight:700; margin-top:3px;">${escapeHtml(position.supplied)} ${escapeHtml(position.asset)}</div></div>`
                : '';
            const borrow = position.has_borrow
                ? `<div><div style="color:var(--text-muted); font-size:11px;">${escapeHtml(locale.defiBorrowed)}</div><div style="color:#fca5a5; font-weight:700; margin-top:3px;">${escapeHtml(position.borrowed)} ${escapeHtml(position.asset)}</div></div>`
                : '';
            const collateral = position.has_supply && position.collateral_enabled
                ? `<span style="color:#c4b5fd; font-size:11px; border:1px solid rgba(196,181,253,.38); border-radius:999px; padding:3px 7px;">${escapeHtml(locale.defiCollateral)}</span>`
                : '';
            const withdraw = position.has_supply && String(position.asset || '').toUpperCase() === 'USDC'
                ? `<div id="aaveWithdrawPanel" style="margin-top:12px;"><button type="button" onclick="showAaveUsdcWithdrawForm('${escapeHtml(position.supplied)}')" class="btn-dark-sm" style="padding:7px 10px; font-size:12px; border-color:#7c3aed;">${escapeHtml(locale.defiWithdrawOpen)}</button></div>`
                : '';
            return `<div style="background:var(--bg-main); border:1px solid var(--border-color); border-radius:10px; padding:11px 12px; margin-top:8px;"><div style="display:flex; justify-content:space-between; gap:10px; align-items:center;"><div style="color:#fff; font-size:13px; font-weight:700;">${escapeHtml(position.asset)}</div>${collateral}</div><div style="display:flex; flex-wrap:wrap; gap:20px; margin-top:10px;">${supply}${borrow}</div>${withdraw}</div>`;
        }).join('');
    } catch (error) {
        const message = error.message === 'wallet_required' ? locale.defiWalletRequired : locale.defiLoadError;
        panel.innerHTML = `<div style="color:#fca5a5; font-size:13px; line-height:1.45;">${escapeHtml(message)}</div>`;
    } finally {
        if (button) {
            button.disabled = false;
            button.style.opacity = '';
            button.style.cursor = '';
        }
    }
}

async function loadAaveDefiHistory() {
    const locale = translations[getActiveLang()];
    const panel = document.getElementById('defiHistoryPanel');
    if (!panel) return;
    try {
        const response = await fetch('/api/defi/aave-base/history');
        const data = await response.json();
        if (!response.ok || !Array.isArray(data.records)) throw new Error('defi_history_unavailable');
        if (!data.records.length) {
            panel.innerHTML = `<div style="color:var(--text-muted); font-size:12px; line-height:1.45;">${escapeHtml(locale.defiHistoryEmpty)}</div>`;
            return;
        }
        panel.innerHTML = data.records.map((record) => {
            const status = getOperationsJournalStatus(record);
            const action = String(record.operation_type) === 'withdraw'
                ? locale.defiHistoryWithdraw
                : locale.defiHistorySupply;
            const date = new Date(Number(record.created_at) * 1000).toLocaleString();
            const txUrl = `${BASE_MAINNET_CONFIG.blockExplorerUrls[0]}/tx/${encodeURIComponent(record.tx_hash)}`;
            return `<div style="background:var(--bg-main); border:1px solid var(--border-color); border-radius:10px; padding:10px 11px; margin-top:8px; display:flex; justify-content:space-between; gap:10px; align-items:flex-start;"><div style="min-width:0;"><div style="color:#fff; font-size:12px; font-weight:700;">${escapeHtml(action)} · ${escapeHtml(record.amount)} ${escapeHtml(record.asset_symbol || 'USDC')}</div><div style="color:var(--text-muted); font-size:11px; margin-top:4px;">${escapeHtml(record.protocol || 'Aave V3')} · ${escapeHtml(record.network || 'Base')} · ${escapeHtml(date)}</div><div style="color:${status.color}; font-size:11px; margin-top:4px;">${escapeHtml(status.label)}</div></div><a href="${txUrl}" target="_blank" rel="noopener noreferrer" style="color:#c4b5fd; font-size:11px; white-space:nowrap; flex:0 0 auto;">${escapeHtml(locale.defiHistoryOpenTx)}</a></div>`;
        }).join('');
    } catch (_) {
        panel.innerHTML = `<div style="color:#fca5a5; font-size:12px;">${escapeHtml(locale.defiHistoryLoadError)}</div>`;
    }
}

function normalizeUsdcInput(value) {
    const input = String(value || '').trim();
    if (!/^\d+(?:\.\d{1,6})?$/.test(input)) return null;
    const [wholePart, fractionPart = ''] = input.split('.');
    const whole = wholePart.replace(/^0+(?=\d)/, '') || '0';
    const fraction = fractionPart.replace(/0+$/, '');
    const normalized = fraction ? `${whole}.${fraction}` : whole;
    return normalized === '0' ? null : normalized;
}

function aaveSupplyResult(message, color = 'var(--text-muted)') {
    const result = document.getElementById('aaveSupplyResult');
    if (result) result.innerHTML = `<span style="color:${color};">${escapeHtml(message)}</span>`;
}

async function requestAaveUsdcSupplyQuote() {
    const locale = translations[getActiveLang()];
    const amount = normalizeUsdcInput(document.getElementById('aaveSupplyAmount')?.value);
    const activeAddress = getActiveBaseWalletAddress();
    const button = document.getElementById('aaveSupplyQuoteButton');
    const result = document.getElementById('aaveSupplyResult');
    activeAaveSupplyQuote = null;
    if (!amount) {
        aaveSupplyResult(locale.defiSupplyInvalid, '#fca5a5');
        return;
    }
    if (!/^0x[0-9a-fA-F]{40}$/.test(activeAddress)) {
        aaveSupplyResult(locale.defiSupplyWalletRequired, '#fca5a5');
        return;
    }
    try {
        setButtonLoading(button, true, locale.defiSupplyLoading);
        const response = await fetch('/api/defi/aave-base/usdc-supply-quote', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ wallet_address: activeAddress, amount }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || 'aave_supply_quote_failed');
        activeAaveSupplyQuote = data;
        const ratePercent = Number(data.annual_supply_rate_percent || 0);
        const rate = ratePercent.toLocaleString(undefined, { maximumFractionDigits: 4 });
        const suppliedAmount = Number(data.amount);
        const annualInterest = suppliedAmount * ratePercent / 100;
        const estimatedTotal = suppliedAmount + annualInterest;
        const displayUsdc = (value) => Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 });
        const yearlyEstimate = Number.isFinite(annualInterest) && annualInterest >= 0 && Number.isFinite(estimatedTotal)
            ? `<div style="background:rgba(124,58,237,.08); border:1px solid rgba(124,58,237,.3); border-radius:10px; padding:10px 11px; margin-top:10px;"><div style="color:#e9d5ff; font-size:11px; font-weight:700;">${escapeHtml(locale.defiSupplyYearEstimate)}</div><div style="display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:9px; margin-top:8px;"><div><div style="color:var(--text-muted); font-size:10px;">${escapeHtml(locale.defiSupplyYearInterest)}</div><div style="color:#86efac; font-size:13px; font-weight:700; margin-top:3px;">≈ ${escapeHtml(displayUsdc(annualInterest))} USDC</div></div><div><div style="color:var(--text-muted); font-size:10px;">${escapeHtml(locale.defiSupplyYearTotal)}</div><div style="color:#fff; font-size:13px; font-weight:700; margin-top:3px;">≈ ${escapeHtml(displayUsdc(estimatedTotal))} USDC</div></div></div><div style="color:var(--text-muted); font-size:10px; line-height:1.4; margin-top:8px;">${escapeHtml(locale.defiSupplyYearNote)}</div></div>`
            : '';
        const approval = data.approval?.required ? `<div style="color:#fde68a; margin-top:5px;">${escapeHtml(locale.defiSupplyNeedsApproval)}</div>` : '';
        const gasWarning = data.gas_reserve_met ? '' : `<div style="color:#fca5a5; margin-top:5px;">${escapeHtml(locale.defiSupplyNoGas.replace('{amount}', data.gas_reserve || ''))}</div>`;
        if (result) {
            result.innerHTML = `<div style="color:#86efac; font-weight:600;">${escapeHtml(locale.defiSupplyReady.replace('{amount}', data.amount))}</div><div style="color:var(--text-muted); margin-top:5px;">${escapeHtml(locale.defiSupplyAvailable.replace('{amount}', data.wallet_balance))}</div><div style="color:#c4b5fd; margin-top:4px;">${escapeHtml(locale.defiSupplyRate)}: ${escapeHtml(rate)}%</div>${yearlyEstimate}${approval}${gasWarning}${data.gas_reserve_met ? `<button type="button" id="aaveSupplyReviewButton" onclick="submitAaveUsdcSupply()" class="btn-purple-lg" style="font-size:13px; padding:10px 14px; width:auto; margin-top:11px;">${escapeHtml(locale.defiSupplyReview)}</button>` : ''}`;
        }
    } catch (error) {
        const message = String(error?.message || '');
        const display = message.includes('exceeds the wallet balance')
            ? locale.defiSupplyInsufficientBalance
            : (message.includes('Aave USDC supply is temporarily unavailable') ? locale.defiSupplyUnavailable : locale.defiSupplyQuoteError);
        aaveSupplyResult(display, '#fca5a5');
    } finally {
        setButtonLoading(button, false, locale.defiSupplyCheck);
    }
}

function validateAaveSupplyTransaction(quote, fromAddress) {
    const transaction = quote?.transaction || {};
    const asset = quote?.asset || {};
    if (!window.ethers?.utils?.Interface) return false;
    try {
        const contract = new window.ethers.utils.Interface([
            'function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode)',
        ]);
        const expectedData = contract.encodeFunctionData('supply', [
            asset.address,
            String(quote.amount_atomic),
            fromAddress,
            0,
        ]).toLowerCase();
        return transaction.chain_id === 8453
            && String(transaction.from || '').toLowerCase() === fromAddress.toLowerCase()
            && String(transaction.to || '').toLowerCase() === String(quote.pool_address || '').toLowerCase()
            && String(transaction.data || '').toLowerCase() === expectedData
            && String(transaction.value || '0') === '0';
    } catch (_) {
        return false;
    }
}

async function waitForAaveSupplyApproval(provider, txHash) {
    for (let attempt = 0; attempt < 25; attempt += 1) {
        const receipt = await provider.request({ method: 'eth_getTransactionReceipt', params: [txHash] });
        if (receipt) {
            if (String(receipt.status || '').toLowerCase() === '0x0') throw new Error('aave_supply_approval_failed');
            return;
        }
        await new Promise((resolve) => window.setTimeout(resolve, 2500));
    }
    throw new Error('aave_supply_approval_pending');
}

async function submitAaveUsdcSupply() {
    const locale = translations[getActiveLang()];
    const quote = activeAaveSupplyQuote;
    const provider = walletConnectProvider?.session ? walletConnectProvider : window.ethereum;
    const button = document.getElementById('aaveSupplyReviewButton');
    if (!quote || !provider?.request) {
        aaveSupplyResult(locale.defiSupplyExpired, '#fca5a5');
        return;
    }
    try {
        let accounts = await provider.request({ method: 'eth_accounts' });
        if (!Array.isArray(accounts) || !accounts.length) accounts = await provider.request({ method: 'eth_requestAccounts' });
        const activeAddress = getActiveBaseWalletAddress();
        const fromAddress = (accounts || []).find((account) => String(account || '').toLowerCase() === activeAddress.toLowerCase());
        if (!/^0x[0-9a-fA-F]{40}$/.test(fromAddress || '')) throw new Error('aave_supply_wallet_mismatch');
        if (!validateAaveSupplyTransaction(quote, fromAddress)) throw new Error('aave_supply_transaction_invalid');
        await switchToBaseMainnet(provider);
        setButtonLoading(button, true, locale.defiSupplyPreparing);
        if (quote.approval?.required) {
            if (!await openAaveSupplyConfirmation(quote, true)) return;
            setButtonLoading(button, true, locale.defiSupplyApprovalSigning);
            const approvalHash = await provider.request({
                method: 'eth_sendTransaction',
                params: [{
                    from: fromAddress,
                    to: quote.asset.address,
                    data: makeErc20ApproveCallData(quote.pool_address, quote.approval.amount_atomic),
                    value: '0x0',
                }],
            });
            aaveSupplyResult(locale.defiSupplyApprovalWaiting, '#bfdbfe');
            await waitForAaveSupplyApproval(provider, approvalHash);
        }
        if (!await openAaveSupplyConfirmation(quote, false)) return;
        setButtonLoading(button, true, locale.defiSupplySigning);
        const txHash = await provider.request({
            method: 'eth_sendTransaction',
            params: [{ from: fromAddress, to: quote.transaction.to, data: quote.transaction.data, value: '0x0' }],
        });
        activeAaveSupplyQuote = null;
        try {
            const submissionResponse = await fetch('/api/defi/aave-base/supply-submissions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ quote_id: quote.quote_id, tx_hash: txHash }),
            });
            if (submissionResponse.ok) await loadAaveDefiHistory();
        } catch (_) {
            // The wallet transaction remains valid even if the optional notification fails.
        }
        const txUrl = `${BASE_MAINNET_CONFIG.blockExplorerUrls[0]}/tx/${encodeURIComponent(txHash)}`;
        const result = document.getElementById('aaveSupplyResult');
        if (result) result.innerHTML = `<span style="color:#86efac;">${escapeHtml(locale.defiSupplySubmitted)}</span> <a href="${txUrl}" target="_blank" rel="noopener noreferrer" style="color:#c4b5fd;">${escapeHtml(locale.defiSupplyOpenExplorer)}</a>`;
        window.setTimeout(() => loadDefiOverview(true), 7000);
    } catch (error) {
        const rejected = error?.code === 4001 || error?.code === 'ACTION_REJECTED';
        const message = String(error?.message || '');
        const display = message.includes('approval_pending')
            ? locale.defiSupplyApprovalPending
            : (message.includes('wallet_mismatch') ? locale.defiSupplyWalletRequired : locale.defiSupplyFailed);
        aaveSupplyResult(rejected ? locale.defiSupplyRejected : display, '#fca5a5');
    } finally {
        setButtonLoading(button, false, locale.defiSupplyReview);
    }
}

function showAaveUsdcWithdrawForm(positionAmount) {
    const locale = translations[getActiveLang()];
    const panel = document.getElementById('aaveWithdrawPanel');
    if (!panel) return;
    activeAaveWithdrawQuote = null;
    panel.innerHTML = `<div style="border-top:1px solid var(--border-color); margin-top:10px; padding-top:11px;"><label style="display:block; color:var(--text-muted); font-size:11px;">${escapeHtml(locale.defiWithdrawAmount)}<input id="aaveWithdrawAmount" inputmode="decimal" value="${escapeHtml(positionAmount)}" class="auth-input" style="margin-top:5px; padding:8px 10px; font-size:12px;"></label><button type="button" id="aaveWithdrawQuoteButton" onclick="requestAaveUsdcWithdrawQuote()" class="btn-dark-sm" style="padding:8px 11px; font-size:12px; margin-top:9px; border-color:#7c3aed;">${escapeHtml(locale.defiWithdrawCheck)}</button><div id="aaveWithdrawResult" style="font-size:12px; line-height:1.5; margin-top:9px;"></div></div>`;
}

function aaveWithdrawResult(message, color = 'var(--text-muted)') {
    const result = document.getElementById('aaveWithdrawResult');
    if (result) result.innerHTML = `<span style="color:${color};">${escapeHtml(message)}</span>`;
}

async function requestAaveUsdcWithdrawQuote() {
    const locale = translations[getActiveLang()];
    const amount = normalizeUsdcInput(document.getElementById('aaveWithdrawAmount')?.value);
    const activeAddress = getActiveBaseWalletAddress();
    const button = document.getElementById('aaveWithdrawQuoteButton');
    const result = document.getElementById('aaveWithdrawResult');
    activeAaveWithdrawQuote = null;
    if (!amount) {
        aaveWithdrawResult(locale.defiWithdrawInvalid, '#fca5a5');
        return;
    }
    if (!/^0x[0-9a-fA-F]{40}$/.test(activeAddress)) {
        aaveWithdrawResult(locale.defiWithdrawWalletRequired, '#fca5a5');
        return;
    }
    try {
        setButtonLoading(button, true, locale.defiWithdrawLoading);
        const response = await fetch('/api/defi/aave-base/usdc-withdraw-quote', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ wallet_address: activeAddress, amount }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || 'aave_withdraw_quote_failed');
        activeAaveWithdrawQuote = data;
        const gasWarning = data.gas_reserve_met ? '' : `<div style="color:#fca5a5; margin-top:5px;">${escapeHtml(locale.defiWithdrawNoGas.replace('{amount}', data.gas_reserve || ''))}</div>`;
        if (result) {
            result.innerHTML = `<div style="color:#86efac; font-weight:600;">${escapeHtml(locale.defiWithdrawReady.replace('{amount}', data.amount))}</div><div style="color:var(--text-muted); margin-top:5px;">${escapeHtml(locale.defiWithdrawAvailable.replace('{amount}', data.position_balance))}</div>${gasWarning}${data.gas_reserve_met ? `<button type="button" id="aaveWithdrawReviewButton" onclick="submitAaveUsdcWithdraw()" class="btn-purple-lg" style="font-size:12px; padding:9px 12px; width:auto; margin-top:10px;">${escapeHtml(locale.defiWithdrawReview)}</button>` : ''}`;
        }
    } catch (error) {
        const message = String(error?.message || '');
        const display = message.includes('exceeds the Aave USDC position')
            ? locale.defiWithdrawInsufficientPosition
            : locale.defiWithdrawQuoteError;
        aaveWithdrawResult(display, '#fca5a5');
    } finally {
        setButtonLoading(button, false, locale.defiWithdrawCheck);
    }
}

function validateAaveWithdrawTransaction(quote, fromAddress) {
    const transaction = quote?.transaction || {};
    const asset = quote?.asset || {};
    if (!window.ethers?.utils?.Interface) return false;
    try {
        const contract = new window.ethers.utils.Interface([
            'function withdraw(address asset, uint256 amount, address to) returns (uint256)',
        ]);
        const expectedData = contract.encodeFunctionData('withdraw', [
            asset.address,
            String(quote.amount_atomic),
            fromAddress,
        ]).toLowerCase();
        return transaction.chain_id === 8453
            && String(transaction.from || '').toLowerCase() === fromAddress.toLowerCase()
            && String(transaction.to || '').toLowerCase() === String(quote.pool_address || '').toLowerCase()
            && String(transaction.data || '').toLowerCase() === expectedData
            && String(transaction.value || '0') === '0';
    } catch (_) {
        return false;
    }
}

async function submitAaveUsdcWithdraw() {
    const locale = translations[getActiveLang()];
    const quote = activeAaveWithdrawQuote;
    const provider = walletConnectProvider?.session ? walletConnectProvider : window.ethereum;
    const button = document.getElementById('aaveWithdrawReviewButton');
    if (!quote || !provider?.request) {
        aaveWithdrawResult(locale.defiWithdrawExpired, '#fca5a5');
        return;
    }
    try {
        let accounts = await provider.request({ method: 'eth_accounts' });
        if (!Array.isArray(accounts) || !accounts.length) accounts = await provider.request({ method: 'eth_requestAccounts' });
        const activeAddress = getActiveBaseWalletAddress();
        const fromAddress = (accounts || []).find((account) => String(account || '').toLowerCase() === activeAddress.toLowerCase());
        if (!/^0x[0-9a-fA-F]{40}$/.test(fromAddress || '')) throw new Error('aave_withdraw_wallet_mismatch');
        if (!validateAaveWithdrawTransaction(quote, fromAddress)) throw new Error('aave_withdraw_transaction_invalid');
        await switchToBaseMainnet(provider);
        if (!await openAaveWithdrawConfirmation(quote)) return;
        setButtonLoading(button, true, locale.defiWithdrawSigning);
        const txHash = await provider.request({
            method: 'eth_sendTransaction',
            params: [{ from: fromAddress, to: quote.transaction.to, data: quote.transaction.data, value: '0x0' }],
        });
        activeAaveWithdrawQuote = null;
        try {
            const submissionResponse = await fetch('/api/defi/aave-base/withdraw-submissions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ quote_id: quote.quote_id, tx_hash: txHash }),
            });
            if (submissionResponse.ok) await loadAaveDefiHistory();
        } catch (_) {
            // The wallet transaction remains valid even if the optional notification fails.
        }
        const txUrl = `${BASE_MAINNET_CONFIG.blockExplorerUrls[0]}/tx/${encodeURIComponent(txHash)}`;
        const result = document.getElementById('aaveWithdrawResult');
        if (result) result.innerHTML = `<span style="color:#86efac;">${escapeHtml(locale.defiWithdrawSubmitted)}</span> <a href="${txUrl}" target="_blank" rel="noopener noreferrer" style="color:#c4b5fd;">${escapeHtml(locale.defiWithdrawOpenExplorer)}</a>`;
        window.setTimeout(() => loadDefiOverview(true), 7000);
    } catch (error) {
        const rejected = error?.code === 4001 || error?.code === 'ACTION_REJECTED';
        const message = String(error?.message || '');
        const display = message.includes('wallet_mismatch') ? locale.defiWithdrawWalletRequired : locale.defiWithdrawFailed;
        aaveWithdrawResult(rejected ? locale.defiWithdrawRejected : display, '#fca5a5');
    } finally {
        setButtonLoading(button, false, locale.defiWithdrawReview);
    }
}

function getOperationsJournalStatus(record) {
    const locale = translations[getActiveLang()];
    const status = String(record?.status || 'submitted');
    const keyMap = {
        submitted: 'operationsJournalStatusSubmitted',
        in_progress: 'operationsJournalStatusInProgress',
        completed: 'operationsJournalStatusCompleted',
        failed: 'operationsJournalStatusFailed',
    };
    const colors = {
        submitted: '#bfdbfe',
        in_progress: '#fde68a',
        completed: '#86efac',
        failed: '#fca5a5',
    };
    return { label: locale[keyMap[status]] || status, color: colors[status] || 'var(--text-muted)' };
}

function getOperationsJournalType(record) {
    const locale = translations[getActiveLang()];
    const type = String(record?.type || '');
    const labels = {
        bridge: locale.operationsJournalTypeBridge,
        swap: locale.operationsJournalTypeSwap,
        transfer: locale.operationsJournalTypeTransfer,
    };
    const icons = { bridge: '🌉', swap: '🔄', transfer: '↗' };
    return { label: labels[type] || type, icon: icons[type] || '•' };
}

function getOperationsJournalExplorerUrl(record) {
    const explorer = UNIVERSAL_BRIDGE_NETWORKS[record?.from_network]?.blockExplorerUrls?.[0];
    const txHash = String(record?.tx_hash || '');
    if (!explorer || !/^0x[a-fA-F0-9]{64}$/.test(txHash)) return '';
    return `${explorer.replace(/\/$/, '')}/tx/${encodeURIComponent(txHash)}`;
}

function getShortOperationAddress(address) {
    const value = String(address || '');
    return /^0x[a-fA-F0-9]{40}$/.test(value) ? `${value.slice(0, 6)}…${value.slice(-4)}` : '';
}

function formatOperationsJournalUsd(value) {
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0) return '';
    return `≈ $${number.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

async function loadOperationsJournal() {
    const locale = translations[getActiveLang()];
    const container = document.getElementById('operationsJournalList');
    if (!container) return;
    try {
        const response = await fetch('/api/operations/history');
        const data = await response.json();
        if (!response.ok || !Array.isArray(data.records)) throw new Error('operations_history_unavailable');
        const records = data.records.filter((record) => {
            if (operationsJournalFilter === 'pending') return ['submitted', 'in_progress'].includes(record.status);
            return operationsJournalFilter === 'all' || record.status === operationsJournalFilter;
        });
        if (!records.length) {
            container.innerHTML = `<div style="padding:14px 0; color:var(--text-muted); font-size:13px;">${locale.operationsJournalEmpty}</div>`;
            return;
        }
        container.innerHTML = records.map((record) => {
            const status = getOperationsJournalStatus(record);
            const type = getOperationsJournalType(record);
            const txUrl = getOperationsJournalExplorerUrl(record);
            const date = new Date(Number(record.created_at) * 1000).toLocaleString();
            const output = record.amount_out ? ` → ≈ ${escapeHtml(record.amount_out)} ${escapeHtml(record.to_symbol)}` : '';
            const recipient = record.type === 'transfer' && record.recipient
                ? ` · ${locale.operationsJournalRecipient}: ${escapeHtml(getShortOperationAddress(record.recipient))}`
                : '';
            const provider = record.provider ? ` · ${escapeHtml(record.provider)}` : '';
            const providerStatus = record.provider_status ? ` · ${escapeHtml(record.provider_status)}` : '';
            const usd = formatOperationsJournalUsd(record.estimated_usd);
            return `<div style="background:var(--bg-main); border:1px solid var(--border-color); border-radius:11px; padding:11px 12px; margin-top:8px; display:flex; justify-content:space-between; gap:12px; align-items:flex-start;">
                <div style="min-width:0;"><div style="display:flex; flex-wrap:wrap; align-items:center; gap:7px;"><span style="font-size:12px; color:#c4b5fd;">${type.icon} ${escapeHtml(type.label)}</span><span style="font-size:11px; color:${status.color}; border:1px solid ${status.color}; border-radius:999px; padding:2px 6px;">${escapeHtml(status.label)}</span></div><div style="color:#fff; font-size:13px; font-weight:600; margin-top:7px;">${escapeHtml(record.amount_in)} ${escapeHtml(record.from_symbol)}${output}</div><div style="color:var(--text-muted); font-size:11px; line-height:1.45; margin-top:4px;">${escapeHtml(record.from_network)} → ${escapeHtml(record.to_network)} · ${escapeHtml(date)}${provider}${recipient}${providerStatus}</div></div>
                <div style="text-align:right; flex:0 0 auto;">${usd ? `<div style="color:#c4b5fd; font-size:12px; font-weight:600; white-space:nowrap;">${usd}</div>` : ''}${txUrl ? `<a href="${txUrl}" target="_blank" rel="noopener noreferrer" style="display:block; margin-top:7px; color:#c4b5fd; font-size:12px; white-space:nowrap;">${locale.universalBridgeOpenTx}</a>` : ''}</div>
            </div>`;
        }).join('');
    } catch (_) {
        container.innerHTML = `<div style="padding:14px 0; color:#fca5a5; font-size:13px;">${locale.operationsJournalLoadError}</div>`;
    }
}

async function refreshUniversalBridgeHistoryRecord(recordId, silent = false, button = null) {
    const locale = translations[getActiveLang()];
    if (!silent && getUniversalBridgeRefreshCooldown(recordId) > 0) return null;
    try {
        if (!silent && button) setUniversalBridgeRefreshButtonLoading(button, true);
        const response = await fetch(`/api/universal-bridge/history/${encodeURIComponent(recordId)}/refresh`, { method: 'POST' });
        const data = await response.json();
        if (!response.ok || !data.record) throw new Error(data.detail || 'universal_bridge_status_unavailable');
        universalBridgeRefreshCooldowns.set(String(recordId), Date.now() + 12000);
        const record = data.record;
        const status = getUniversalBridgeRecordStatus(record);
        const result = document.getElementById('universalBridgeResult');
        if (result) {
            result.textContent = data.provider_available
                ? locale.universalBridgeStatus.replace('{status}', status.label)
                : locale.universalBridgeProviderUnavailable;
            result.style.color = data.provider_available ? status.color : '#fbbf24';
        }
        await loadUniversalBridgeHistory();
        return record;
    } catch (_) {
        if (button) setUniversalBridgeRefreshButtonLoading(button, false);
        if (!silent) showNotification(locale.universalBridgeProviderUnavailable, 'error');
        return null;
    }
}

async function saveUniversalBridgeSubmission(txHash, quote, fromAddress) {
    const response = await fetch('/api/universal-bridge/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            wallet_address: fromAddress,
            from_network: quote.from_network,
            to_network: quote.to_network,
            from_token_address: quote.from_token.address,
            to_token_address: quote.to_token.address,
            amount_in: quote.amount_in,
            amount_out: quote.amount_out,
            amount_out_min: quote.amount_out_min,
            provider: quote.tool || 'LI.FI',
            bridge: quote.tool_key || '',
            tx_hash: txHash,
        }),
    });
    const data = await response.json();
    if (!response.ok || !data.record) throw new Error(data.detail || 'universal_bridge_submission_unavailable');
    return data.record;
}

async function refreshUniversalBridgeStatus(txHash, quote) {
    const locale = translations[getActiveLang()];
    try {
        const params = new URLSearchParams({
            from_network: quote.from_network,
            to_network: quote.to_network,
            bridge: String(quote.tool_key || '').replace(/[^A-Za-z0-9_-]/g, ''),
        });
        const response = await fetch(`/api/universal-bridge/status/${encodeURIComponent(txHash)}?${params.toString()}`);
        const data = await response.json();
        if (!response.ok) return;
        const status = data.substatus || data.lifi_status;
        if (status) setUniversalBridgeResult(locale.universalBridgeStatus.replace('{status}', status), '#bfdbfe');
    } catch (_) {
        // Status updates are informational. The source transaction remains available in the explorer.
    }
}

async function executeUniversalBridge() {
    const locale = translations[getActiveLang()];
    const button = document.getElementById('universalBridgeReviewButton');
    const provider = walletConnectProvider?.session ? walletConnectProvider : window.ethereum;
    let quote = activeUniversalBridgeQuote;
    if (!quote || !provider?.request) {
        setUniversalBridgeResult(locale.universalBridgeInvalid, '#fca5a5');
        return;
    }
    if (Number(quote.expires_at || 0) <= Date.now()) {
        activeUniversalBridgeQuote = null;
        setUniversalBridgeReviewVisible(false);
        setUniversalBridgeResult(locale.universalBridgeQuoteExpired, '#fbbf24');
        return;
    }
    try {
        let accounts = await provider.request({ method: 'eth_accounts' });
        if (!Array.isArray(accounts) || !accounts[0]) accounts = await provider.request({ method: 'eth_requestAccounts' });
        const fromAddress = accounts?.[0];
        const activeAddress = getActiveBaseWalletAddress();
        if (!/^0x[0-9a-fA-F]{40}$/.test(fromAddress || '') || fromAddress.toLowerCase() !== activeAddress.toLowerCase()) {
            throw new Error('universal_bridge_wallet_mismatch');
        }
        setButtonLoading(button, true, locale.universalBridgeSigning);
        quote = await ensureUniversalBridgeApproval(provider, quote, fromAddress);
        activeUniversalBridgeQuote = quote;
        if (!await openUniversalBridgeConfirmation(quote, false)) return;
        await switchToUniversalBridgeNetwork(provider, quote.from_network);
        const txHash = await provider.request({ method: 'eth_sendTransaction', params: [universalBridgeTransactionParams(quote, fromAddress)] });
        const explorer = UNIVERSAL_BRIDGE_NETWORKS[quote.from_network]?.blockExplorerUrls?.[0];
        const result = document.getElementById('universalBridgeResult');
        if (result) {
            result.replaceChildren();
            const message = document.createElement('span');
            message.textContent = locale.universalBridgeSubmitted;
            message.style.color = '#86efac';
            result.append(message, document.createTextNode(' '));
            if (explorer) {
                const link = document.createElement('a');
                link.href = `${explorer.replace(/\/$/, '')}/tx/${encodeURIComponent(txHash)}`;
                link.target = '_blank';
                link.rel = 'noopener noreferrer';
                link.textContent = locale.universalBridgeOpenTx;
                link.style.color = '#c4b5fd';
                result.append(link);
            }
        }
        activeUniversalBridgeQuote = null;
        setUniversalBridgeReviewVisible(false);
        void saveUniversalBridgeSubmission(txHash, quote, fromAddress)
            .then(async () => {
                showNotification(locale.universalBridgeRecordSaved, 'success');
                await loadUniversalBridgeHistory();
            })
            .catch(() => {
                // The wallet transaction is still valid even if recording is temporarily unavailable.
                setTimeout(() => refreshUniversalBridgeStatus(txHash, quote), 12000);
            });
    } catch (error) {
        const rejected = error?.code === 4001 || error?.code === 'ACTION_REJECTED' || String(error?.message || '').includes('universal_bridge_cancelled');
        const message = String(error?.message || '');
        const display = message.includes('universal_bridge_approval_pending')
            ? locale.universalBridgeApprovalPending
            : (rejected ? locale.universalBridgeRejected : (translateBackendDetail(message) || locale.universalBridgeFailed));
        setUniversalBridgeResult(display, '#fca5a5');
    } finally {
        setButtonLoading(button, false, locale.universalBridgeReview);
    }
}

async function checkBridgeReadiness() {
    const locale = translations[getActiveLang()];
    const amount = getOperationBuilderAmount();
    const destination = getOperationBuilderDestination();
    const result = document.getElementById('bridgePlanResult');
    const saveButton = document.getElementById('bridgePlanSaveButton');
    const walletAddress = getActiveBaseWalletAddress();
    if (!validateOperationAmount()) {
        if (saveButton) saveButton.style.display = 'none';
        return false;
    }
    if (!amount || !destination || !/^0x[0-9a-fA-F]{40}$/.test(walletAddress)) {
        if (saveButton) saveButton.style.display = 'none';
        if (result) {
            result.textContent = locale.bridgePlanInvalid;
            result.style.color = '#fca5a5';
        }
        return false;
    }
    if (result) {
        result.textContent = locale.bridgePlanChecking;
        result.style.color = '#bfdbfe';
    }
    try {
        const [sourceResponse, destinationResponse] = await Promise.all([
            fetch('/api/gas/Base'), fetch(`/api/gas/${encodeURIComponent(destination)}`),
        ]);
        const [sourceGas, destinationGas] = await Promise.all([
            sourceResponse.json(), destinationResponse.json(),
        ]);
        if (!sourceResponse.ok || !destinationResponse.ok) throw new Error('bridge_gas_unavailable');
        if (result) {
            result.textContent = locale.bridgePlanReady
                .replace('{amount}', amount)
                .replace('{destination}', destination)
                .replace('{sourceGas}', getBridgeGasText(sourceGas))
                .replace('{destinationGas}', getBridgeGasText(destinationGas));
            result.style.color = '#86efac';
        }
        if (saveButton) saveButton.style.display = 'inline-flex';
        return true;
    } catch (error) {
        if (saveButton) saveButton.style.display = 'none';
        if (result) {
            result.textContent = locale.bridgePlanGasUnavailable;
            result.style.color = '#fbbf24';
        }
        return false;
    }
}

async function saveBridgePlan() {
    const locale = translations[getActiveLang()];
    const amount = getOperationBuilderAmount();
    const destination = getOperationBuilderDestination();
    const walletAddress = getActiveBaseWalletAddress();
    const result = document.getElementById('bridgePlanResult');
    if (!validateOperationAmount()) return;
    if (!amount || !destination || !/^0x[0-9a-fA-F]{40}$/.test(walletAddress)) {
        if (result) {
            result.textContent = locale.bridgePlanInvalid;
            result.style.color = '#fca5a5';
        }
        return;
    }
    try {
        const response = await fetch('/api/bridge-plans', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ wallet_address: walletAddress, to_network: destination, amount }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || 'bridge_plan_unavailable');
        if (result) {
            result.textContent = locale.bridgePlanSaved;
            result.style.color = '#86efac';
        }
        showNotification(locale.bridgePlanSaved, 'success');
        const saveButton = document.getElementById('bridgePlanSaveButton');
        if (saveButton) saveButton.style.display = 'none';
        await loadBridgePlans();
    } catch (error) {
        if (result) {
            result.textContent = locale.bridgePlanSaveError;
            result.style.color = '#fca5a5';
        }
        showNotification(locale.bridgePlanSaveError, 'error');
    }
}

async function loadBridgePlans() {
    const container = document.getElementById('bridgePlansHistory');
    if (!container) return;
    const locale = translations[getActiveLang()];
    try {
        const response = await fetch('/api/bridge-plans');
        const data = await response.json();
        if (!response.ok || !Array.isArray(data.plans)) throw new Error('bridge_plan_unavailable');
        if (!data.plans.length) {
            container.textContent = locale.bridgePlanEmpty;
            container.style.color = 'var(--text-muted)';
            container.style.fontSize = '12px';
            return;
        }
        container.innerHTML = data.plans.map((plan) => {
            const createdAt = new Date(Number(plan.created_at) * 1000).toLocaleString();
            return `<div style="background:var(--bg-main); border:1px solid var(--border-color); border-radius:10px; padding:11px 12px; margin-top:8px;"><div style="color:#fff; font-size:13px; font-weight:700;">${escapeHtml(plan.amount)} ${escapeHtml(plan.asset)} · ${escapeHtml(plan.from_network)} → ${escapeHtml(plan.to_network)}</div><div style="color:var(--text-muted); font-size:11px; margin-top:4px;">${escapeHtml(createdAt)} · ${locale.bridgePlanStatusPlanned}</div></div>`;
        }).join('');
    } catch (error) {
        container.textContent = locale.bridgePlanLoadError;
        container.style.color = '#fca5a5';
        container.style.fontSize = '12px';
    }
}

async function startScanningDrops() {
    const log = document.getElementById('drop-logs');
    const username = localStorage.getItem('airdrop_username') || "Robert";
    const t = translations[currentLang];
    if (log) log.innerHTML += `<br><span style="color: var(--text-muted);">${t.lootChecking}</span>`;
    try {
        const res = await fetch(`/api/scan/${username}`, { method: 'POST' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'scan_failed');
        const summary = t.lootScanSummary
            .replace('{total}', data.data.total_wallets_scanned)
            .replace('{valid}', data.data.valid_wallets_checked);
        if (log) {
            log.innerHTML += `<br><span style="color: #86efac;">${summary}</span>`;
            log.innerHTML += `<br><span style="color: #fbbf24;">${t.lootIntegrationsPending}</span>`;
        }
    } catch (error) {
        if (log) log.innerHTML += `<br><span style="color: #fca5a5;">${translateBackendDetail(error.message)}</span>`;
    }
}

async function loadOfficialOpportunities() {
    const container = document.getElementById('officialOpportunitiesContainer');
    if (!container) return;
    const t = translations[currentLang];
    try {
        const response = await fetch('/api/opportunities');
        const data = await response.json();
        if (!response.ok || !Array.isArray(data.sources)) throw new Error('opportunities_unavailable');
        container.innerHTML = data.sources.map((source) => {
            const summary = source.summaries?.[getActiveLang()] || source.summaries?.en || t[`opportunity_${source.summary_key}`] || t.opportunitySummaryFallback;
            const status = source.status === 'official_updates' ? t.opportunityStatusOfficial : t.opportunityStatusPending;
            const deleteButton = data.can_manage && !source.is_system
                ? `<button type="button" class="btn-dark-sm" onclick="deleteOfficialOpportunity(${Number(source.id)})" style="white-space:nowrap; padding:8px 11px; color:#fca5a5;">${t.opportunityDelete}</button>`
                : '';
            return `
                <div style="background:var(--bg-main); border:1px solid var(--border-color); border-radius:12px; padding:14px; display:flex; justify-content:space-between; gap:12px; align-items:center;">
                    <div>
                        <div style="color:#fff; font-weight:700; font-size:14px;">${escapeHtml(source.name)} <span style="color:var(--text-muted); font-weight:400;">(${escapeHtml(source.network)})</span></div>
                        <div style="color:#93c5fd; font-size:12px; margin-top:5px;">${status}</div>
                        <div style="color:var(--text-muted); font-size:12px; line-height:1.45; margin-top:4px;">${escapeHtml(summary)}</div>
                    </div>
                    <div style="display:flex; flex-wrap:wrap; gap:8px; justify-content:flex-end;">
                        <a href="${escapeHtml(source.official_url)}" target="_blank" rel="noopener noreferrer" class="btn-dark-sm" style="white-space:nowrap; padding:8px 11px; text-decoration:none;">${t.opportunityOfficialLink}</a>
                        ${deleteButton}
                    </div>
                </div>
            `;
        }).join('') || `<div style="color:var(--text-muted); font-size:13px;">${t.opportunityEmpty}</div>`;
        renderOpportunityAdminControls(Boolean(data.can_manage));
    } catch (error) {
        container.innerHTML = `<div style="color:#fca5a5; font-size:13px;">${t.opportunityLoadError}</div>`;
    }
}

async function loadAirdropEligibility() {
    const container = document.getElementById('airdropEligibilityContainer');
    if (!container) return;
    const locale = translations[currentLang];
    const username = localStorage.getItem('airdrop_username');
    if (!username) {
        container.innerHTML = `<div style="color:var(--text-muted); font-size:13px;">${locale.eligibilityNoWallets}</div>`;
        return;
    }
    try {
        const response = await fetch(`/api/eligibility/${encodeURIComponent(username)}`);
        const data = await response.json();
        if (!response.ok || !Array.isArray(data.wallets) || !Array.isArray(data.claim_checks)) {
            throw new Error('eligibility_unavailable');
        }
        const wallets = data.wallets.length
            ? `<div style="color:var(--text-muted); font-size:12px; line-height:1.5; margin-bottom:12px;">${locale.eligibilityWallets}: ${data.wallets.map((wallet) => escapeHtml(wallet.label || `${wallet.address.slice(0, 6)}…${wallet.address.slice(-4)}`)).join(', ')}</div>`
            : `<div style="color:var(--text-muted); font-size:13px; line-height:1.5;">${locale.eligibilityNoWallets}</div>`;
        const checks = data.claim_checks.length
            ? data.claim_checks.map((source) => `
                <div style="background:var(--bg-main); border:1px solid var(--border-color); border-radius:12px; padding:13px; display:flex; justify-content:space-between; gap:12px; align-items:center;">
                    <div>
                        <div style="color:#fff; font-size:14px; font-weight:700;">${escapeHtml(source.name)} <span style="color:var(--text-muted); font-weight:400;">(${escapeHtml(source.network)})</span></div>
                        <div style="color:var(--text-muted); font-size:12px; margin-top:4px;">${escapeHtml(source.summaries?.[getActiveLang()] || source.summaries?.en || '')}</div>
                    </div>
                    <a href="${escapeHtml(source.claim_url)}" target="_blank" rel="noopener noreferrer" class="btn-dark-sm" style="white-space:nowrap; padding:8px 11px; text-decoration:none;">${locale.eligibilityOpenCheck}</a>
                </div>
            `).join('')
            : `<div style="color:var(--text-muted); font-size:13px; line-height:1.5;">${locale.eligibilityNoChecks}</div>`;
        container.innerHTML = `${wallets}<div style="display:flex; flex-direction:column; gap:10px;">${checks}</div><div style="color:#fbbf24; font-size:12px; line-height:1.5; margin-top:12px;">${locale.eligibilityCheckedNotice}</div>`;
    } catch (error) {
        container.innerHTML = `<div style="color:#fca5a5; font-size:13px;">${locale.eligibilityLoadError}</div>`;
    }
}

function renderOpportunityAdminControls(canManage) {
    const container = document.getElementById('officialOpportunityAdminContainer');
    if (!container) return;
    if (!canManage) {
        container.innerHTML = '';
        return;
    }
    const t = translations[currentLang];
    const fieldStyle = 'class="auth-input" style="margin-top:5px; font-size:13px; padding:10px 12px;"';
    container.innerHTML = `
        <div class="dashboard-card" style="margin-top:18px;">
            <h3 style="color:#fff; margin-top:0; font-size:16px;">${t.opportunityAdminTitle}</h3>
            <p style="color:var(--text-muted); font-size:13px; line-height:1.5;">${t.opportunityAdminDesc}</p>
            <form onsubmit="submitOfficialOpportunity(event)" style="display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px;">
                <label style="color:var(--text-muted); font-size:12px;">${t.opportunitySourceKey}<input id="opportunitySourceKey" maxlength="40" required ${fieldStyle}></label>
                <label style="color:var(--text-muted); font-size:12px;">${t.opportunitySourceName}<input id="opportunitySourceName" maxlength="80" required ${fieldStyle}></label>
                <label style="color:var(--text-muted); font-size:12px;">${t.opportunitySourceNetwork}<input id="opportunitySourceNetwork" maxlength="80" required ${fieldStyle}></label>
                <label style="color:var(--text-muted); font-size:12px;">${t.opportunitySourceUrl}<input id="opportunitySourceUrl" type="url" maxlength="500" required ${fieldStyle}></label>
                <label style="color:var(--text-muted); font-size:12px; grid-column:1 / -1;">${t.opportunityClaimUrl}<input id="opportunityClaimUrl" type="url" maxlength="500" ${fieldStyle}></label>
                <label style="color:var(--text-muted); font-size:12px; grid-column:1 / -1;">${t.opportunitySourceSummaryRu}<textarea id="opportunitySourceSummaryRu" maxlength="500" required ${fieldStyle}></textarea></label>
                <label style="color:var(--text-muted); font-size:12px; grid-column:1 / -1;">${t.opportunitySourceSummaryEn}<textarea id="opportunitySourceSummaryEn" maxlength="500" required ${fieldStyle}></textarea></label>
                <label style="color:var(--text-muted); font-size:12px; grid-column:1 / -1;">${t.opportunitySourceSummaryZh}<textarea id="opportunitySourceSummaryZh" maxlength="500" required ${fieldStyle}></textarea></label>
                <button type="submit" class="btn-purple-lg" style="grid-column:1 / -1; font-size:13px; padding:12px 20px;">${t.opportunityPublish}</button>
            </form>
        </div>
    `;
}

async function submitOfficialOpportunity(event) {
    event.preventDefault();
    const t = translations[currentLang];
    const payload = {
        source_key: document.getElementById('opportunitySourceKey')?.value || '',
        name: document.getElementById('opportunitySourceName')?.value || '',
        network: document.getElementById('opportunitySourceNetwork')?.value || '',
        official_url: document.getElementById('opportunitySourceUrl')?.value || '',
        claim_url: document.getElementById('opportunityClaimUrl')?.value || '',
        summary_ru: document.getElementById('opportunitySourceSummaryRu')?.value || '',
        summary_en: document.getElementById('opportunitySourceSummaryEn')?.value || '',
        summary_zh: document.getElementById('opportunitySourceSummaryZh')?.value || '',
    };
    try {
        const response = await fetch('/api/opportunities', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || 'opportunities_unavailable');
        showNotification(t.opportunityPublished, 'success');
        await loadOfficialOpportunities();
    } catch (error) {
        showNotification(translateBackendDetail(error.message) || t.opportunityManageError, 'error');
    }
}

async function deleteOfficialOpportunity(sourceId) {
    const t = translations[currentLang];
    if (!Number.isInteger(sourceId) || !window.confirm(t.opportunityDeleteConfirm)) return;
    try {
        const response = await fetch(`/api/opportunities/${sourceId}`, { method: 'DELETE' });
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || 'opportunities_unavailable');
        showNotification(t.opportunityDeleted, 'success');
        await loadOfficialOpportunities();
    } catch (error) {
        showNotification(translateBackendDetail(error.message) || t.opportunityManageError, 'error');
    }
}

async function loadPlatformStats() {
    try {
        const res = await fetch('/api/stats');
        const data = await res.json();
        window.cachedStatsData = data;
        const counterEl = document.getElementById('slots-counter-text');
        if (counterEl) {
            counterEl.innerHTML = `${t('privateSoftware')}. <b style="color:#fff; margin-left:8px;">${data.current_slots} / ${data.max_slots} ${t('slotsShort')}</b>`;
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

    let centerHtml = '';
    
    if (section === 'Account') {
        const guideHtml = renderInterfaceHint('account-welcome', `${t.accWelcome}, ${username}! ${t.accWelcomeDesc}`, 'purple', '', '👋');

        centerHtml = `
            ${guideHtml}

            <div class="dashboard-card" style="margin-bottom: 16px;">
                <h3 style="color: #fff; margin-top: 0; font-size: 16px;">${t.subTitle}</h3>
                <p style="color: var(--text-muted); font-size: 13px; line-height: 1.5;">${t.subPlan}: <b>${userPlan}</b> | ${t.subActive} (${subscriptionDaysLeft} ${t.days})</p>
                <p style="color: #93c5fd; font-size: 12px; line-height: 1.5; margin: 10px 0 0;">${t.subscriptionPaymentNote}</p>
                <button type="button" onclick="openPricingModal()" class="btn-dark-sm" style="margin-top:12px;">${t.btnChangePlan}</button>
            </div>
        `;

} else if (section === 'Settings') {
        const notifTransactionSubmittedChecked = localStorage.getItem('ax_notify_transactions_submitted') === 'true' ? 'checked' : '';
        const notifTransactionFinalChecked = localStorage.getItem('ax_notify_transactions_final') !== 'false' ? 'checked' : '';
        const notifRemindersChecked = localStorage.getItem('ax_notify_reminders') !== 'false' ? 'checked' : '';
        const notifErrorsChecked = localStorage.getItem('ax_notify_errors') !== 'false' ? 'checked' : '';
        const notifDefiSupplySubmittedChecked = localStorage.getItem('ax_notify_defi_supply_submitted') === 'true' ? 'checked' : '';
        const notifDefiWithdrawSubmittedChecked = localStorage.getItem('ax_notify_defi_withdraw_submitted') === 'true' ? 'checked' : '';
        const notifDefiFinalChecked = localStorage.getItem('ax_notify_defi_final') === 'true' ? 'checked' : '';
        const notifDefiErrorsChecked = localStorage.getItem('ax_notify_defi_errors') === 'true' ? 'checked' : '';

        const antiSybilWarningHtml = renderInterfaceHint('settings-safety-note', `${t.setWarnTitle}. ${t.setWarnDesc}`, 'warning', '', '🛡️');

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
                    <div style="background:var(--bg-main); border:1px solid var(--border-color); border-radius:10px; padding:12px;">
                        <div style="font-size:13px; color:#fff; font-weight:600;">${t.tgConnectTitle}</div>
                        <div id="telegramConnectionState" style="font-size:12px; color:var(--text-muted); margin-top:4px;">${t.tgChecking}</div>
                        <div style="display:flex; flex-wrap:wrap; gap:8px; margin-top:10px;">
                            <button type="button" onclick="createTelegramLink()" style="background:#7c3aed; color:#fff; border:0; border-radius:8px; padding:8px 10px; cursor:pointer; font-size:12px; font-weight:600;">${t.tgConnectBtn}</button>
                            <button type="button" id="telegramTestButton" onclick="sendTelegramTest()" style="display:none; background:transparent; color:#c4b5fd; border:1px solid #7c3aed; border-radius:8px; padding:8px 10px; cursor:pointer; font-size:12px;">${t.tgTestBtn}</button>
                        </div>
                        <div id="telegramLinkResult" style="font-size:12px; color:var(--text-muted); line-height:1.4; margin-top:8px;"></div>
                    </div>
                </div>

                <div style="background: var(--bg-main); border: 1px solid var(--border-color); border-radius: 12px; padding: 16px; margin-bottom: 18px;">
                    <div style="font-size: 13px; color: #fff; font-weight: 600; margin-bottom: 12px;">${t.notifTitle}</div>
                    <div style="font-size:12px; color:var(--text-muted); line-height:1.45; margin:-4px 0 12px;">${t.notifDesc}</div>
                    <div style="display:flex; flex-wrap:wrap; gap:8px; margin:0 0 14px;">
                        <button type="button" onclick="applyTelegramNotificationPreset('important')" class="tg-notification-preset">${t.notifPresetImportant}</button>
                        <button type="button" onclick="applyTelegramNotificationPreset('all')" class="tg-notification-preset">${t.notifPresetAll}</button>
                        <button type="button" onclick="applyTelegramNotificationPreset('errors')" class="tg-notification-preset">${t.notifPresetErrors}</button>
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 13px; color: var(--text-muted);">
                        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;"><input type="checkbox" id="notifTransactionSubmittedToggle" ${notifTransactionSubmittedChecked}> ${t.notifTransactionSubmitted}</label>
                        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;"><input type="checkbox" id="notifTransactionFinalToggle" ${notifTransactionFinalChecked}> ${t.notifTransactionFinal}</label>
                        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;"><input type="checkbox" id="notifRemindersToggle" ${notifRemindersChecked}> ${t.notifReminders}</label>
                        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;"><input type="checkbox" id="notifErrorsToggle" ${notifErrorsChecked}> ${t.notifErrors}</label>
                    </div>
                    <div style="border-top:1px solid var(--border-color); margin-top:14px; padding-top:12px;">
                        <div style="color:#e9d5ff; font-size:12px; font-weight:700;">${t.notifDefiTitle}</div>
                        <div style="font-size:11px; color:var(--text-muted); line-height:1.45; margin:4px 0 10px;">${t.notifDefiDesc}</div>
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; font-size:13px; color:var(--text-muted);">
                            <label style="display:flex; align-items:center; gap:8px; cursor:pointer;"><input type="checkbox" id="notifDefiSupplySubmittedToggle" ${notifDefiSupplySubmittedChecked}> ${t.notifDefiSupplySubmitted}</label>
                            <label style="display:flex; align-items:center; gap:8px; cursor:pointer;"><input type="checkbox" id="notifDefiWithdrawSubmittedToggle" ${notifDefiWithdrawSubmittedChecked}> ${t.notifDefiWithdrawSubmitted}</label>
                            <label style="display:flex; align-items:center; gap:8px; cursor:pointer;"><input type="checkbox" id="notifDefiFinalToggle" ${notifDefiFinalChecked}> ${t.notifDefiFinal}</label>
                            <label style="display:flex; align-items:center; gap:8px; cursor:pointer;"><input type="checkbox" id="notifDefiErrorsToggle" ${notifDefiErrorsChecked}> ${t.notifDefiErrors}</label>
                        </div>
                    </div>
                </div>

                <div style="background:var(--bg-main); border:1px solid var(--border-color); border-radius:12px; padding:16px; margin-bottom:18px;">
                    <div style="display:flex; justify-content:space-between; gap:12px; align-items:center; margin-bottom:5px;">
                        <div style="font-size:13px; color:#fff; font-weight:700;">${t.securityOverviewTitle}</div>
                        <button type="button" onclick="loadSecurityOverview()" class="tg-notification-preset">${t.securityRefresh}</button>
                    </div>
                    <div style="font-size:12px; color:var(--text-muted); line-height:1.45; margin-bottom:8px;">${t.securityOverviewDesc}</div>
                    <div id="securityOverviewContent" style="margin-bottom:13px;"></div>
                    <div style="border-top:1px solid var(--border-color); padding-top:12px; color:#bfdbfe; font-size:12px; line-height:1.55;">
                        <div style="font-weight:700; color:#e9d5ff; margin-bottom:4px;">${t.securityGuarantees}</div>
                        <div>• ${t.securityNoKeys}</div>
                        <div>• ${t.securityConfirm}</div>
                        <div>• ${t.securitySingleSession}</div>
                    </div>
                </div>

                <button type="button" onclick="saveGlobalProfileSettings()" class="btn-modal-primary" style="width:100%; padding: 12px; font-size: 14px; font-weight: 600; border-radius: 12px; cursor: pointer;">${t.btnSaveSet}</button>
            </div>

            <div class="dashboard-card" style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 18px; padding: 22px; box-shadow: 0 8px 30px rgba(0,0,0,0.4);">
                <div style="color: #fff; font-weight: 700; font-size: 16px; margin-bottom: 4px;">${t.setInterfaceTitle}</div>
                <div style="color: var(--text-muted); font-size: 13px; margin-bottom: 14px;">${t.setInterfaceDesc}</div>
                <div style="display:flex; flex-direction:column; gap:16px;">
                    <label style="display: flex; align-items: center; justify-content: space-between; cursor: pointer;">
                        <span style="padding-right:16px;">
                            <span style="display:block; color:#fff; font-size:13px; font-weight:600;">${t.setInterfaceHintsToggle}</span>
                            <span style="display:block; color:var(--text-muted); font-size:12px; line-height:1.45; margin-top:3px;">${t.setInterfaceHintsToggleDesc}</span>
                        </span>
                        <span class="toggle-switch" style="flex:0 0 auto;">
                            <input type="checkbox" ${areInterfaceHintsEnabled() ? 'checked' : ''} onchange="toggleInterfaceHints(this)">
                            <span class="toggle-slider"></span>
                        </span>
                    </label>
                </div>
            </div>
        `;
        setTimeout(() => {
            updateDailyConfigsUI();
            refreshTelegramConnectionState();
            loadSecurityOverview();
        }, 50);

    } else if (section === 'Looter') {
        centerHtml = `
            <div class="dashboard-card">
                <h3 style="color: #fff; margin-top: 0; font-size: 16px;">🚀 ${t.lootTitle}</h3>
                <p style="color: var(--text-muted); font-size: 13px; line-height: 1.5;">${t.lootDesc}</p>
                <button type="button" onclick="startScanningDrops()" class="btn-purple-lg" style="font-size: 13px; padding: 12px 20px; width:auto; margin-top: 4px;">${t.btnScan}</button>
                <div id="drop-logs" style="margin-top: 16px; background: var(--bg-main); padding: 16px; border-radius: 12px; font-family: monospace; font-size: 13px; line-height: 1.5; color: var(--text-muted); min-height: 250px; max-height: 380px; overflow-y: auto; border: 1px solid var(--border-color);">${t.logInitLoot}</div>
            </div>
            <div class="dashboard-card">
                <h3 style="color:#fff; margin-top:0; font-size:16px;">${t.eligibilityTitle}</h3>
                <p style="color:var(--text-muted); font-size:13px; line-height:1.5;">${t.eligibilityDesc}</p>
                <div id="airdropEligibilityContainer" style="display:flex; flex-direction:column; gap:10px;">${t.loading}</div>
            </div>
            <div class="dashboard-card">
                <h3 style="color:#fff; margin-top:0; font-size:16px;">${t.opportunitiesTitle}</h3>
                <p style="color:var(--text-muted); font-size:13px; line-height:1.5;">${t.opportunitiesDesc}</p>
                <div id="officialOpportunitiesContainer" style="display:flex; flex-direction:column; gap:10px;">${t.loading}</div>
                <div id="officialOpportunityAdminContainer"></div>
            </div>
        `;
        setTimeout(() => {
            loadOfficialOpportunities();
            loadAirdropEligibility();
        }, 50);
    } else if (section === 'Farming') {
        const storedActivityPane = localStorage.getItem('ax_activity_pane');
        const activityPane = ['swap', 'plan', 'defi', 'quests', 'journal'].includes(storedActivityPane) ? storedActivityPane : 'swap';
        if (storedActivityPane === 'transfer') localStorage.setItem('ax_activity_pane', 'swap');
        const plannerNetworkOptions = NETWORKS_CONFIG.map(net => `<option value="${net.key}">${net.name} (${net.symbol})</option>`).join('');
        const bridgeDestinationOptions = NETWORKS_CONFIG
            .filter(net => ['Ethereum', 'Arbitrum', 'Optimism', 'Polygon', 'Linea', 'BNB Chain'].includes(net.key))
            .map(net => `<option value="${net.key}">${net.name}</option>`).join('');
        const sourceNetworkOptions = NETWORKS_CONFIG
            .filter(net => ['Ethereum', 'Base', 'Arbitrum', 'Optimism', 'Polygon', 'Linea', 'BNB Chain'].includes(net.key))
            .map(net => `<option value="${net.key}">${net.name}</option>`).join('');
        const reminderDayOptions = [
            ['Mon', t.planReminderMonday], ['Tue', t.planReminderTuesday], ['Wed', t.planReminderWednesday],
            ['Thu', t.planReminderThursday], ['Fri', t.planReminderFriday], ['Sat', t.planReminderSaturday], ['Sun', t.planReminderSunday],
        ].map(([value, label]) => `<option value="${value}">${label}</option>`).join('');
        const activityTabs = [
            ['swap', t.activityTabSwap], ['plan', t.activityTabPlan], ['defi', t.activityTabDefi], ['quests', t.activityTabQuests], ['journal', t.activityTabJournal],
        ].map(([key, label]) => `<button type="button" onclick="switchActivityPane('${key}')" style="background:${activityPane === key ? 'rgba(124,58,237,.22)' : 'var(--bg-main)'}; color:${activityPane === key ? '#e9d5ff' : 'var(--text-muted)'}; border:1px solid ${activityPane === key ? '#7c3aed' : 'var(--border-color)'}; padding:9px 11px; border-radius:9px; cursor:pointer; font-size:12px; white-space:nowrap;">${label}</button>`).join('');
        const swapPane = `<div id="operationSwapPanel" style="border-top:1px solid var(--border-color); margin-top:18px; padding-top:18px;"><h3 style="color:#fff; margin-top:0; font-size:16px;">${t.baseSwapTitle}</h3><p style="color:var(--text-muted); font-size:13px; line-height:1.5;">${t.baseSwapDesc}</p>${renderInterfaceHint('base-swap-safety', t.baseSwapSafety, 'info', '', '🛡️')}<div style="color:var(--text-muted); font-size:12px; margin-top:10px;">${t.baseSwapSlippage}</div><button type="button" id="baseSwapQuoteButton" onclick="requestBaseSwapQuote()" class="btn-purple-lg" style="font-size:13px; padding:12px 18px; width:auto; margin-top:12px;">${t.baseSwapGetQuote}</button><div id="baseSwapResult" style="font-size:12px; line-height:1.5; margin-top:12px;"></div><div style="margin-top:18px; color:#fff; font-weight:700; font-size:13px;">${t.baseSwapHistoryTitle}</div><div id="baseSwapHistory" style="margin-top:7px;"></div></div>`;
        const planPane = `
            <div class="dashboard-card">
                <h3 style="color:#fff; margin-top:0; font-size:16px;">${t.farmTitle}</h3>
                <p style="color:var(--text-muted); font-size:13px; line-height:1.5; margin-bottom:12px;">${t.farmDesc}</p>
                ${renderInterfaceHint('operation-plan-signing', t.planSigningNote, 'info', '', '✍')}
                <label style="color:var(--text-muted); font-size:12px; display:block; margin-bottom:6px;">${t.netSelect}</label>
                <select class="auth-input" id="planNetwork" style="margin-bottom:12px; font-size:13px; padding:10px 12px;">${plannerNetworkOptions}</select>
                <div style="display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px;">
                    <label style="color:var(--text-muted); font-size:12px;">${t.planOps}<input id="planOperations" type="number" min="1" max="1000" value="1" oninput="updateTransactionPlanEstimate()" class="auth-input" style="margin-top:5px; font-size:13px; padding:10px 12px;"></label>
                    <label style="color:var(--text-muted); font-size:12px;">${t.planMaxCost}<input id="planMaxCost" type="number" min="0" step="0.01" value="1" oninput="updateTransactionPlanEstimate()" class="auth-input" style="margin-top:5px; font-size:13px; padding:10px 12px;"></label>
                    <label style="color:var(--text-muted); font-size:12px;">${t.planReserve}<input id="planReserve" type="number" min="0" step="0.01" value="0" oninput="updateTransactionPlanEstimate()" class="auth-input" style="margin-top:5px; font-size:13px; padding:10px 12px;"></label>
                    <label style="color:var(--text-muted); font-size:12px;">${t.planDailyCap}<input id="planDailyCap" type="number" min="0" step="0.01" value="10" oninput="updateTransactionPlanEstimate()" class="auth-input" style="margin-top:5px; font-size:13px; padding:10px 12px;"></label>
                    <label style="color:var(--text-muted); font-size:12px; grid-column:1 / -1;">${t.planMonthlyCap}<input id="planMonthlyCap" type="number" min="0" step="0.01" value="50" oninput="updateTransactionPlanEstimate()" class="auth-input" style="margin-top:5px; font-size:13px; padding:10px 12px;"></label>
                </div>
                <div style="display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; margin-top:14px;">
                    <div style="background:var(--bg-main); border:1px solid var(--border-color); border-radius:10px; padding:12px;"><div style="font-size:11px; color:var(--text-muted);">${t.planEstimated}</div><div id="planEstimateValue" style="font-size:18px; color:#fff; font-weight:700; margin-top:4px;">$0.00</div></div>
                    <div style="background:var(--bg-main); border:1px solid var(--border-color); border-radius:10px; padding:12px;"><div style="font-size:11px; color:var(--text-muted);">${t.planRiskCap}</div><div id="planRiskCapValue" style="font-size:18px; color:#fff; font-weight:700; margin-top:4px;">$0.00</div></div>
                </div>
                <div id="planBudgetWarning" style="display:none; color:#fca5a5; font-size:12px; margin-top:10px;"></div>
                <button type="button" onclick="saveTransactionPlan()" class="btn-purple-lg" style="font-size:13px; padding:12px 20px; width:auto; margin-top:14px;">${t.planSave}</button>
            </div>
            <div class="dashboard-card">
                <h3 style="color:#fff; margin-top:0; font-size:16px;">${t.planReminderTitle}</h3>
                <p style="color:var(--text-muted); font-size:13px; line-height:1.5; margin-bottom:14px;">${t.planReminderDesc}</p>
                <label style="display:flex; align-items:center; gap:9px; color:#fff; font-size:13px; cursor:pointer;"><input id="actionReminderEnabled" type="checkbox" onchange="toggleActionReminderFields()"> ${t.planReminderEnabled}</label>
                <div id="actionReminderFields" style="display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; margin-top:14px;">
                    <label style="color:var(--text-muted); font-size:12px;">${t.planReminderDay}<select id="actionReminderDay" class="auth-input" style="margin-top:5px; font-size:13px; padding:10px 12px;">${reminderDayOptions}</select></label>
                    <label style="color:var(--text-muted); font-size:12px;">${t.planReminderTime}<input id="actionReminderTime" type="text" value="18:00" placeholder="15:32" maxlength="5" inputmode="numeric" pattern="[0-2][0-9]:[0-5][0-9]" oninput="format24HourTimeInput(this)" onblur="normalize24HourTimeInput(this)" class="auth-input" style="margin-top:5px; font-size:13px; padding:10px 12px;"></label>
                    <label style="grid-column:1 / -1; display:flex; align-items:center; gap:9px; color:var(--text-muted); font-size:12px; cursor:pointer;"><input id="actionReminderTelegram" type="checkbox" checked> ${t.planReminderTelegram}</label>
                </div>
                <div id="actionReminderStatus" style="font-size:12px; margin-top:12px;"></div>
                <button type="button" onclick="saveActionReminder()" class="btn-purple-lg" style="font-size:13px; padding:12px 20px; width:auto; margin-top:14px;">${t.planReminderSave}</button>
            </div>
        `;
        const bridgePane = `
            <div id="operationBridgePanel" style="display:none; border-top:1px solid var(--border-color); margin-top:18px; padding-top:18px;">
                <h3 style="color:#fff; margin:0; font-size:16px;">${t.bridgePlanSimpleTitle}</h3>
                <p style="color:var(--text-muted); font-size:12px; line-height:1.5; margin:7px 0 0;">${t.bridgePlanSimpleDesc}</p>
                <div id="bridgePlanResult" style="font-size:12px; line-height:1.5; margin-top:12px; color:var(--text-muted);">${t.bridgePlanStart}</div>
                <div style="display:flex; flex-wrap:wrap; gap:9px; margin-top:14px;">
                    <button type="button" onclick="checkBridgeReadiness()" class="btn-dark-sm" style="padding:10px 14px; border-color:#7c3aed;">${t.bridgePlanCheck}</button>
                    <button type="button" id="bridgePlanSaveButton" onclick="saveBridgePlan()" class="btn-purple-lg" style="display:none; font-size:13px; padding:10px 14px; width:auto;">${t.bridgePlanSave}</button>
                </div>
                <details style="border-top:1px solid var(--border-color); margin-top:18px; padding-top:14px;"><summary style="color:var(--text-muted); cursor:pointer; font-size:12px;">${t.bridgePlanHistory}</summary><div id="bridgePlansHistory" style="margin-top:10px;">${t.loading}</div></details>
            </div>
        `;
        const universalBridgePane = `
            <div id="universalBridgePanel" style="display:none; border-top:1px solid var(--border-color); margin-top:18px; padding-top:18px;">
                <h3 style="color:#fff; margin:0; font-size:16px;">${t.universalBridgeTitle}</h3>
                <p style="color:var(--text-muted); font-size:12px; line-height:1.5; margin:7px 0 0;">${t.universalBridgeDesc}</p>
                ${renderInterfaceHint('universal-bridge-safety', t.universalBridgeSafety, 'info', '', '🛡️')}
                <div style="display:flex; flex-wrap:wrap; gap:9px; margin-top:14px;">
                    <button type="button" id="universalBridgeQuoteButton" onclick="requestUniversalBridgeQuote()" class="btn-purple-lg" style="font-size:13px; padding:10px 14px; width:auto;">${t.universalBridgeGetQuote}</button>
                    <button type="button" id="universalBridgeReviewButton" onclick="executeUniversalBridge()" class="btn-dark-sm" style="display:none; padding:10px 14px; border-color:#7c3aed;">${t.universalBridgeReview}</button>
                </div>
                <div id="universalBridgeResult" style="font-size:12px; line-height:1.55; margin-top:12px; color:var(--text-muted);">${t.universalBridgeRouteNotReady}</div>
                <div style="border-top:1px solid var(--border-color); margin-top:16px; padding-top:14px;">
                    <div style="color:#fff; font-size:13px; font-weight:700;">${t.universalBridgeHistoryTitle}</div>
                    <div id="universalBridgeHistory" style="margin-top:7px;"><span style="color:var(--text-muted); font-size:12px;">${t.loading}</span></div>
                </div>
            </div>
        `;
        const tradePane = `
            <div class="dashboard-card" style="margin-bottom:16px;">
                <h3 style="color:#fff; margin:0 0 5px; font-size:16px;">${t.operationBuilderTitle}</h3>
                <p style="color:var(--text-muted); font-size:13px; line-height:1.5; margin:0 0 14px;">${t.operationBuilderDesc}</p>
                <div style="display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px;">
                    <label style="color:var(--text-muted); font-size:12px;">${t.operationSourceNetwork}<select id="operationSourceNetwork" class="auth-input" onchange="handleOperationSourceNetworkChange()" style="margin-top:5px; font-size:13px; padding:10px 12px;">${sourceNetworkOptions}</select></label>
                    <label style="color:var(--text-muted); font-size:12px;">${t.operationSourceAsset}<input id="operationSourceAssetSearch" class="auth-input" placeholder="${t.universalBridgeTokenSearch}" oninput="filterUniversalBridgeTokenSelect('operationSourceAsset')" style="margin-top:5px; font-size:12px; padding:8px 10px;"><select id="operationSourceAsset" class="auth-input" onchange="handleOperationSourceTokenChange()" disabled style="margin-top:5px; font-size:13px; padding:10px 12px;"><option value="">${t.universalBridgeTokensLoading}</option></select></label>
                    <label style="color:var(--text-muted); font-size:12px;">${t.operationDestinationNetwork}<select id="operationDestinationNetwork" class="auth-input" onchange="handleOperationDestinationNetworkChange()" style="margin-top:5px; font-size:13px; padding:10px 12px;"><option value="Base">Base</option>${bridgeDestinationOptions}</select></label>
                    <label style="color:var(--text-muted); font-size:12px;">${t.operationReceiveAsset}<input id="operationReceiveAssetSearch" class="auth-input" placeholder="${t.universalBridgeTokenSearch}" oninput="filterUniversalBridgeTokenSelect('operationReceiveAsset')" style="margin-top:5px; font-size:12px; padding:8px 10px;"><select id="operationReceiveAsset" class="auth-input" onchange="handleOperationDestinationTokenChange()" disabled style="margin-top:5px; font-size:13px; padding:10px 12px;"><option value="">${t.universalBridgeTokensLoading}</option></select></label>
                    <label style="color:var(--text-muted); font-size:12px; grid-column:1 / -1;">${t.operationAmount}<input id="operationAmount" inputmode="decimal" placeholder="0.01" oninput="validateOperationAmount()" class="auth-input" style="margin-top:5px; font-size:13px; padding:10px 12px;"><div id="operationAmountUsd" style="color:#c4b5fd; font-size:14px; font-weight:700; margin-top:6px;"></div></label>
                </div>
                <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; margin-top:7px;">
                    <div id="operationAmountAvailability" style="font-size:12px; color:var(--text-muted);">${t.operationAmountBalanceLoading}</div>
                    <button type="button" onclick="useOperationMaxAmount()" class="btn-dark-sm" style="padding:6px 10px; font-size:11px; white-space:nowrap;">${t.operationAmountMax}</button>
                </div>
                <div id="operationWalletStatus" style="display:none;"></div>
                <div id="operationRouteSummary" style="display:none;"></div>
                ${renderInterfaceHint('universal-bridge-catalog', t.universalBridgeTokensLoading, 'success', 'universalBridgeCatalogStatus', 'ⓘ')}
                ${universalBridgePane}${swapPane}${bridgePane}
            </div>
        `;
        const defiPane = `<div class="dashboard-card" style="margin-bottom:16px;"><h3 style="color:#fff; margin:0 0 5px; font-size:16px;">${t.defiSupplyTitle}</h3><p style="color:var(--text-muted); font-size:13px; line-height:1.55; margin:0 0 12px;">${t.defiSupplyDesc}</p>${renderInterfaceHint('defi-supply-safety', t.defiSupplySafety, 'warning', '', '🛡️')}<label style="display:block; color:var(--text-muted); font-size:12px; margin-top:13px;">${t.defiSupplyAmount}<input id="aaveSupplyAmount" inputmode="decimal" placeholder="10" class="auth-input" style="margin-top:5px; font-size:13px; padding:10px 12px;"></label><button type="button" id="aaveSupplyQuoteButton" onclick="requestAaveUsdcSupplyQuote()" class="btn-purple-lg" style="font-size:13px; padding:10px 14px; width:auto; margin-top:12px;">${t.defiSupplyCheck}</button><div id="aaveSupplyResult" style="font-size:12px; line-height:1.5; margin-top:11px;"></div></div><div class="dashboard-card"><div style="display:flex; align-items:flex-start; justify-content:space-between; gap:12px;"><div><h3 style="color:#fff; margin:0 0 5px; font-size:16px;">${t.defiOverviewTitle}</h3><p style="color:var(--text-muted); font-size:13px; line-height:1.55; margin:0;">${t.defiOverviewDesc}</p></div><button type="button" id="defiRefreshButton" onclick="loadDefiOverview(true)" class="btn-dark-sm" style="padding:7px 10px; font-size:12px; white-space:nowrap;">${t.defiRefresh}</button></div>${renderInterfaceHint('defi-read-only', t.defiReadOnlyNote, 'info', '', '🛡️')}<div id="defiOverviewPanel" style="margin-top:12px;"><span style="color:var(--text-muted); font-size:13px;">${t.loading}</span></div><div style="border-top:1px solid var(--border-color); margin-top:16px; padding-top:14px;"><div style="display:flex; align-items:flex-start; justify-content:space-between; gap:12px;"><div><div style="color:#fff; font-size:13px; font-weight:700;">${t.defiHistoryTitle}</div><div style="color:var(--text-muted); font-size:12px; line-height:1.45; margin-top:4px;">${t.defiHistoryDesc}</div></div><button type="button" onclick="loadAaveDefiHistory()" class="btn-dark-sm" style="padding:7px 10px; font-size:12px; white-space:nowrap;">${t.defiHistoryRefresh}</button></div><div id="defiHistoryPanel" style="margin-top:10px;"><span style="color:var(--text-muted); font-size:12px;">${t.loading}</span></div></div></div>`;
        const questsPane = `<div class="dashboard-card"><h3 style="color:#fff; margin-top:0; font-size:16px;">${t.activityQuestsTitle}</h3><p style="color:var(--text-muted); font-size:13px; line-height:1.55;">${t.activityQuestsDesc}</p><button type="button" onclick="switchMenu(null, 'Looter')" class="btn-dark-sm" style="margin-top:8px; padding:10px 14px; border-color:#7c3aed;">${t.activityQuestsOpen}</button></div>`;
        const journalFilters = [
            ['all', t.operationsJournalAll], ['pending', t.operationsJournalPending], ['completed', t.operationsJournalCompleted],
        ].map(([key, label]) => `<button type="button" onclick="setOperationsJournalFilter('${key}')" style="background:${operationsJournalFilter === key ? 'rgba(124,58,237,.22)' : 'var(--bg-main)'}; color:${operationsJournalFilter === key ? '#e9d5ff' : 'var(--text-muted)'}; border:1px solid ${operationsJournalFilter === key ? '#7c3aed' : 'var(--border-color)'}; padding:7px 10px; border-radius:8px; cursor:pointer; font-size:12px;">${label}</button>`).join('');
        const journalAction = operationsJournalFilter === 'pending'
            ? `<button type="button" id="operationsJournalCheckButton" onclick="checkPendingOperations(this)" class="btn-dark-sm" style="padding:7px 10px; font-size:12px; white-space:nowrap; border-color:#7c3aed;">${t.operationsJournalCheckPending}</button>`
            : `<button type="button" onclick="loadOperationsJournal()" class="btn-dark-sm" style="padding:7px 10px; font-size:12px; white-space:nowrap;">${t.operationsJournalRefresh}</button>`;
        const journalPane = `<div class="dashboard-card"><div style="display:flex; align-items:flex-start; justify-content:space-between; gap:12px;"><div><h3 style="color:#fff; margin:0 0 5px; font-size:16px;">${t.operationsJournalTitle}</h3><p style="color:var(--text-muted); font-size:13px; line-height:1.5; margin:0;">${t.operationsJournalDesc}</p></div>${journalAction}</div><div style="display:flex; flex-wrap:wrap; gap:7px; margin-top:14px;">${journalFilters}</div><div id="operationsJournalList" style="margin-top:12px;"><span style="color:var(--text-muted); font-size:13px;">${t.loading}</span></div></div>`;
        const activePane = { swap: tradePane, plan: planPane, defi: defiPane, quests: questsPane, journal: journalPane }[activityPane];
        centerHtml = `<div class="dashboard-card" style="margin-bottom:16px;"><h3 style="color:#fff; margin:0 0 5px; font-size:17px;">${t.activityTitle}</h3><p style="color:var(--text-muted); font-size:13px; line-height:1.5; margin:0 0 14px;">${t.activityDesc}</p><div style="display:flex; flex-wrap:wrap; gap:8px;">${activityTabs}</div></div>${activePane}`;
        if (activityPane === 'plan') setTimeout(() => { loadTransactionPlan(); loadActionReminder(); }, 50);
        if (activityPane === 'swap') setTimeout(() => { loadOperationBuilderWalletStatus(); updateOperationBuilder(); loadUniversalBridgeHistory(); }, 50);
        if (activityPane === 'journal') setTimeout(loadOperationsJournal, 50);
        if (activityPane === 'defi') setTimeout(() => { loadDefiOverview(); loadAaveDefiHistory(); }, 50);
    } else if (section === 'Farming' && false) {
        const plannerNetworkOptions = NETWORKS_CONFIG.map(net => `<option value="${net.key}">${net.name} (${net.symbol})</option>`).join('');
        centerHtml = `
            <div class="dashboard-card">
                <h3 style="color:#fff; margin-top:0; font-size:16px;">${t.baseSwapTitle}</h3>
                <p style="color:var(--text-muted); font-size:13px; line-height:1.5;">${t.baseSwapDesc}</p>
                <div style="background:rgba(59,130,246,.08); border:1px solid rgba(59,130,246,.25); color:#bfdbfe; padding:10px 12px; border-radius:10px; font-size:12px; line-height:1.5; margin:12px 0;">${t.baseSwapSafety}</div>
                <div style="display:grid; grid-template-columns:minmax(0,1fr) auto minmax(0,1fr); gap:10px; align-items:end;">
                    <label style="color:var(--text-muted); font-size:12px;">${t.baseSwapYouPay}<input id="baseSwapAmount" inputmode="decimal" class="auth-input" placeholder="0.01" style="font-size:13px; padding:10px 12px; margin-top:5px;"></label>
                    <div style="color:#c4b5fd; padding:0 0 11px; font-size:18px;">→</div>
                    <div style="background:var(--bg-main); border:1px solid var(--border-color); border-radius:10px; padding:10px 12px;"><div style="color:var(--text-muted); font-size:11px;">${t.baseSwapYouReceive}</div><div style="color:#fff; margin-top:4px; font-weight:700;">USDC</div></div>
                </div>
                <div style="color:var(--text-muted); font-size:12px; margin-top:10px;">${t.baseSwapSlippage}</div>
                <button type="button" id="baseSwapQuoteButton" onclick="requestBaseSwapQuote()" class="btn-purple-lg" style="font-size:13px; padding:12px 18px; width:auto; margin-top:12px;">${t.baseSwapGetQuote}</button>
                <div id="baseSwapResult" style="font-size:12px; line-height:1.5; margin-top:12px;"></div>
            </div>
            <div class="dashboard-card">
                <h3 style="color: #fff; margin-top: 0; font-size: 16px;">${t.farmTitle}</h3>
                <p style="color: var(--text-muted); font-size: 13px; line-height: 1.5; margin-bottom: 12px;">${t.farmDesc}</p>
                <div style="background:rgba(59,130,246,.08); border:1px solid rgba(59,130,246,.25); color:#bfdbfe; padding:10px 12px; border-radius:10px; font-size:12px; line-height:1.5; margin-bottom:14px;">${t.planSigningNote}</div>
                <label style="color: var(--text-muted); font-size: 12px; display: block; margin-bottom: 6px;">${t.netSelect}</label>
                <select class="auth-input" id="planNetwork" style="margin-bottom: 12px; font-size: 13px; padding: 10px 12px;">${plannerNetworkOptions}</select>
                <div style="display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px;">
                    <label style="color:var(--text-muted); font-size:12px;">${t.planOps}<input id="planOperations" type="number" min="1" max="1000" value="1" oninput="updateTransactionPlanEstimate()" class="auth-input" style="margin-top:5px; font-size:13px; padding:10px 12px;"></label>
                    <label style="color:var(--text-muted); font-size:12px;">${t.planMaxCost}<input id="planMaxCost" type="number" min="0" step="0.01" value="1" oninput="updateTransactionPlanEstimate()" class="auth-input" style="margin-top:5px; font-size:13px; padding:10px 12px;"></label>
                    <label style="color:var(--text-muted); font-size:12px;">${t.planReserve}<input id="planReserve" type="number" min="0" step="0.01" value="0" oninput="updateTransactionPlanEstimate()" class="auth-input" style="margin-top:5px; font-size:13px; padding:10px 12px;"></label>
                    <label style="color:var(--text-muted); font-size:12px;">${t.planDailyCap}<input id="planDailyCap" type="number" min="0" step="0.01" value="10" oninput="updateTransactionPlanEstimate()" class="auth-input" style="margin-top:5px; font-size:13px; padding:10px 12px;"></label>
                    <label style="color:var(--text-muted); font-size:12px; grid-column:1 / -1;">${t.planMonthlyCap}<input id="planMonthlyCap" type="number" min="0" step="0.01" value="50" oninput="updateTransactionPlanEstimate()" class="auth-input" style="margin-top:5px; font-size:13px; padding:10px 12px;"></label>
                </div>
                <div style="display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; margin-top:14px;">
                    <div style="background:var(--bg-main); border:1px solid var(--border-color); border-radius:10px; padding:12px;"><div style="font-size:11px; color:var(--text-muted);">${t.planEstimated}</div><div id="planEstimateValue" style="font-size:18px; color:#fff; font-weight:700; margin-top:4px;">$0.00</div></div>
                    <div style="background:var(--bg-main); border:1px solid var(--border-color); border-radius:10px; padding:12px;"><div style="font-size:11px; color:var(--text-muted);">${t.planRiskCap}</div><div id="planRiskCapValue" style="font-size:18px; color:#fff; font-weight:700; margin-top:4px;">$0.00</div></div>
                </div>
                <div id="planBudgetWarning" style="display:none; color:#fca5a5; font-size:12px; margin-top:10px;"></div>
                <button type="button" onclick="saveTransactionPlan()" class="btn-purple-lg" style="font-size:13px; padding:12px 20px; width:auto; margin-top:14px;">${t.planSave}</button>
            </div>
        `;
        setTimeout(() => {
            loadTransactionPlan();
        }, 50);
    } else if (section === 'Wallets') {
        const isTipHidden = localStorage.getItem('hideProxyTip') === 'true' || !areInterfaceHintsEnabled();
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
                <div style="margin-top: 12px; color: var(--text-muted); font-size: 12px; line-height: 1.5;">${t.slotsPurchaseUnavailable}</div>
                <div id="buySlotMsg" style="margin-top: 6px; font-size:12px;"></div>
            </div>
            <div class="dashboard-card">
                <h3 style="color: #fff; margin-top: 0; font-size: 16px;">${t.walletConnectTitle}</h3>
                <p style="color: var(--text-muted); font-size: 13px; line-height: 1.5; margin-bottom: 10px;">${t.walletConnectDesc}</p>
                <div style="display:flex; flex-wrap:wrap; gap:8px;">
                    <button type="button" onclick="connectBaseWallet()" class="btn-dark-sm" style="width:auto; padding:10px 14px;">${t.btnConnectBase}</button>
                    <button type="button" onclick="connectWalletConnectBase()" class="btn-dark-sm" style="width:auto; padding:10px 14px; border-color:#7c3aed;">${t.btnConnectWalletConnect}</button>
                    <button type="button" id="disconnectBaseWalletButton" onclick="disconnectBaseWalletSession()" class="btn-dark-sm" style="display:none; width:auto; padding:10px 14px; border-color:#ef4444; color:#fca5a5;">${t.walletDisconnect}</button>
                </div>
                <div id="baseWalletConnectionStatus" style="display:none; color:#86efac; font-size:12px; margin-top:8px;"></div>
            </div>
            <div class="dashboard-card">
                <h3 style="color: #fff; margin-top: 0; font-size: 16px;">${t.walAddTitle}</h3>
                <div style="display: flex; flex-direction: column; gap: 10px;">
                    <input type="text" id="newWalletLabel" maxlength="40" placeholder="${t.walletLabelPlaceholder}" class="auth-input" style="font-size: 13px; padding: 10px 12px;">
                    <input type="text" id="newWalletAddress" placeholder="${t.phAddr}" class="auth-input" style="font-size: 13px; padding: 10px 12px;">
                    ${proxyTipHtml}
                    <input type="text" id="newWalletProxy" placeholder="${t.phProxy}" class="auth-input" style="font-size: 13px; padding: 10px 12px;">
                    <div style="display:flex; gap:8px; align-items:flex-start; padding:9px 10px; border:1px solid rgba(124,58,237,.28); background:rgba(124,58,237,.08); border-radius:9px; color:#d8b4fe; font-size:12px; line-height:1.4;">
                        <span aria-hidden="true">✓</span><span>${t.walletProfileHint}</span>
                    </div>
                    <button type="button" onclick="addNewWalletToDB()" class="btn-modal-primary" style="margin-top:4px; padding: 12px; font-size: 14px;">${t.btnAddWal}</button>
                </div>
                <div id="walletResponseMsg" style="margin-top: 8px; font-size:12px;"></div>
            </div>
        `;
        setTimeout(() => {
            updateBaseWalletConnectionState();
            loadWalletsFromDB();
            injectWalletSecurityBanner();
        }, 50);
    } else if (section === 'Networks') {
        const networksHtml = NETWORKS_CONFIG.map(net => `
            <div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-main); padding:16px 20px; border-radius:16px; margin-bottom:10px; border:1px solid var(--border-color);">
                <div style="display:flex; align-items:center; gap:16px;">
                    <div style="display:flex; align-items:center; justify-content:center; width:32px; height:32px;">${net.icon}</div>
                    <div style="display: flex; flex-direction: column; gap: 4px;">
                        <div style="color:#fff; font-weight:700; font-size:15px;">${net.name} <span style="font-size: 12px; color: var(--text-muted); font-weight: normal;">(${net.symbol})</span></div>
                        <div style="font-size:13px; color: var(--text-muted);">${t.gasLabel} <span id="gas-${net.key}" style="color:#eab308; font-weight:bold;">${t.loading}</span> <span id="gas-status-${net.key}" style="font-size:11px; font-weight:700;"></span></div>
                        <div style="color: #93c5fd; font-size: 12px; line-height:1.4;">${t.networkEligibilityStatus}</div>
                    </div>
                </div>
                <div>
                    <a href="${net.explorer}" target="_blank" style="text-decoration:none; background:#1f1f1f; color:#fff; padding:8px 14px; border-radius:10px; font-size:13px; border:1px solid var(--border-color); transition: background 0.2s;" onmouseover="this.style.background='#333'" onmouseout="this.style.background='#1f1f1f'">${t.btnExp}</a>
                </div>
            </div>
        `).join('');

        const networkGuideHtml = !areInterfaceHintsEnabled() ? '' : `
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
                <p style="color: var(--text-muted); font-size: 12px; margin: -6px 0 14px; line-height: 1.5;">${t.gasStatusNote}</p>
                
                ${networkGuideHtml}

                <div>${networksHtml}</div>
            </div>
        `;

        setTimeout(async () => {
            for (let net of NETWORKS_CONFIG) {
                try {
                    const res = await fetch(`/api/gas/${net.key}`);
                    const data = await res.json();
                    const el = document.getElementById(`gas-${net.key}`);
                    if (el) el.innerText = data.gas || "N/A";
                    const statusEl = document.getElementById(`gas-status-${net.key}`);
                    if (statusEl) {
                        const level = data.gas_level || 'unavailable';
                        const levelKey = `gas${level.charAt(0).toUpperCase()}${level.slice(1)}`;
                        const colors = { low: '#22c55e', medium: '#eab308', high: '#ef4444', unavailable: '#a3a3a3' };
                        statusEl.innerText = translations[currentLang][levelKey] || translations[currentLang].gasUnavailable;
                        statusEl.style.color = colors[level] || colors.unavailable;
                    }
                } catch(e) {
                    const el = document.getElementById(`gas-${net.key}`);
                    if (el) el.innerText = "N/A";
                    const statusEl = document.getElementById(`gas-status-${net.key}`);
                    if (statusEl) {
                        statusEl.innerText = translations[currentLang].gasUnavailable;
                        statusEl.style.color = '#a3a3a3';
                    }
                }
            }
        }, 100);
    }

    // Общий вывод дашборда
    content.innerHTML = `
        <div class="dashboard-topbar">
            <div class="dashboard-identity">
                <span class="dashboard-identity__mark">AX</span>
                <span class="dashboard-identity__copy">
                    <b>${username}</b>
                    <small>${userPlan} · ${t.subActive} · ${subscriptionDaysLeft} ${t.days}</small>
                </span>
            </div>
            <nav class="dashboard-topnav" aria-label="${t.menuMain}">
                <button type="button" class="dashboard-nav-item ${section === 'Account' ? 'active' : ''}" onclick="switchMenu(this, 'Account')">${t.menuAcc}</button>
                <button type="button" class="dashboard-nav-item ${section === 'Looter' ? 'active' : ''}" onclick="switchMenu(this, 'Looter')">${t.menuLooter}</button>
                <button type="button" class="dashboard-nav-item ${section === 'Farming' ? 'active' : ''}" onclick="switchMenu(this, 'Farming')">${t.menuFarm}</button>
                <button type="button" class="dashboard-nav-item ${section === 'Wallets' ? 'active' : ''}" onclick="switchMenu(this, 'Wallets')">${t.menuWallets}</button>
                <button type="button" class="dashboard-nav-item ${section === 'Networks' ? 'active' : ''}" onclick="switchMenu(this, 'Networks')">${t.menuNet}</button>
                <button type="button" class="dashboard-nav-item ${section === 'Settings' ? 'active' : ''}" onclick="switchMenu(this, 'Settings')">${t.menuSet}</button>
            </nav>
            <button type="button" class="dashboard-logout" onclick="logoutUser()">${t.menuExit}</button>
        </div>
        <div class="dashboard-main">${centerHtml}</div>
    `;
}
