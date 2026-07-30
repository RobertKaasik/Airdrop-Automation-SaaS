document.getElementById('main-logo-btn').addEventListener('click', function(e) {
    e.preventDefault();
    returnToMainSite();
});

window.addEventListener('DOMContentLoaded', () => {
    const line = document.getElementById('preloader-line');
    if(line) {
        line.style.width = '60%';
        setTimeout(() => { line.style.width = '100%'; }, 300);
        setTimeout(() => { line.style.opacity = '0'; }, 700);
    }
});

let currentLang = 'ru';
let isLoggedIn = false;
let currentSection = 'Looter';
let telegramLinked = false;
let selectedNetwork = 'Base';
let activeSelectedWalletId = null;
let userPlan = 'Standard';
let deviceFingerprint = generateDeviceFingerprint();
let subscriptionStatus = 'active';
let subscriptionDaysLeft = 30;
let renewalPrice = 50;
let pendingLoginCredentials = null;
const PLAN_PRICES = { Standard: 95, Pro: 150, Premium: 280 };
const PLAN_LABELS = { Standard: 'Standard', Pro: 'PRO Фермер', Premium: 'Premium VIP' };
const clientSessionId = getOrCreateClientSessionId();
let paymentAccessToken = sessionStorage.getItem('ax_payment_token') || '';
let paymentUnlocked = sessionStorage.getItem('ax_paid_session_id') === clientSessionId && !!paymentAccessToken;

const MASTER_WALLET = "0x5e5316Dea1c44d220d4c60A5fcC2949E5A06Fc66";

const NETWORKS_CONFIG = [
    { name: "Ethereum", symbol: "ETH", address: MASTER_WALLET, icon: "Ξ", explorer: "https://etherscan.io/address/" },
    { name: "Base", symbol: "ETH", address: MASTER_WALLET, icon: "🔵", explorer: "https://basescan.org/address/" },
    { name: "Arbitrum", symbol: "ETH", address: MASTER_WALLET, icon: "🔷", explorer: "https://arbiscan.io/address/" },
    { name: "Linea", symbol: "ETH", address: MASTER_WALLET, icon: "⬛", explorer: "https://lineascan.build/address/" },
    { name: "Solana", symbol: "SOL", address: "8Kv6xVx...iRJeS", icon: "🟣", explorer: "https://solscan.io/account/" },
    { name: "BNB Chain", symbol: "BNB", address: MASTER_WALLET, icon: "🟡", explorer: "https://bscscan.com/address/" },
    { name: "Polygon", symbol: "POL", address: MASTER_WALLET, icon: "🟣", explorer: "https://polygonscan.com/address/" },
    { name: "Optimism", symbol: "OP", address: MASTER_WALLET, icon: "🔴", explorer: "https://optimistic.etherscan.io/address/" },
    { name: "Tron", symbol: "TRX", address: "TJpU6v7...nSvdE", icon: "🔴", explorer: "https://tronscan.org/#/address/" }
];

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
        const canvasData = canvas.toDataURL();
        const raw = [
            canvasData,
            navigator.userAgent,
            navigator.language,
            screen.width + 'x' + screen.height,
            Intl.DateTimeFormat().resolvedOptions().timeZone
        ].join('###');
        let hash = 0;
        for (let i = 0; i < raw.length; i++) {
            hash = ((hash << 5) - hash) + raw.charCodeAt(i);
            hash |= 0;
        }
        return 'fp_' + Math.abs(hash).toString(16);
    } catch (e) {
        return 'fp_unknown';
    }
}

