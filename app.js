
document.getElementById('main-logo-btn').addEventListener('click', function(e) {
    e.preventDefault();
    returnToMainSite();
});

window.addEventListener('DOMContentLoaded', () => {
    const line = document.getElementById('preloader-line');
    line.style.width = '60%';
    setTimeout(() => { line.style.width = '100%'; }, 300);
    setTimeout(() => { line.style.opacity = '0'; }, 700);
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
        farmTabBtn: "Авто-Фарминг", tasksTabBtn: "Активные задачи", proxyTabBtn: "Прокси менеджер", statsTabBtn: "Статистика",
        looterMenu: "Looter & Drops", farmMenu: "Авто-Фарминг", tasksMenu: "Активные задачи", proxyMenu: "Прокси Чекинг", walletsMenu: "Кошельки", statsMenu: "Статистика", billingMenu: "Биллинг и Подписка", settingsMenu: "Настройки",
        
        farmTitle: "🌾 Anti-Sybil Swaps & Bridges (Фарм объемов)",
        farmDesc: "Запуск боевого ядра `core_engine.py` с рандомизацией пауз и порядка воркеров.",
        netSelectLabel: "Целевая сеть для фарма:",
        startFarmBtn: "▶ Запустить Anti-Sybil Ядро",
        
        proxyTitle: "🌐 Менеджер и чекер прокси (HTTP/Socks5)",
        proxyDesc: "Проверка пинга и статуса подключенных прокси из вашей базы данных.",
        checkProxyBtn: "Запустить тест прокси кошельков",
        
        statsTitle: "📊 Статистика и отчеты фермы",
        statsDesc: "Общие показатели эффективности, успешные клеймы и выгрузка отчетов.",
        exportBtn: "📥 Экспорт отчета фермы (JSON)",
        
        tasksTitle: "⚡ Очередь активных задач (Live Queue)",
        tasksDesc: "Мониторинг запущенных скриптов накрутки объемов и клейма по кошелькам.",
        schedulerToggleLabel: "Включить фоновый планировщик",
        schedulerLockedText: "🔒 Доступно только на тарифах PRO и Premium",

        tgConnectBtn: "Привязать Telegram Bot",
        tgConnectedText: "Telegram успешно привязан (@RubyFarmer_bot) ✅"
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
        farmTabBtn: "Auto-Farming", tasksTabBtn: "Active Tasks", proxyTabBtn: "Proxy Checker", statsTabBtn: "Statistics",
        looterMenu: "Looter & Drops", farmMenu: "Auto-Farming", tasksMenu: "Active Tasks", proxyMenu: "Proxy Checker", walletsMenu: "Wallets", statsMenu: "Statistics", billingMenu: "Billing & Subscription", settingsMenu: "Settings",
        
        farmTitle: "🌾 Anti-Sybil Swaps & Bridges",
        farmDesc: "Launch core engine via FastAPI backend with randomized delays.",
        netSelectLabel: "Target Network:",
        startFarmBtn: "▶ Start Anti-Sybil Engine",
        
        proxyTitle: "🌐 Proxy Manager & Checker (HTTP/Socks5)",
        proxyDesc: "Test latency and status of connected proxies from your database.",
        checkProxyBtn: "Run Wallets Proxy Test",
        
        statsTitle: "📊 Farm Statistics & Reports",
        statsDesc: "Overall performance metrics, successful claims, and report exports.",
        exportBtn: "📥 Export Farm Report (JSON)",
        
        tasksTitle: "⚡ Live Task Queue",
        tasksDesc: "Monitoring running volume generation scripts and claims across wallets.",
        schedulerToggleLabel: "Enable background scheduler",
        schedulerLockedText: "🔒 Available only on PRO and Premium plans",

        tgConnectBtn: "Link Telegram Bot",
        tgConnectedText: "Telegram successfully linked (@RubyFarmer_bot) ✅"
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
        farmTabBtn: "自动刷量", tasksTabBtn: "活动任务", proxyTabBtn: "代理检测", statsTabBtn: "数据统计",
        looterMenu: "Looter & Drops", farmMenu: "自动刷量", tasksMenu: "活动任务", proxyMenu: "代理检测", walletsMenu: "钱包管理", statsMenu: "数据统计", billingMenu: "账单与订阅", settingsMenu: "系统设置",
        
        farmTitle: "🌾 多链跨链与兑换",
        farmDesc: "通过 FastAPI 后端启动核心引擎。",
        netSelectLabel: "目标网络：",
        startFarmBtn: "▶ 启动防女巫引擎",
        
        proxyTitle: "🌐 代理管理器与检测 (HTTP/Socks5)",
        proxyDesc: "测试数据库中连接的代理的延迟和状态。",
        checkProxyBtn: "运行钱包代理测试",
        
        statsTitle: "📊 农场统计与报告",
        statsDesc: "整体性能指标、成功领取记录及报告导出。",
        exportBtn: "📥 导出农场报告 (JSON)",
        
        tasksTitle: "⚡ 实时任务队列",
        tasksDesc: "监控各钱包正在运行的刷量脚本和领取状态。",
        schedulerToggleLabel: "启用后台计划任务",
        schedulerLockedText: "🔒 仅限 PRO 和 Premium 套餐使用",

        tgConnectBtn: "绑定 Telegram 机器人",
        tgConnectedText: "Telegram 绑定成功 (@RubyFarmer_bot) ✅"
    }
};