const translations = {
    ru: {
        title: "AIRDROP-X — Cyberpunk SaaS Panel",
        login: "Войти", logout: "Выйти", langCode: "RU",
        heroTitle: "Универсальный инструмент<br>для автоматизации и сбора Airdrop.",
        heroDesc: "Фармите поинты, сканируйте кошельки на наличие распределений и клеймите аирдропы в один клик с защитой Anti-Sybil.",
        farmBtn: "Получить доступ", settingsBtn: "Подробнее",
        bannerText: "Приватное ПО с ограниченным количеством слотов для защиты от детектирования.",
        featuresHeading: "Возможности платформы", faqHeading: "Часто задаваемые вопросы",
        c1t: "Drop Scanner & Looter", c1d: "Автоматический поиск доступных для клейма аирдропов и ретродропов по всем подключенным кошелькам.",
        c2t: "Multi-Chain Swaps & Bridges", c2d: "Рандомизированные кроссчейн свапы и транзакции в сетях LayerZero, Base, Arbitrum и ZkSync для набива объемов.",
        c3t: "Sybil Shield", c3d: "Имитация паттернов реального пользователя и интеллектуальное распределение газа без связей между кошельками.",
        
        dashTitle: "Панель поиска и авто-сбора лута (Claim Looter)",
        dashDesc: "Сканируйте свои кошельки на наличие незабранных наград и запускайте авто-фарминг объема.",
        logInit: "[System] Антифрод-ядро инициализировано. Ожидание сканирования...",
        scanBtn: "🔍 Запустить авто-сбор (Claim Looter)",
        farmMenu: "Авто-Фарминг", tasksMenu: "Активные задачи", proxyMenu: "Прокси Чекинг", walletsMenu: "Кошельки", statsMenu: "Статистика", billingMenu: "Биллинг и Подписка", settingsMenu: "Настройки", networksMenu: "Сети & Адреса",
        
        farmTitle: "🌾 Anti-Sybil Swaps & Bridges (Фарм объемов)",
        farmDesc: "Запуск боевого ядра с рандомизацией пауз и порядка воркеров.",
        netSelectLabel: "Целевая сеть для фарма:",
        startFarmBtn: "▶ Запустить Anti-Sybil Ядро",
        
        tasksTitle: "⚡ Очередь активных задач (Live Queue)",
        tasksDesc: "Мониторинг запущенных скриптов накрутки объемов и клейма по кошелькам.",
        schedulerToggleLabel: "Включить фоновый планировщик",
        schedulerLockedText: "🔒 Доступно только на тарифах PRO и Premium"
    },
    en: {
        title: "AIRDROP-X — Cyberpunk SaaS Panel",
        login: "Login", logout: "Logout", langCode: "US",
        heroTitle: "Universal Tool<br>for Airdrop Automation & Claiming.",
        heroDesc: "Farm points, scan wallets for allocations, and claim airdrops in one click with robust Anti-Sybil protection.",
        farmBtn: "Get Access", settingsBtn: "Details",
        bannerText: "Private software with limited slots to ensure maximum safety and reliability.",
        featuresHeading: "Platform Features", faqHeading: "Frequently Asked Questions",
        c1t: "Drop Scanner & Looter", c1d: "Automatic search for claimable airdrops and retro-drops across all connected wallets.",
        c2t: "Multi-Chain Swaps & Bridges", c2d: "Randomized cross-chain swaps and transactions across LayerZero, Base, Arbitrum, and ZkSync.",
        c3t: "Sybil Shield", c3d: "Simulation of real user behavioral patterns and smart gas distribution without wallet links.",
        
        dashTitle: "Airdrop Search & Claim Dashboard",
        dashDesc: "Scan your wallets for unclaimed rewards and launch automated volume farming.",
        logInit: "[System] Anti-sybil core initialized. Waiting for scan...",
        scanBtn: "🔍 Run Claim Looter",
        farmMenu: "Auto-Farming", tasksMenu: "Active Tasks", proxyMenu: "Proxy Checker", walletsMenu: "Wallets", statsMenu: "Statistics", billingMenu: "Billing & Subscription", settingsMenu: "Settings", networksMenu: "Networks & Addresses",
        
        farmTitle: "🌾 Anti-Sybil Swaps & Bridges",
        farmDesc: "Launch core engine via FastAPI backend with randomized delays.",
        netSelectLabel: "Target Network:",
        startFarmBtn: "▶ Start Anti-Sybil Engine",
        
        tasksTitle: "⚡ Live Task Queue",
        tasksDesc: "Monitoring running volume generation scripts and claims across wallets.",
        schedulerToggleLabel: "Enable background scheduler",
        schedulerLockedText: "🔒 Available only on PRO and Premium plans"
    },
    zh: {
        title: "AIRDROP-X — Cyberpunk SaaS Panel",
        login: "登录", logout: "登出", langCode: "CN",
        heroTitle: "用于空投自动化与<br>领取的通用工具。",
        heroDesc: "使用强大的防女巫保护，一键刷取积分、扫描钱包额度并领取空投。",
        farmBtn: "获取权限", settingsBtn: "了解详情",
        bannerText: "名额有限的私有软件，确保最高安全性和可靠性。",
        featuresHeading: "平台功能", faqHeading: "常见问题",
        c1t: "空投扫描与领取", c1d: "自动在所有连接的钱包中搜索可领取的空投和retro-drop。",
        c2t: "多链 跨链与兑换", c2d: "在 LayerZero、Base、Arbitrum 和 ZkSync 网络中进行随机跨链兑换与交易。",
        c3t: "防女巫盾", c3d: "模拟真实用户的行为特征模式，智能分配gas且无钱包关联。",
        
        dashTitle: "空投搜索与领取面板",
        dashDesc: "扫描您的钱包以查找未认领的奖励并启动自动化刷量农场。",
        logInit: "[System] Core initialized...",
        scanBtn: "🔍 运行自动领取 (Looter)",
        farmMenu: "自动刷量", tasksMenu: "活动任务", proxyMenu: "代理检测", walletsMenu: "钱包管理", statsMenu: "数据统计", billingMenu: "账单与订阅", settingsMenu: "系统设置", networksMenu: "网络与地址",
        
        farmTitle: "🌾 多链跨链与兑换",
        farmDesc: "通过 FastAPI 后端启动核心引擎。",
        netSelectLabel: "目标网络：",
        startFarmBtn: "▶ 启动防女巫引擎",
        
        tasksTitle: "⚡ 实时任务队列",
        tasksDesc: "监控各钱包正在运行的刷量脚本和领取状态。",
        schedulerToggleLabel: "启用后台计划任务",
        schedulerLockedText: "🔒 仅限 PRO 和 Premium 套餐使用"
    }
};

function returnToMainSite() {
    isLoggedIn = false;
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
    currentLang = lang;
    const t = translations[lang];
    if (!t) return;
    document.getElementById('current-lang-badge').innerText = t.langCode;
    document.getElementById('current-lang-text').innerText = t.langCode;
    document.getElementById('langMenu').classList.remove('show');
}

function scrollToFeatures() {
    document.getElementById('features-section').scrollIntoView({ behavior: 'smooth' });
}

function openPricingModal() { document.getElementById('pricingModal').classList.add('show'); }
function closePricingModal() { document.getElementById('pricingModal').classList.remove('show'); }
function handlePricingOverlayClick(event) {
    if (event.target.id === 'pricingModal') closePricingModal();
}

function selectPlanAndRegister(planName, price) {
    closePricingModal();
    userPlan = planName;
    const activationPrice = Number(price);
    localStorage.setItem('selected_plan', planName);
    localStorage.setItem('selected_price', String(activationPrice));
    clearPaymentAccess();
    openModal('payment');
}

function closeAuthModal() {
    document.getElementById('authModal').classList.remove('show');
}

// Добавь эту переменную и слушатель в самое начало файла app.js (после инициализации переменных)
let mousedownOverlayTarget = null;
window.addEventListener('mousedown', (e) => {
    mousedownOverlayTarget = e.target;
});

// И замени функции закрытия/клика на фоны на эти надежные варианты:
function handleOverlayClick(event) {
    if (event.target.id === 'authModal' && mousedownOverlayTarget.id === 'authModal') {
        closeAuthModal();
    }
}

function handlePricingOverlayClick(event) {
    if (event.target.id === 'pricingModal' && mousedownOverlayTarget.id === 'pricingModal') {
        closePricingModal();
    }
}

function handleWalletOverlayClick(event) {
    if (event.target.id === 'walletActionModal' && mousedownOverlayTarget.id === 'walletActionModal') {
        closeWalletActionModal();
    }
}

function handleSheetOverlayClick(event) {
    if (event.target.id === 'bottomSheetOverlay' && mousedownOverlayTarget.id === 'bottomSheetOverlay') {
        closeBottomSheet();
    }
}

function openModal(type) {
    const modal = document.getElementById('authModal');
    const container = document.getElementById('modalContainer');

    if (type === 'register' && (!paymentUnlocked || !paymentAccessToken)) {
        type = 'payment';
    }

    modal.classList.add('show');

    if (type === 'login') {
        container.innerHTML = `
            <div class="modal-logo">
                <span>⚡ Войти</span>
                <span onclick="closeAuthModal()" style="cursor: pointer; color: #b19cd9; font-size: 20px;">✕</span>
            </div>
            <div class="modal-desc">Новичок? <span style="color:#c77dff; cursor:pointer; text-decoration:underline;" onclick="openModal('register')">Создать аккаунт</span></div>
            <div class="input-group">
                <label style="font-size: 11px; color: #b19cd9; display: block; margin-bottom: 4px;">Эл. почта</label>
                <input type="email" class="auth-input" placeholder="Email" id="loginEmail">
            </div>
            <div class="input-group">
                <label style="font-size: 11px; color: #b19cd9; display: block; margin-bottom: 4px;">Пароль</label>
                <div class="password-wrapper">
                    <input type="password" class="auth-input" placeholder="Пароль" id="loginPass">
                    <span class="password-toggle-icon" onclick="togglePasswordVisibility('loginPass', this)">👁️</span>
                </div>
            </div>
            <button type="button" class="btn-modal-primary" onclick="validateLogin()">Войти</button>
            <div id="loginErrorContainer"></div>
        `;
    } else if (type === 'payment') {
        const chosenPlan = localStorage.getItem('selected_plan') || 'Standard';
        const basePrice = Number(localStorage.getItem('selected_price') || PLAN_PRICES[chosenPlan] || 95);
        const planLabel = PLAN_LABELS[chosenPlan] || chosenPlan;
        const displayAmount = (basePrice + 0.47).toFixed(2);

        container.innerHTML = `
            <div class="modal-logo">
                <span>💳 Оплата: ${planLabel}</span>
                <span onclick="closeAuthModal()" style="cursor: pointer; color: #b19cd9; font-size: 20px;">✕</span>
            </div>
            <div class="modal-desc">Шаг 1 из 2: Выберите сеть, переведите точную сумму и укажите TXID.</div>
            
            <div style="margin-bottom: 12px;">
                <label style="font-size: 11px; color: #b19cd9; display: block; margin-bottom: 4px;">Сеть для оплаты:</label>
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px;">
                    <button type="button" class="btn-dark-sm" id="net-base" onclick="setPayNetwork('Base', '${MASTER_WALLET}', '${displayAmount}')" style="justify-content:center; background:rgba(157,78,221,0.3); border-color:#c77dff;">Base L2</button>
                    <button type="button" class="btn-dark-sm" id="net-arb" onclick="setPayNetwork('Arbitrum', '${MASTER_WALLET}', '${displayAmount}')" style="justify-content:center;">Arbitrum</button>
                    <button type="button" class="btn-dark-sm" id="net-eth" onclick="setPayNetwork('Ethereum', '${MASTER_WALLET}', '${displayAmount}')" style="justify-content:center;">Ethereum</button>
                </div>
            </div>

            <div style="background:#07050c; border:1px solid rgba(157,78,221,0.35); border-radius:14px; padding:12px; margin-bottom:12px; text-align:center;">
                <div style="font-size:11px; color:#b19cd9; margin-bottom:2px;">Сумма к оплате:</div>
                <div style="font-size:22px; color:#e0aaff; font-weight:800; margin-bottom:8px;">$${displayAmount}</div>
                
                <div style="font-size:11px; color:#b19cd9; margin-bottom:2px;">Кошелек (<span id="activePayNet">Base L2</span>):</div>
                <div style="background:#120c22; padding:6px 8px; border-radius:8px; font-family:monospace; font-size:11px; color:#fff; word-break:break-all; margin-bottom:6px;">${MASTER_WALLET}</div>
                
                <button type="button" id="copyWalletBtn" class="btn-dark-sm" style="margin: 0 auto; font-size: 11px; padding: 6px 12px;" onclick="copyWalletAddress('${MASTER_WALLET}', this)">📋 Копировать адрес</button>
                
                <div id="qrcodeContainer" style="display:flex; justify-content:center; margin:8px 0 0 0; background:#fff; padding:8px; border-radius:8px; width:120px; margin-left:auto; margin-right:auto;"></div>
            </div>

            <div class="input-group">
                <label style="font-size: 11px; color: #b19cd9; display: block; margin-bottom: 4px;">TXID (хэш транзакции)</label>
                <input type="text" class="auth-input" placeholder="0x..." id="txidInput">
            </div>

            <button type="button" id="paymentActionBtn" class="btn-modal-primary" onclick="startPlanPayment()">Подтвердить перевод ($${displayAmount})</button>
            <div id="paymentStatusContainer"></div>
            
            <div style="display: flex; justify-content: space-between; margin-top: 10px; font-size: 11px;">
                <span style="color:#c77dff; cursor:pointer; text-decoration:underline;" onclick="closeAuthModal(); openPricingModal();">К планам</span>
                <span style="color:#b19cd9; cursor:pointer; text-decoration:underline;" onclick="recoverSessionByTxid()">Уже оплатили? Восстановить</span>
            </div>
        `;

        setTimeout(() => renderPaymentQR(MASTER_WALLET, displayAmount), 100);
    } else if (type === 'register') {
        const chosenPlan = localStorage.getItem('selected_plan') || 'Standard';
        const fallbackPlanPrice = { Standard: '95', Pro: '150', Premium: '280' };
        const chosenPrice = Number(localStorage.getItem('selected_price') || fallbackPlanPrice[chosenPlan] || '95');
        const planDisplayNames = { Standard: 'Standard', Pro: 'PRO Фермер', Premium: 'Premium VIP' };
        const planLabel = planDisplayNames[chosenPlan] || chosenPlan;
        container.innerHTML = `
            <div class="modal-logo">
                <span>⚡ Регистрация: ${planLabel} ($${chosenPrice})</span>
                <span onclick="closeAuthModal()" style="cursor: pointer; color: #b19cd9; font-size: 20px;">✕</span>
            </div>
            <div class="input-group">
                <label style="font-size: 11px; color: #b19cd9; display: block; margin-bottom: 4px;">Эл. почта</label>
                <input type="email" class="auth-input" placeholder="Email" id="regEmail">
            </div>
            <div class="input-group">
                <label style="font-size: 11px; color: #b19cd9; display: block; margin-bottom: 4px;">Пароль</label>
                <div class="password-wrapper">
                    <input type="password" class="auth-input" placeholder="Пароль" id="regPass">
                    <span class="password-toggle-icon" onclick="togglePasswordVisibility('regPass', this)">👁️</span>
                </div>
            </div>
            <div class="input-group">
                <label style="font-size: 11px; color: #b19cd9; display: block; margin-bottom: 4px;">Код подтверждения</label>
                <div style="display: flex; gap: 8px;">
                    <input type="text" class="auth-input" placeholder="Код из письма" id="regCode" style="flex: 1; margin: 0;">
                    <button type="button" onclick="sendVerificationEmailCode()" style="background: #18102e; color: #c77dff; border: 1px solid rgba(157,78,221,0.4); padding: 0 14px; border-radius: 14px; font-size: 12px; font-weight: bold; cursor: pointer;">Отправить</button>
                </div>
            </div>
            <button type="button" class="btn-modal-primary" onclick="validateRegister()" style="margin-top: 8px;">Зарегистрироваться</button>
            <div id="errorContainer"></div>
        `;
    }
}