function returnToMainSite() {
    isLoggedIn = false;
    document.getElementById('dashboard-content').style.display = 'none';
    document.getElementById('mobileNavBar').style.display = 'none';
    document.getElementById('main-content').style.display = 'block';
    
    const t = translations[currentLang];
    const loginBtn = document.getElementById('login-btn');
    loginBtn.innerText = t.login;
    loginBtn.style.borderColor = "rgba(157,78,221,0.3)";
    loginBtn.style.color = "#e0aaff";
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
    
    if (!isLoggedIn) {
        document.getElementById('page-title').innerText = t.title;
        document.getElementById('login-btn').innerText = t.login;
        document.getElementById('hero-title').innerHTML = t.heroTitle;
        document.getElementById('hero-desc').innerText = t.heroDesc;
        document.getElementById('farm-btn').innerText = t.farmBtn;
        document.getElementById('settings-btn').innerText = t.settingsBtn;
        document.getElementById('banner-text').innerText = t.bannerText;
        document.getElementById('features-section').innerText = t.featuresHeading;
        document.getElementById('faq-heading').innerText = t.faqHeading;
        
        document.getElementById('c1-t').innerText = t.c1t; document.getElementById('c1-d').innerText = t.c1d;
        document.getElementById('c2-t').innerText = t.c2t; document.getElementById('c2-d').innerText = t.c2d;
        document.getElementById('c3-t').innerText = t.c3t; document.getElementById('c3-d').innerText = t.c3d;
    } else {
        renderDashboardContent(currentSection);
    }
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

function handleOverlayClick(event) {
    if (event.target.id === 'authModal') closeAuthModal();
}

function closeWalletActionModal() {
    document.getElementById('walletActionModal').classList.remove('show');
}

function handleWalletOverlayClick(event) {
    if (event.target.id === 'walletActionModal') closeWalletActionModal();
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
            <div class="modal-desc">Забыли пароль? <span style="color:#c77dff; cursor:pointer; text-decoration:underline;" onclick="openModal('recovery')">Восстановить доступ</span></div>
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
        const chosenPrice = Number(localStorage.getItem('selected_price') || PLAN_PRICES[chosenPlan] || 95);
        const planLabel = PLAN_LABELS[chosenPlan] || chosenPlan;
        const alreadyPaid = paymentUnlocked && paymentAccessToken && sessionStorage.getItem('ax_paid_plan') === chosenPlan;

        container.innerHTML = `
            <div class="modal-logo">
                <span>💳 Оплата доступа: ${planLabel}</span>
                <span onclick="closeAuthModal()" style="cursor: pointer; color: #b19cd9; font-size: 20px;">✕</span>
            </div>
            <div class="modal-desc">Шаг 1 из 2: подтвердите оплату тарифа, после чего откроется регистрация по Email.</div>
            <div style="background:#07050c; border:1px solid rgba(157,78,221,0.35); border-radius:14px; padding:14px; margin-bottom:14px;">
                <div style="font-size:12px; color:#b19cd9; margin-bottom:6px;">Выбранный план</div>
                <div style="font-size:18px; color:#fff; font-weight:700; margin-bottom:4px;">${planLabel}</div>
                <div style="font-size:20px; color:#e0aaff; font-weight:800;">$${chosenPrice}</div>
            </div>
            ${alreadyPaid ? `<div class="error-toast" style="position: static; margin-bottom: 12px; background:#122218; border-color:#00d95f; color:#88ffaa;"><span>✅</span><span>Оплата уже подтверждена для этого сеанса.</span></div>` : ''}
            <button type="button" id="paymentActionBtn" class="btn-modal-primary" onclick="startPlanPayment()">${alreadyPaid ? 'Продолжить регистрацию' : 'Оплатить $' + chosenPrice}</button>
            <div id="paymentStatusContainer"></div>
            <div class="modal-desc" style="margin-top:12px; text-align:center;">Нужно выбрать другой тариф? <span style="color:#c77dff; cursor:pointer; text-decoration:underline;" onclick="closeAuthModal(); openPricingModal();">Открыть планы</span></div>
        `;
    } else if (type === 'register') {
        const chosenPlan = localStorage.getItem('selected_plan') || 'Standard';
        const fallbackPlanPrice = { Standard: '95', Pro: '150', Premium: '280' };
        const chosenPrice = localStorage.getItem('selected_price') || fallbackPlanPrice[chosenPlan] || '95';
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
    } else if (type === 'recovery') {
        container.innerHTML = `
            <div class="modal-logo">
                <span>🔑 Восстановление доступа</span>
                <span onclick="closeAuthModal()" style="cursor: pointer; color: #b19cd9; font-size: 20px;">✕</span>
            </div>
            <div class="modal-desc">Введите email, привязанный к аккаунту. Мы вышлем инструкции по восстановлению доступа.</div>
            <div class="input-group">
                <label style="font-size: 11px; color: #b19cd9; display: block; margin-bottom: 4px;">Эл. почта</label>
                <input type="email" class="auth-input" placeholder="Email" id="recoveryEmail">
            </div>
            <button type="button" class="btn-modal-primary" onclick="submitRecovery()">Отправить инструкции</button>
            <div id="recoveryMsgContainer"></div>
            <div class="modal-desc" style="margin-top:14px; text-align:center;">Вспомнили пароль? <span style="color:#c77dff; cursor:pointer; text-decoration:underline;" onclick="openModal('login')">Войти</span></div>
        `;
    } else if (type === 'expired') {
        container.innerHTML = `
            <div class="modal-logo">
                <span>⛔ Подписка истекла</span>
                <span onclick="closeAuthModal()" style="cursor: pointer; color: #b19cd9; font-size: 20px;">✕</span>
            </div>
            <div class="modal-desc">Срок подписки закончился. Продлите доступ для входа в панель.</div>
            <button type="button" class="btn-modal-primary" onclick="renewSubscriptionFromExpiredModal()">Продлить подписку ($50)</button>
            <div id="expiredMsgContainer"></div>
        `;
    }
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

// Генерация модального окна оплаты с QR-кодом и уникальной суммой
function openPaymentModal(chosenPlan, basePrice) {
    const modal = document.getElementById('authModal');
    const container = document.getElementById('modalContainer');
    modal.classList.add('show');

    const planLabel = PLAN_LABELS[chosenPlan] || chosenPlan;
    const walletAddress = "0x5e5316Dea1c44d220d4c60A5fcC2949E5A06Fc66";
    // Уникальный хвост копеек для защиты от пересечения платежей
    const displayAmount = (basePrice + 0.47).toFixed(2);

    container.innerHTML = `
        <div class="modal-logo">
            <span>💳 Оплата: ${planLabel}</span>
            <span onclick="closeAuthModal()" style="cursor: pointer; color: #b19cd9; font-size: 20px;">✕</span>
        </div>
        <div class="modal-desc">Переведите точную сумму в USDT / ETH на публичный кошелек:</div>
        
        <div style="background:#07050c; border:1px solid rgba(157,78,221,0.35); border-radius:14px; padding:14px; margin-bottom:12px; text-align:center;">
            <div style="font-size:12px; color:#b19cd9; margin-bottom:4px;">Сумма к оплате (с уникальным хвостом):</div>
            <div style="font-size:24px; color:#e0aaff; font-weight:800; margin-bottom:10px;">$${displayAmount}</div>
            
            <div style="font-size:11px; color:#b19cd9; margin-bottom:4px;">Адрес кошелька:</div>
            <div style="background:#120c22; padding:8px 10px; border-radius:8px; font-family:monospace; font-size:12px; color:#fff; word-break:break-all; margin-bottom:8px;">${walletAddress}</div>
            
            <div style="display:flex; gap:8px; justify-content:center; margin-bottom:12px;">
                <button type="button" class="btn-dark-sm" onclick="navigator.clipboard.writeText('${walletAddress}'); alert('Кошелек скопирован!');">📋 Копировать адрес</button>
            </div>
            
            <div id="qrcodeContainer" style="display:flex; justify-content:center; margin:10px 0; background:#fff; padding:10px; border-radius:8px; width:140px; margin-left:auto; margin-right:auto;"></div>
        </div>

        <div class="input-group">
            <label style="font-size: 11px; color: #b19cd9; display: block; margin-bottom: 4px;">TXID (хэш транзакции после перевода)</label>
            <input type="text" class="auth-input" placeholder="0x..." id="txidInput">
        </div>

        <button type="button" id="paymentActionBtn" class="btn-modal-primary" onclick="startPlanPayment()">Подтвердить перевод ($${displayAmount})</button>
        <div id="paymentStatusContainer"></div>
    `;

    // Генерация динамического QR-кода
    setTimeout(() => {
        const qrEl = document.getElementById('qrcodeContainer');
        if (qrEl && window.qrcode) {
            try {
                qrEl.innerHTML = '';
                const qr = qrcode(0, 'M');
                qr.addData(`ethereum:${walletAddress}?value=${displayAmount}`);
                qr.make();
                qrEl.innerHTML = qr.createSvgTag({cellSize: 4, margin: 2});
            } catch(e) {
                qrEl.innerHTML = '<span style="font-size:10px; color:#000;">QR Error</span>';
            }
        }
    }, 100);
}

// Отправка и проверка платежа по TXID на бэкенд
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

async function validateLogin() {
    const email = document.getElementById('loginEmail').value.trim();
    const pass = document.getElementById('loginPass').value.trim();
    const err = document.getElementById('loginErrorContainer');
    const username = email.split('@')[0];
    pendingLoginCredentials = { username, password: pass, fingerprint: deviceFingerprint };
    const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pendingLoginCredentials)
    });
    const data = await res.json();
    if(res.ok) {
        localStorage.setItem('airdrop_username', username);
        userPlan = data.plan || 'Standard';
        renewalPrice = data.renewal_price || 50;
        if (data.status === 'expired') {
            subscriptionStatus = 'expired';
            subscriptionDaysLeft = 0;
            openModal('expired');
            return;
        }
        subscriptionStatus = 'active';
        subscriptionDaysLeft = data.days_left ?? 30;
        handleLoginSuccess();
    } else {
        err.innerHTML = `<div class="error-toast"><span>⚠️</span><span>${data.detail}</span></div>`;
    }
}