function setPayNetwork(netName, address, amount) {
    document.getElementById('activePayNet').innerText = netName;
    ['net-base', 'net-arb', 'net-eth'].forEach(id => {
        const btn = document.getElementById(id);
        if(btn) {
            btn.style.background = 'rgba(18, 12, 30, 0.8)';
            btn.style.borderColor = 'rgba(157, 78, 221, 0.3)';
        }
    });
    const activeBtn = document.getElementById('net-' + netName.toLowerCase().slice(0,3));
    if(activeBtn) {
        activeBtn.style.background = 'rgba(157,78,221,0.3)';
        activeBtn.style.borderColor = '#c77dff';
    }
    renderPaymentQR(address, amount);
}

function renderPaymentQR(walletAddress, displayAmount) {
    const qrEl = document.getElementById('qrcodeContainer');
    if (qrEl && window.qrcode) {
        try {
            qrEl.innerHTML = '';
            const qr = qrcode(0, 'M');
            qr.addData(`ethereum:${walletAddress}?value=${displayAmount}`);
            qr.make();
            qrEl.innerHTML = qr.createSvgTag({cellSize: 3, margin: 1});
        } catch(e) {
            qrEl.innerHTML = '<span style="font-size:10px; color:#000;">QR Error</span>';
        }
    }
}

function copyWalletAddress(address, btn) {
    navigator.clipboard.writeText(address);
    const originalText = btn.innerHTML;
    btn.innerHTML = '✅ Скопировано!';
    btn.style.borderColor = '#00d95f';
    btn.style.color = '#88ffaa';
    
    setTimeout(() => {
        btn.innerHTML = originalText;
        btn.style.borderColor = 'rgba(157, 78, 221, 0.3)';
        btn.style.color = '#e0aaff';
    }, 2000);
}

function openNetworkQRModal(netName, address, explorerUrl) {
    const modal = document.getElementById('authModal');
    const container = document.getElementById('modalContainer');
    modal.classList.add('show');

    container.innerHTML = `
        <div class="modal-logo">
            <span>Main / ${netName}</span>
            <span onclick="closeAuthModal()" style="cursor: pointer; color: #b19cd9; font-size: 20px;">✕</span>
        </div>
        
        <div style="background:#fff; padding:16px; border-radius:14px; width:180px; margin: 10px auto; display:flex; justify-content:center;" id="netQrContainer"></div>
        
        <div style="text-align:center; margin: 12px 0;">
            <div style="font-size:14px; font-weight:bold; color:#fff; margin-bottom:4px;">Адрес ${netName}</div>
            <div style="font-size:11px; color:#b19cd9; margin-bottom:10px;">Используйте этот адрес для получения токенов в сети ${netName}</div>
            <div style="background:#07050c; padding:8px; border-radius:8px; font-family:monospace; font-size:11px; color:#c77dff; word-break:break-all; margin-bottom:12px;">${address}</div>
        </div>

        <div style="display: flex; gap: 8px;">
            <button type="button" class="btn-dark-sm" style="flex:1; justify-content:center;" onclick="copyWalletAddress('${address}', this)">📋 Копировать адрес</button>
            <a href="${explorerUrl}${address}" target="_blank" class="btn-dark-sm" style="flex:1; justify-content:center; text-decoration:none;">🔍 В эксплорере</a>
        </div>
    `;

    setTimeout(() => {
        const qrEl = document.getElementById('netQrContainer');
        if (qrEl && window.qrcode) {
            try {
                qrEl.innerHTML = '';
                const qr = qrcode(0, 'M');
                qr.addData(address);
                qr.make();
                qrEl.innerHTML = qr.createSvgTag({cellSize: 5, margin: 2});
            } catch(e) {
                qrEl.innerHTML = 'QR Error';
            }
        }
    }, 100);
}

async function sendVerificationEmailCode() {
    const email = document.getElementById('regEmail').value.trim();
    const err = document.getElementById('errorContainer');
    if(!email) { err.innerHTML = `<div class="error-toast"><span>⚠️</span><span>Введите email!</span></div>`; return; }
    await fetch('/api/send-code', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
    err.innerHTML = `<div class="error-toast" style="background:#122218; border-color:#00d95f; color:#88ffaa;"><span>✅</span><span>Код отправлен на почту!</span></div>`;
}

function togglePasswordVisibility(inputId, iconElement) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const isHidden = input.type === 'password';
    input.type = isHidden ? 'text' : 'password';
    iconElement.textContent = isHidden ? '🙈' : '👁️';
}

async function startPlanPayment() {
    const chosenPlan = localStorage.getItem('selected_plan') || 'Standard';
    const basePrice = PLAN_PRICES[chosenPlan] || 95;
    const status = document.getElementById('paymentStatusContainer');
    const button = document.getElementById('paymentActionBtn');
    const txidInput = document.getElementById('txidInput');
    const txid = txidInput ? txidInput.value.trim() : '';

    if (!txid) {
        status.innerHTML = `<div class="error-toast" style="position: static; margin-top: 10px;"><span>⚠️</span><span>Введите TXID транзакции!</span></div>`;
        return;
    }

    button.disabled = true;
    button.style.opacity = '0.7';
    status.innerHTML = `<div class="error-toast" style="position: static; margin-top: 10px; background:#101827; border-color:#4f46e5; color:#c7d2fe;"><span>⏳</span><span>Проверка TXID...</span></div>`;

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
            status.innerHTML = `<div class="error-toast" style="position: static; margin-top: 10px;"><span>⚠️</span><span>${confirmData.detail || 'Ошибка подтверждения'}</span></div>`;
            button.disabled = false;
            button.style.opacity = '1';
            return;
        }

        paymentUnlocked = true;
        paymentAccessToken = confirmData.payment_token;
        sessionStorage.setItem('ax_payment_token', paymentAccessToken);
        sessionStorage.setItem('ax_paid_session_id', clientSessionId);
        sessionStorage.setItem('ax_paid_plan', chosenPlan);

        status.innerHTML = `<div class="error-toast" style="position: static; margin-top: 10px; background:#122218; border-color:#00d95f; color:#88ffaa;"><span>✅</span><span>Оплата подтверждена! Регистрация...</span></div>`;
        setTimeout(() => openModal('register'), 800);
    } catch (e) {
        status.innerHTML = `<div class="error-toast" style="position: static; margin-top: 10px;"><span>⚠️</span><span>Сетевая ошибка. Повторите попытку.</span></div>`;
        button.disabled = false;
        button.style.opacity = '1';
    }
}

async function validateRegister() {
    const email = document.getElementById('regEmail').value.trim();
    const pass = document.getElementById('regPass').value.trim();
    const code = document.getElementById('regCode').value.trim();
    const chosenPlan = localStorage.getItem('selected_plan') || 'Standard';
    const fallbackPlanPrice = { Standard: '95', Pro: '150', Premium: '280' };
    const chosenPrice = Number(localStorage.getItem('selected_price') || fallbackPlanPrice[chosenPlan] || '95');
    const err = document.getElementById('errorContainer');

    if (!paymentUnlocked || !paymentAccessToken) {
        err.innerHTML = `<div class="error-toast"><span>⚠️</span><span>Сначала завершите оплату тарифа.</span></div>`;
        return;
    }
    if(!email || !pass || !code) { err.innerHTML = `<div class="error-toast"><span>⚠️</span><span>Заполните все поля!</span></div>`; return; }
    const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            username: email.split('@')[0],
            email,
            password: pass,
            code,
            plan: chosenPlan,
            activation_price: chosenPrice,
            client_session_id: clientSessionId,
            payment_token: paymentAccessToken,
            fingerprint: deviceFingerprint
        })
    });
    if(res.ok) {
        clearPaymentAccess();
        err.innerHTML = `<div class="error-toast" style="background:#122218; border-color:#00d95f; color:#88ffaa;"><span>✅</span><span>Успешно! Вход...</span></div>`;
        setTimeout(() => openModal('login'), 1200);
    } else {
        const r = await res.json();
        err.innerHTML = `<div class="error-toast"><span>⚠️</span><span>${r.detail}</span></div>`;
    }
}

async function validateLogin() {
    const email = document.getElementById('loginEmail').value.trim();
    const pass = document.getElementById('loginPass').value.trim();
    const err = document.getElementById('loginErrorContainer');
    const username = email.split('@')[0];
    const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password: pass, fingerprint: deviceFingerprint })
    });
    const data = await res.json();
    if(res.ok) {
        localStorage.setItem('airdrop_username', username);
        userPlan = data.plan || 'Standard';
        subscriptionStatus = 'active';
        subscriptionDaysLeft = data.days_left ?? 30;
        handleLoginSuccess();
    } else {
        err.innerHTML = `<div class="error-toast"><span>⚠️</span><span>${data.detail}</span></div>`;
    }
}

function handleLoginSuccess() {
    isLoggedIn = true;
    document.getElementById('authModal').classList.remove('show');
    document.getElementById('main-content').style.display = 'none';
    document.getElementById('dashboard-content').style.display = 'flex';
    const mobileNav = document.getElementById('mobileNavBar');
    if(mobileNav) mobileNav.style.display = 'flex';
    renderDashboard('Looter');
}

function switchMenu(element, sectionName) {
    currentSection = sectionName;
    document.querySelectorAll('.sidebar-menu-item').forEach(i => i.classList.remove('active'));
    if(element) element.classList.add('active');
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
        msg.innerHTML = `<span style="color: #00d95f;">✅ Кошелек добавлен!</span>`;
        document.getElementById('newWalletAddress').value = '';
        document.getElementById('newWalletPk').value = '';
        document.getElementById('newWalletProxy').value = '';
        loadWalletsFromDB();
    } else {
        msg.innerHTML = `<span style="color: #ff3366;">${data.detail}</span>`;
    }
}