async function renewSubscriptionFromExpiredModal() {
    const msg = document.getElementById('expiredMsgContainer');
    const username = pendingLoginCredentials?.username || localStorage.getItem('airdrop_username') || 'Robert';
    const res = await fetch('/api/subscription/renew', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username })
    });
    const data = await res.json();
    if (!res.ok) {
        msg.innerHTML = `<div class="error-toast"><span>⚠️</span><span>${data.detail || 'Ошибка продления подписки'}</span></div>`;
        return;
    }

    msg.innerHTML = `<div class="error-toast" style="background:#122218; border-color:#00d95f; color:#88ffaa;"><span>✅</span><span>Подписка продлена. Выполняем вход...</span></div>`;
    subscriptionStatus = 'active';
    subscriptionDaysLeft = data.days_left ?? 30;

    if (!pendingLoginCredentials) {
        setTimeout(() => openModal('login'), 900);
        return;
    }

    const loginRes = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pendingLoginCredentials)
    });
    const loginData = await loginRes.json();
    if (loginRes.ok && loginData.status === 'success') {
        localStorage.setItem('airdrop_username', pendingLoginCredentials.username);
        userPlan = loginData.plan || 'Standard';
        renewalPrice = loginData.renewal_price || 50;
        subscriptionStatus = 'active';
        subscriptionDaysLeft = loginData.days_left ?? 30;
        handleLoginSuccess();
    } else {
        msg.innerHTML = `<div class="error-toast"><span>⚠️</span><span>Подписка продлена, но вход нужно повторить вручную.</span></div>`;
        setTimeout(() => openModal('login'), 1200);
    }
}