async function loadWalletsFromDB() {
    const username = localStorage.getItem('airdrop_username') || "Robert";
    const container = document.getElementById('walletsListContainer');
    if(!container) return;
    const res = await fetch(`/api/wallets/${username}`);
    const data = await res.json();
    userPlan = data.plan;
    document.getElementById('slot-info-badge').innerText = `Лимит слотов: ${data.wallets.length} / ${data.max_slots} (${data.plan})`;
    
    if(data.wallets.length > 0) {
        container.innerHTML = data.wallets.map(w => `
            <div style="background: #07050c; border: 1px solid rgba(157,78,221,0.3); padding: 14px; border-radius: 14px; display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <div style="color: #fff; font-weight: bold; font-size: 14px;">${w.wallet_address}</div>
                    <div style="color: #b19cd9; font-size: 11px;">Proxy: ${w.proxy}</div>
                </div>
                <button type="button" onclick="deleteWallet(${w.id})" style="background: rgba(255,51,102,0.2); color: #ff88aa; border: 1px solid rgba(255,51,102,0.4); padding: 6px 12px; border-radius: 10px; font-size: 12px;">Удалить</button>
            </div>
        `).join('');
    } else {
        container.innerHTML = `<div style="color: #b19cd9; font-size: 13px;">Кошельков пока нет.</div>`;
    }
}

async function deleteWallet(id) {
    await fetch(`/api/wallets/delete/${id}`, { method: 'DELETE' });
    loadWalletsFromDB();
}

async function buyExtraSlot() {
    const username = localStorage.getItem('airdrop_username') || "Robert";
    const msg = document.getElementById('buySlotMsg');
    const res = await fetch('/api/wallets/buy-slot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username })
    });
    const data = await res.json();
    if (res.ok) {
        msg.innerHTML = `<span style="color: #00d95f;">✅ Слот куплен!</span>`;
        loadWalletsFromDB();
    } else {
        msg.innerHTML = `<span style="color: #ff3366;">${data.detail}</span>`;
    }
}

async function startAutoFarming() {
    const net = document.getElementById('farmNetwork').value;
    const username = localStorage.getItem('airdrop_username') || "Robert";
    const log = document.getElementById('farm-console-logs');

    log.innerHTML += `<br><span style="color: #c77dff;">Запуск фарма в сети ${net}...</span>`;
    const res = await fetch('/api/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: "all", network: net, username })
    });
    const data = await res.json();
    if(res.ok) {
        log.innerHTML += `<br><span style="color: #00d95f;">✅ Фарм сессия успешно завершена!</span>`;
    } else {
        log.innerHTML += `<br><span style="color: #ff3366; font-weight: bold;">${data.detail}</span>`;
    }
}

function renderDashboard(tab) { renderDashboardContent(tab); }

const netLocks = { Standard: { Arbitrum: true, ZkSync: true, Solana: true }, Pro: { Solana: true }, Premium: {} };