async function renewSubscriptionFromPanel() {
    const username = localStorage.getItem('airdrop_username') || 'Robert';
    const res = await fetch('/api/subscription/renew', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username })
    });
    const data = await res.json();
    if (res.ok) {
        renewalPrice = data.renewal_price || 50;
        subscriptionStatus = 'active';
        subscriptionDaysLeft = data.days_left ?? 30;
        renderDashboardContent(currentSection);
    }
}

async function submitRecovery() {
    const email = document.getElementById('recoveryEmail').value.trim();
    const msg = document.getElementById('recoveryMsgContainer');
    if (!email) { msg.innerHTML = `<div class="error-toast"><span>⚠️</span><span>Введите email!</span></div>`; return; }
    await fetch('/api/recover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
    });
    msg.innerHTML = `<div class="error-toast" style="background:#122218; border-color:#00d95f; color:#88ffaa;"><span>✅</span><span>Если аккаунт найден, инструкции отправлены на почту.</span></div>`;
}

function handleLoginSuccess() {
    isLoggedIn = true;
    document.getElementById('authModal').classList.remove('show');
    document.getElementById('main-content').style.display = 'none';
    document.getElementById('dashboard-content').style.display = 'flex';
    document.getElementById('mobileNavBar').style.display = 'flex';
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
    } else {
        centerHtml = `<div style="background: #100a1c; border: 1px solid rgba(157,78,221,0.3); border-radius: 20px; padding: 20px;"><h3 style="color:#fff; margin-top:0;">Раздел в разработке</h3></div>`;
    }

    content.innerHTML = `
        <div class="desktop-sidebar" style="width: 260px; display: flex; flex-direction: column; gap: 10px; flex-shrink: 0;">
            <div style="background: #100a1c; border: 1px solid rgba(157,78,221,0.3); border-radius: 20px; padding: 16px;">
                <div style="font-weight: bold; color: #fff;">${username}</div>
                <div style="font-size: 11px; color: #c77dff;">Тариф: ${userPlan}</div>
                <div style="font-size: 11px; color: ${subscriptionStatus === 'expired' ? '#ff88aa' : '#00d95f'}; margin-top: 6px;">Подписка: ${subscriptionStatus === 'expired' ? 'Истекла' : `Активна (${subscriptionDaysLeft} дн.)`}</div>
                <button type="button" onclick="renewSubscriptionFromPanel()" class="btn-dark-lg" style="margin-top: 10px; width: 100%; padding: 8px 10px; font-size: 12px;">Продлить подписку ($50)</button>
            </div>
            <div style="background: #100a1c; border: 1px solid rgba(157,78,221,0.3); border-radius: 16px; padding: 10px; display: flex; flex-direction: column; gap: 4px;">
                <div class="sidebar-menu-item ${section === 'Looter' ? 'active' : ''}" onclick="switchMenu(this, 'Looter')">📦 Looter</div>
                <div class="sidebar-menu-item ${section === 'Farming' ? 'active' : ''}" onclick="switchMenu(this, 'Farming')">🌾 Фарминг</div>
                <div class="sidebar-menu-item ${section === 'Wallets' ? 'active' : ''}" onclick="switchMenu(this, 'Wallets')">👥 Кошельки</div>
                <div class="sidebar-menu-item ${section === 'Tasks' ? 'active' : ''}" onclick="switchMenu(this, 'Tasks')">⚡ ${t.tasksMenu}</div>
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