function renderDashboardContent(section) {
    currentSection = section;
    const t = translations[currentLang];
    const content = document.getElementById('dashboard-content');
    const username = localStorage.getItem('airdrop_username') || "Robert";

    let centerHtml = '';
    if (section === 'Looter') {
        centerHtml = `
            <div style="background: #100a1c; border: 1px solid rgba(157,78,221,0.3); border-radius: 20px; padding: 20px;">
                <h3 style="color: #fff; margin-top: 0;">🚀 ${t.dashTitle}</h3>
                <p style="color: #b19cd9; font-size: 14px;">${t.dashDesc}</p>
                <button type="button" onclick="startScanningDrops()" class="btn-purple-lg" style="width: auto; padding: 12px 20px; font-size: 13px;">${t.scanBtn}</button>
                <div id="drop-logs" style="margin-top: 15px; background: #07050c; padding: 14px; border-radius: 14px; font-family: monospace; font-size: 12px; color: #b19cd9; max-height: 160px; overflow-y: auto;">${t.logInit}</div>
            </div>
        `;
    } else if (section === 'Farming') {
        centerHtml = `
            <div style="background: #100a1c; border: 1px solid rgba(157,78,221,0.3); border-radius: 20px; padding: 20px;">
                <h3 style="color: #fff; margin-top: 0;">${t.farmTitle}</h3>
                <p style="color: #b19cd9; font-size: 13px;">${t.farmDesc} (Ваш тариф: <b>${userPlan}</b>)</p>
                <label style="color: #b19cd9; font-size: 12px; display: block; margin-bottom: 6px;">${t.netSelectLabel}</label>
                <select class="auth-input" id="farmNetwork" style="margin-bottom: 14px;">
                    <option value="Base">Base L2 (Доступно на всех тарифах)</option>
                    <option value="Arbitrum" ${netLocks[userPlan]?.Arbitrum ? 'disabled' : ''}>${netLocks[userPlan]?.Arbitrum ? '🔒 ' : ''}Arbitrum One (Эксклюзив PRO / Premium)</option>
                    <option value="ZkSync" ${netLocks[userPlan]?.ZkSync ? 'disabled' : ''}>${netLocks[userPlan]?.ZkSync ? '🔒 ' : ''}ZkSync Era (Эксклюзив PRO / Premium)</option>
                    <option value="Solana" ${netLocks[userPlan]?.Solana ? 'disabled' : ''}>${netLocks[userPlan]?.Solana ? '🔒 ' : ''}Solana (Эксклюзив Premium)</option>
                </select>
                <button type="button" onclick="startAutoFarming()" class="btn-purple-lg" style="width: auto; padding: 12px 20px; font-size: 13px;">${t.startFarmBtn}</button>
                <div id="farm-console-logs" style="margin-top: 15px; background: #07050c; padding: 14px; border-radius: 14px; font-family: monospace; font-size: 12px; color: #00d95f; max-height: 160px; overflow-y: auto;">Ожидание...</div>
            </div>
        `;
    } else if (section === 'Networks') {
        const networksHtml = NETWORKS_CONFIG.map(net => `
            <div class="network-row">
                <div class="network-info">
                    <div class="network-icon">${net.icon}</div>
                    <div class="network-details">
                        <div>${net.name} <span style="font-size: 11px; color: #c77dff;">(${net.symbol})</span></div>
                        <div>${net.address}</div>
                    </div>
                </div>
                <div class="network-actions">
                    <button class="net-action-btn" title="Копировать адрес" onclick="copyWalletAddress('${net.address}', this)">📋</button>
                    <button class="net-action-btn" title="Показать QR-код" onclick="openNetworkQRModal('${net.name}', '${net.address}', '${net.explorer}')">🔲</button>
                </div>
            </div>
        `).join('');

        centerHtml = `
            <div style="background: #100a1c; border: 1px solid rgba(157,78,221,0.3); border-radius: 20px; padding: 20px;">
                <h3 style="color: #fff; margin-top: 0; margin-bottom: 6px;">🌐 Сети & Адреса мастер-кошелька</h3>
                <p style="color: #b19cd9; font-size: 13px; margin-bottom: 20px;">Ваши публичные адреса во всех поддерживаемых блокчейнах.</p>
                <div>${networksHtml}</div>
            </div>
        `;
    } else if (section === 'Wallets') {
        centerHtml = `
            <div style="background: #100a1c; border: 1px solid rgba(157,78,221,0.3); border-radius: 20px; padding: 20px; margin-bottom: 16px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                    <h3 style="color: #fff; margin: 0;">👥 Кошельки воркеров</h3>
                    <span id="slot-info-badge" style="font-size: 12px; background: rgba(157,78,221,0.2); color: #c77dff; padding: 4px 10px; border-radius: 10px;">Загрузка слотов...</span>
                </div>
                <div id="walletsListContainer" style="display: flex; flex-direction: column; gap: 10px;">Загрузка...</div>
                <button type="button" onclick="buyExtraSlot()" class="btn-dark-lg" style="margin-top: 12px; width: auto; padding: 10px 16px; font-size: 13px;">➕ Купить +1 слот ($10)</button>
                <div id="buySlotMsg" style="margin-top: 8px;"></div>
            </div>
            <div style="background: #100a1c; border: 1px solid rgba(157,78,221,0.3); border-radius: 20px; padding: 20px;">
                <h3 style="color: #fff; margin-top: 0;">➕ Добавить воркера</h3>
                <div style="display: flex; flex-direction: column; gap: 10px;">
                    <input type="text" id="newWalletAddress" placeholder="Адрес кошелька" class="auth-input">
                    <input type="password" id="newWalletPk" placeholder="Приватный ключ" class="auth-input">
                    <input type="text" id="newWalletProxy" placeholder="Прокси (ip:port:login:pass)" class="auth-input">
                    <button type="button" onclick="addNewWalletToDB()" class="btn-modal-primary">Добавить в ферму</button>
                </div>
                <div id="walletResponseMsg" style="margin-top: 10px;"></div>
            </div>
        `;
        setTimeout(loadWalletsFromDB, 50);
    } else if (section === 'Tasks') {
        const schedulerLocked = userPlan === 'Standard';
        const days = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
        const calendarHtml = days.map((d, i) => `<div class="calendar-day ${i < 3 ? 'active' : ''}">${d}</div>`).join('');
        centerHtml = `
            <div style="background: #100a1c; border: 1px solid rgba(157,78,221,0.3); border-radius: 20px; padding: 20px; margin-bottom: 16px;">
                <h3 style="color: #fff; margin-top: 0;">${t.tasksTitle}</h3>
                <p style="color: #b19cd9; font-size: 13px;">${t.tasksDesc}</p>
                <div class="calendar-grid">${calendarHtml}</div>
            </div>
            <div style="background: #100a1c; border: 1px solid rgba(157,78,221,0.3); border-radius: 20px; padding: 20px; display: flex; flex-direction: column; gap: 10px;">
                <label class="toggle-switch">
                    <input type="checkbox" id="schedulerToggle" ${schedulerLocked ? 'disabled' : ''}>
                    <span class="toggle-slider"></span>
                    <span style="margin-left: 10px; color: #fff; font-size: 13px;">${t.schedulerToggleLabel}</span>
                </label>
                ${schedulerLocked ? `<div style="color: #ff88aa; font-size: 12px;">${t.schedulerLockedText}</div>` : ''}
            </div>
        `;
    } else if (section === 'Billing') {
        centerHtml = `
            <div style="background: #100a1c; border: 1px solid rgba(157,78,221,0.3); border-radius: 20px; padding: 20px;">
                <h3 style="color: #fff; margin-top: 0;">💳 Управление подпиской и тарифами</h3>
                <p style="color: #b19cd9; font-size: 13px;">Ваш текущий тариф: <b>${userPlan}</b></p>
                <p style="color: #b19cd9; font-size: 13px;">Статус: <span style="color: #00d95f;">Активна (${subscriptionDaysLeft} дн. осталось)</span></p>
                <div style="display: flex; gap: 10px; margin-top: 15px;">
                    <button type="button" onclick="openPricingModal()" class="btn-purple-lg" style="width: auto; padding: 10px 18px; font-size: 13px;">Сменить / Улучшить тариф</button>
                </div>
            </div>
        `;
    } else if (section === 'Settings') {
        centerHtml = `
            <div style="background: #100a1c; border: 1px solid rgba(157,78,221,0.3); border-radius: 20px; padding: 20px;">
                <h3 style="color: #fff; margin-top: 0;">🔒 Настройки профиля</h3>
                <p style="color: #b19cd9; font-size: 13px;">Расширенные параметры безопасности и привязка аккаунтов.</p>
            </div>
        `;
    } else {
        centerHtml = `<div style="background: #100a1c; border: 1px solid rgba(157,78,221,0.3); border-radius: 20px; padding: 20px;"><h3 style="color:#fff; margin-top:0;">Раздел в разработке</h3></div>`;
    }

    content.innerHTML = `
        <div class="desktop-sidebar" style="width: 260px; display: flex; flex-direction: column; gap: 10px; flex-shrink: 0;">
            <div style="background: #100a1c; border: 1px solid rgba(157,78,221,0.3); border-radius: 20px; padding: 16px;">
                <div style="font-weight: bold; color: #fff;">${username}</div>
                <div style="font-size: 11px; color: #c77dff;">Тариф: ${userPlan}</div>
                <div style="font-size: 11px; color: ${subscriptionStatus === 'expired' ? '#ff88aa' : '#00d95f'}; margin-top: 6px;">Подписка: ${subscriptionStatus === 'expired' ? 'Истекла' : `Активна (${subscriptionDaysLeft} дн.)`}</div>
            </div>

            <div style="background: #100a1c; border: 1px solid rgba(157,78,221,0.3); border-radius: 16px; padding: 10px; display: flex; flex-direction: column; gap: 4px;">
                <div class="sidebar-menu-item ${section === 'Looter' ? 'active' : ''}" onclick="switchMenu(this, 'Looter')">📦 Looter</div>
                <div class="sidebar-menu-item ${section === 'Farming' ? 'active' : ''}" onclick="switchMenu(this, 'Farming')">🌾 Фарминг</div>
                <div class="sidebar-menu-item ${section === 'Wallets' ? 'active' : ''}" onclick="switchMenu(this, 'Wallets')">👥 Кошельки</div>
                <div class="sidebar-menu-item ${section === 'Networks' ? 'active' : ''}" onclick="switchMenu(this, 'Networks')">🌐 Сети & Адреса</div>
                <div class="sidebar-menu-item ${section === 'Tasks' ? 'active' : ''}" onclick="switchMenu(this, 'Tasks')">⚡ Активные задачи</div>
            </div>

            <div style="background: #100a1c; border: 1px solid rgba(157,78,221,0.3); border-radius: 16px; padding: 10px; display: flex; flex-direction: column; gap: 4px; margin-top: auto;">
                <div style="font-size: 10px; color: #7b68ee; text-transform: uppercase; padding: 4px 8px; font-weight: bold;">Премиум & Настройки</div>
                
                <div class="tooltip-container">
                    <div class="sidebar-menu-item" style="opacity: ${userPlan === 'Standard' ? '0.5' : '1'}; width: 100%; cursor: ${userPlan === 'Standard' ? 'not-allowed' : 'pointer'};" ${userPlan === 'Standard' ? '' : `onclick="switchMenu(this, 'Settings')"`}>
                        🔒 Настройки профиля
                    </div>
                    <span class="tooltip-text">Функция доступна на PRO Фермер / Premium VIP. Приобретите апгрейд.</span>
                </div>

                <div class="sidebar-menu-item ${section === 'Billing' ? 'active' : ''}" onclick="switchMenu(this, 'Billing')">
                    💳 Биллинг и Тарифы
                </div>
            </div>
        </div>
        <div style="flex: 1; display: flex; flex-direction: column; gap: 16px; min-width: 0;">${centerHtml}</div>
    `;
}

async function startScanningDrops() {
    const log = document.getElementById('drop-logs');
    const username = localStorage.getItem('airdrop_username') || "Robert";
    const res = await fetch(`/api/scan/${username}`, { method: 'POST' });
    const data = await res.json();
    log.innerHTML += `<br><span style="color: #00d95f;">✅ Просканировано кошельков: ${data.data.total_wallets_scanned}. Найдено дропов: ${data.data.found_drops.length}</span>`;
}

function switchMobileNav(sectionName, btnElement) {
    document.querySelectorAll('.mobile-nav-item').forEach(btn => btn.classList.remove('active'));
    if(btnElement) btnElement.classList.add('active');
    renderDashboardContent(sectionName);
}

function openBottomSheetMenu() {
    const overlay = document.getElementById('bottomSheetOverlay');
    const container = document.getElementById('sheetMenuItemsContainer');
    if(!overlay || !container) return;

    container.innerHTML = `
        <div class="sidebar-menu-item" onclick="closeBottomSheet(); switchMenu(null, 'Networks')">🌐 Сети & Адреса</div>
        <div class="sidebar-menu-item" onclick="closeBottomSheet(); switchMenu(null, 'Billing')">💳 Биллинг и Тарифы</div>
        <div class="sidebar-menu-item" onclick="closeBottomSheet(); switchMenu(null, 'Settings')">🔒 Настройки профиля</div>
        <div class="sidebar-menu-item" style="color:#ff88aa;" onclick="closeBottomSheet(); returnToMainSite()">🚪 Выйти из аккаунта</div>
    `;
    overlay.classList.add('show');
}

function closeBottomSheet() {
    const overlay = document.getElementById('bottomSheetOverlay');
    if(overlay) overlay.classList.remove('show');
}

function handleSheetOverlayClick(event) {
    if(event.target.id === 'bottomSheetOverlay') closeBottomSheet();
}

function toggleFaq(item) {
    item.classList.toggle('active');
}
async function recoverSessionByTxid() {
    const txidInput = document.getElementById('txidInput');
    const status = document.getElementById('paymentStatusContainer');
    const txid = txidInput ? txidInput.value.trim() : '';

    if (!txid) {
        status.innerHTML = `<div class="error-toast" style="position: static; margin-top: 10px;"><span>⚠️</span><span>Введите ваш старый TXID для восстановления!</span></div>`;
        return;
    }

    status.innerHTML = `<div class="error-toast" style="position: static; margin-top: 10px; background:#101827; border-color:#4f46e5; color:#c7d2fe;"><span>⏳</span><span>Проверка транзакции в сети...</span></div>`;

    try {
        const res = await fetch('/api/payment/recover', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ txid, client_session_id: clientSessionId })
        });
        const data = await res.json();

        if (!res.ok) {
            status.innerHTML = `<div class="error-toast" style="position: static; margin-top: 10px;"><span>⚠️</span><span>${data.detail || 'Транзакция не найдена'}</span></div>`;
            return;
        }

        paymentUnlocked = true;
        paymentAccessToken = data.payment_token;
        sessionStorage.setItem('ax_payment_token', paymentAccessToken);
        sessionStorage.setItem('ax_paid_session_id', clientSessionId);
        sessionStorage.setItem('ax_paid_plan', data.plan || 'Standard');

        status.innerHTML = `<div class="error-toast" style="position: static; margin-top: 10px; background:#122218; border-color:#00d95f; color:#88ffaa;"><span>✅</span><span>Доступ восстановлен! Переход к регистрации...</span></div>`;
        setTimeout(() => openModal('register'), 1000);
    } catch (e) {
        status.innerHTML = `<div class="error-toast" style="position: static; margin-top: 10px;"><span>⚠️</span><span>Ошибка связи с сервером.</span></div>`;
    }
}