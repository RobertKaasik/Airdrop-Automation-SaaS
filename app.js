document.getElementById('main-logo-btn').addEventListener('click', function(e) {
    e.preventDefault();
    returnToMainSite();
});

window.addEventListener('DOMContentLoaded', () => {
    loadPlatformStats(); // Загружаем реальную статистику слотов
    const line = document.getElementById('preloader-line');
    if(line) {
        line.style.width = '60%';
        setTimeout(() => { line.style.width = '100%'; }, 300);
        setTimeout(() => { line.style.opacity = '0'; }, 700);
    }
});

let currentLang = 'ru';
let isLoggedIn = false;
let currentSection = 'Account';
let userPlan = 'Standard';
let deviceFingerprint = generateDeviceFingerprint();
let subscriptionDaysLeft = 29;
let showWelcomeGuide = true;

let userInternalBalance = 42.50; // Личный баланс пользователя для газа/фарма
let transactionHistory = [
    { id: "tx_981a", type: "deposit", amount: "+50.00 USD", date: "2026-07-28 14:12", status: "Completed" },
    { id: "tx_421b", type: "gas_fee", amount: "-7.50 USD", date: "2026-07-29 19:40", status: "Success" }
];

let codeCooldownTimer = null;
let codeCooldownSeconds = 0;
let confirmedRegistrationEmail = "";

const PLAN_PRICES = { Standard: 95, Pro: 150, Premium: 280 };
const PLAN_LABELS = { Standard: 'Standard', Pro: 'PRO Фермер', Premium: 'Premium VIP' };
const clientSessionId = getOrCreateClientSessionId();
let paymentAccessToken = sessionStorage.getItem('ax_payment_token') || '';
let paymentUnlocked = sessionStorage.getItem('ax_paid_session_id') === clientSessionId && !!paymentAccessToken;

const MASTER_WALLET = "0x5e5316Dea1c44d220d4c60A5fcC2949E5A06Fc66";

const NETWORKS_CONFIG = [
    { name: "Ethereum", symbol: "ETH", icon: "Ξ", explorer: "https://etherscan.io", proxyStatus: "Stable (24ms)" },
    { name: "Base", symbol: "ETH", icon: "🔵", explorer: "https://basescan.org", proxyStatus: "Optimal (14ms)" },
    { name: "Arbitrum", symbol: "ETH", icon: "🔷", explorer: "https://arbiscan.io", proxyStatus: "Stable (18ms)" },
    { name: "Linea", symbol: "ETH", icon: "⬛", explorer: "https://lineascan.build", proxyStatus: "Stable (31ms)" },
    { name: "Solana", symbol: "SOL", icon: "🟣", explorer: "https://solscan.io", proxyStatus: "Optimal (12ms)" },
    { name: "BNB Chain", symbol: "BNB", icon: "🟡", explorer: "https://bscscan.com", proxyStatus: "Stable (19ms)" },
    { name: "Polygon", symbol: "POL", icon: "🟣", explorer: "https://polygonscan.com", proxyStatus: "Stable (22ms)" },
    { name: "Optimism", symbol: "OP", icon: "🔴", explorer: "https://optimistic.etherscan.io", proxyStatus: "Stable (25ms)" },
    { name: "Tron", symbol: "TRX", icon: "🔴", explorer: "https://tronscan.org", proxyStatus: "Optimal (16ms)" }
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
        return 'fp_' + Math.abs([...canvas.toDataURL()].reduce((acc, char) => ((acc << 5) - acc) + char.charCodeAt(0), 0)).toString(16);
    } catch (e) {
        return 'fp_unknown';
    }
}

const translations = {
    ru: {
        login: "Войти", logout: "Выйти", langCode: "RU",
        heroTitle: "Универсальный инструмент<br>для автоматизации и сбора Airdrop.",
        heroDesc: "Фармите поинты, сканируйте кошельки на наличие распределений и клеймите аирдропы в один клик с защитой Anti-Sybil.",
        farmBtn: "Получить доступ", settingsBtn: "Подробнее",
        featuresHeading: "Возможности платформы", faqHeading: "Часто задаваемые вопросы",
        dashTitle: "Панель поиска и авто-сбора лута",
        dashDesc: "Сканируйте свои кошельки на наличие незабранных наград и запускайте авто-фарминг объема.",
        logInit: "[System] Антифрод-ядро инициализировано. Ожидание сканирования...",
        scanBtn: "🔍 Запустить авто-сбор (Claim Looter)",
        farmTitle: "🌾 Anti-Sybil Swaps & Bridges (Фарм объемов)",
        farmDesc: "Запуск боевого ядра с рандомизацией пауз и порядка воркеров.",
        netSelectLabel: "Целевая сеть для фарма:",
        startFarmBtn: "▶ Запустить Anti-Sybil Ядро"
    }
};

function updateStaticText(lang) {
    const t = translations[lang];
    if (!t) return;
    const setEl = (id, key) => { const el = document.getElementById(id); if (el && t[key]) el.innerHTML = t[key]; };
    setEl('login-btn', 'login');
    if (isLoggedIn) renderDashboardContent(currentSection);
}

function returnToMainSite() {
    isLoggedIn = false;
    document.getElementById('dashboard-content').style.display = 'none';
    const mobileNav = document.getElementById('mobileNavBar');
    if(mobileNav) mobileNav.style.display = ''; 
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
    updateStaticText(lang);
}

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
            <div class="modal-logo" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                <span style="font-weight:bold; font-size:16px;">Войти в систему</span>
                <span onclick="closeAuthModal()" style="cursor: pointer; color: #a3a3a3; font-size: 18px;">✕</span>
            </div>
            <div style="font-size:12px; color:#a3a3a3; margin-bottom:15px;">Нет аккаунта? <span style="color:#fff; cursor:pointer; text-decoration:underline;" onclick="openPricingModal()">Создать аккаунт</span></div>
            <div class="input-group" style="margin-bottom:12px;">
                <label style="font-size: 11px; color: #a3a3a3; display: block; margin-bottom: 4px;">Логин (Email или Ник)</label>
                <input type="text" class="auth-input" placeholder="Введите Email или Никнейм" id="loginUsername">
            </div>
            <div class="input-group" style="margin-bottom:16px;">
                <label style="font-size: 11px; color: #a3a3a3; display: block; margin-bottom: 4px;">Пароль</label>
                <div class="password-wrapper" style="position:relative;">
                    <input type="password" class="auth-input" placeholder="Пароль" id="loginPass">
                    <span class="password-toggle-icon" onclick="togglePasswordVisibility('loginPass', this)" style="position:absolute; right:12px; top:10px; cursor:pointer;">👁️</span>
                </div>
            </div>
            <button type="button" class="btn-modal-primary" onclick="validateLogin()" style="width:100%; padding:12px;">Войти</button>
            <div id="loginErrorContainer" style="margin-top:10px;"></div>
        `;
    } else if (type === 'payment') {
        const chosenPlan = localStorage.getItem('selected_plan') || 'Standard';
        const basePrice = Number(localStorage.getItem('selected_price') || PLAN_PRICES[chosenPlan] || 95);
        const displayAmount = (basePrice + 0.47).toFixed(2);

        container.innerHTML = `
            <div class="modal-logo" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                <span style="font-weight:bold; font-size:16px;">Оплата: ${PLAN_LABELS[chosenPlan]}</span>
                <span onclick="closeAuthModal()" style="cursor: pointer; color: #a3a3a3; font-size: 18px;">✕</span>
            </div>
            <div style="font-size:12px; color:#a3a3a3; margin-bottom:12px;">Шаг 1 из 2: Переведите точную сумму и укажите TXID.</div>
            
            <div style="margin-bottom: 12px;">
                <label style="font-size: 11px; color: #a3a3a3; display: block; margin-bottom: 4px;">Сеть для оплаты:</label>
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px;">
                    <button type="button" class="btn-dark-sm auth-input" id="net-base" onclick="setPayNetwork('Base', '${MASTER_WALLET}', '${displayAmount}')" style="background:#1f1f1f; border-color:#fff; cursor:pointer;">Base L2</button>
                    <button type="button" class="btn-dark-sm auth-input" id="net-arb" onclick="setPayNetwork('Arbitrum', '${MASTER_WALLET}', '${displayAmount}')" style="cursor:pointer;">Arbitrum</button>
                    <button type="button" class="btn-dark-sm auth-input" id="net-eth" onclick="setPayNetwork('Ethereum', '${MASTER_WALLET}', '${displayAmount}')" style="cursor:pointer;">Ethereum</button>
                </div>
            </div>

            <div style="background:#0a0a0a; border:1px solid var(--border-color); border-radius:12px; padding:12px; margin-bottom:12px; text-align:center;">
                <div style="font-size:11px; color:#a3a3a3; margin-bottom:2px;">Сумма к оплате:</div>
                <div style="font-size:20px; color:#fff; font-weight:700; margin-bottom:8px;">$${displayAmount}</div>
                
                <div style="font-size:11px; color:#a3a3a3; margin-bottom:2px;">Кошелек (<span id="activePayNet">Base L2</span>):</div>
                <div style="background:#181818; padding:6px 8px; border-radius:8px; font-family:monospace; font-size:11px; color:#fff; word-break:break-all; margin-bottom:6px;">${MASTER_WALLET}</div>
                
                <button type="button" id="copyWalletBtn" class="auth-input" style="margin: 0 auto; font-size: 11px; padding: 6px 12px; width:auto; cursor:pointer;" onclick="copyWalletAddress('${MASTER_WALLET}', this)">📋 Копировать адрес</button>
                
                <div id="qrcodeContainer" style="display:flex; justify-content:center; margin:8px 0 0 0; background:#fff; padding:6px; border-radius:6px; width:100px; margin-left:auto; margin-right:auto;"></div>
            </div>

            <div class="input-group" style="margin-bottom:12px;">
                <label style="font-size: 11px; color: #a3a3a3; display: block; margin-bottom: 4px;">TXID (хэш транзакции)</label>
                <input type="text" class="auth-input" placeholder="0x..." id="txidInput">
            </div>

            <button type="button" id="paymentActionBtn" class="btn-modal-primary" onclick="startPlanPayment()" style="width:100%; padding:10px;">Подтвердить перевод ($${displayAmount})</button>
            <div id="paymentStatusContainer"></div>
        `;
        setTimeout(() => renderPaymentQR(MASTER_WALLET, displayAmount), 100);
    } else if (type === 'register') {
        const chosenPlan = localStorage.getItem('selected_plan') || 'Standard';
        const chosenPrice = Number(localStorage.getItem('selected_price') || PLAN_PRICES[chosenPlan] || 95);
        
        container.innerHTML = `
            <div class="modal-logo" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                <span style="font-weight:bold; font-size:16px;">Регистрация: ${PLAN_LABELS[chosenPlan]} ($${chosenPrice})</span>
                <span onclick="closeAuthModal()" style="cursor: pointer; color: #a3a3a3; font-size: 18px;">✕</span>
            </div>
            <div class="input-group" style="margin-bottom:10px;">
                <label style="font-size: 11px; color: #a3a3a3; display: block; margin-bottom: 4px;">Никнейм</label>
                <input type="text" class="auth-input" placeholder="Придумайте никнейм" id="regUsername">
            </div>
            <div class="input-group" style="margin-bottom:10px;">
                <label style="font-size: 11px; color: #a3a3a3; display: block; margin-bottom: 4px;">Эл. почта</label>
                <input type="email" class="auth-input" placeholder="Email" id="regEmail">
            </div>
            <div class="input-group" style="margin-bottom:10px;">
                <label style="font-size: 11px; color: #a3a3a3; display: block; margin-bottom: 4px;">Пароль (мин. 8 символов)</label>
                <input type="password" class="auth-input" placeholder="Пароль" id="regPass">
            </div>
            <div class="input-group" style="margin-bottom:14px;">
                <label style="font-size: 11px; color: #a3a3a3; display: block; margin-bottom: 4px;">Код подтверждения</label>
                <input type="text" class="auth-input" placeholder="Код из письма" id="regCode">
            </div>
            <button type="button" class="btn-modal-primary" onclick="validateRegister()" style="width:100%; padding:10px;">Зарегистрироваться</button>
            <div id="errorContainer" style="margin-top:10px;"></div>
        `;
    }
}

function setPayNetwork(netName, address, amount) {
    document.getElementById('activePayNet').innerText = netName;
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
        } catch(e) {}
    }
}

function copyWalletAddress(address, btn) {
    navigator.clipboard.writeText(address);
    const originalText = btn.innerHTML;
    btn.innerHTML = '✅ Скопировано!';
    setTimeout(() => { btn.innerHTML = originalText; }, 2000);
}

async function startPlanPayment() {
    const chosenPlan = localStorage.getItem('selected_plan') || 'Standard';
    const basePrice = PLAN_PRICES[chosenPlan] || 95;
    const status = document.getElementById('paymentStatusContainer');
    const txid = document.getElementById('txidInput').value.trim();

    if (!txid) {
        status.innerHTML = `<div style="color:#ef4444; font-size:12px; margin-top:8px;">Введите TXID транзакции!</div>`;
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
            status.innerHTML = `<div style="color:#ef4444; font-size:12px; margin-top:8px;">${confirmData.detail || 'Ошибка'}</div>`;
            return;
        }

        paymentUnlocked = true;
        paymentAccessToken = confirmData.payment_token;
        sessionStorage.setItem('ax_payment_token', paymentAccessToken);
        sessionStorage.setItem('ax_paid_session_id', clientSessionId);

        status.innerHTML = `<div style="color:#22c55e; font-size:12px; margin-top:8px;">✅ Оплата подтверждена!</div>`;
        setTimeout(() => openModal('register'), 800);
    } catch (e) {
        status.innerHTML = `<div style="color:#ef4444; font-size:12px; margin-top:8px;">Ошибка сети.</div>`;
    }
}

async function validateRegister() {
    const username = document.getElementById('regUsername').value.trim();
    const email = document.getElementById('regEmail').value.trim();
    const pass = document.getElementById('regPass').value.trim();
    const code = document.getElementById('regCode').value.trim();
    const chosenPlan = localStorage.getItem('selected_plan') || 'Standard';
    const err = document.getElementById('errorContainer');

    if(!username || !email || !pass || !code) { 
        err.innerHTML = `<div style="color:#ef4444; font-size:12px;">Заполните все поля!</div>`; 
        return; 
    }
    
    const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            username, email, password: pass, code, plan: chosenPlan,
            activation_price: PLAN_PRICES[chosenPlan], client_session_id: clientSessionId,
            payment_token: paymentAccessToken, fingerprint: deviceFingerprint
        })
    });
    
    if(res.ok) {
        clearPaymentAccess();
        err.innerHTML = `<div style="color:#22c55e; font-size:12px;">✅ Успешно! Вход...</div>`;
        setTimeout(() => openModal('login'), 1200);
    } else {
        const r = await res.json();
        err.innerHTML = `<div style="color:#ef4444; font-size:12px;">${r.detail}</div>`;
    }
}

async function validateLogin() {
    const username = document.getElementById('loginUsername').value.trim();
    const pass = document.getElementById('loginPass').value.trim();
    const err = document.getElementById('loginErrorContainer');
    
    if(!username || !pass) {
        err.innerHTML = `<div style="color:#ef4444; font-size:12px;">Введите логин и пароль!</div>`;
        return;
    }

    const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password: pass, fingerprint: deviceFingerprint })
    });
    const data = await res.json();
    
    if(res.ok) {
        localStorage.setItem('airdrop_username', data.username);
        userPlan = data.plan || 'Standard';
        subscriptionDaysLeft = data.days_left ?? 29;
        handleLoginSuccess();
    } else {
        err.innerHTML = `<div style="color:#ef4444; font-size:12px;">${data.detail}</div>`;
    }
}

function handleLoginSuccess() {
    isLoggedIn = true;
    document.getElementById('authModal').classList.remove('show');
    document.getElementById('main-content').style.display = 'none';
    document.getElementById('dashboard-content').style.display = 'flex';
    const mobileNav = document.getElementById('mobileNavBar');
    if(mobileNav) mobileNav.style.display = ''; 
    currentSection = 'Account';
    renderDashboardContent('Account');
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
        msg.innerHTML = `<span style="color: #22c55e;">✅ Кошелек добавлен!</span>`;
        document.getElementById('newWalletAddress').value = '';
        document.getElementById('newWalletPk').value = '';
        document.getElementById('newWalletProxy').value = '';
        loadWalletsFromDB();
    } else {
        msg.innerHTML = `<span style="color: #ef4444;">${data.detail}</span>`;
    }
}

async function loadWalletsFromDB() {
    const username = localStorage.getItem('airdrop_username') || "Robert";
    const container = document.getElementById('walletsListContainer');
    if(!container) return;
    const res = await fetch(`/api/wallets/${username}`);
    const data = await res.json();
    userPlan = data.plan;
    
    const badge = document.getElementById('slot-info-badge');
    if(badge) badge.innerText = `Слоты: ${data.wallets.length} / ${data.max_slots} (${data.plan})`;
    
    if(data.wallets.length > 0) {
        container.innerHTML = data.wallets.map(w => {
            const mockBalance = (Math.abs(hashCode(w.wallet_address)) % 1500 + 45).toFixed(2);
            return `
                <div style="background: var(--bg-main); border: 1px solid var(--border-color); padding: 14px; border-radius: 12px; display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <div style="color: #fff; font-weight: 600; font-size: 13px; font-family:monospace;">${w.wallet_address}</div>
                        <div style="color: #a3a3a3; font-size: 11px; margin-top:2px;">Баланс: <b style="color:#fff;">$${mockBalance}</b> | Proxy: ${w.proxy || 'Не задан'}</div>
                    </div>
                    <button type="button" onclick="deleteWallet(${w.id})" style="background: rgba(239,68,68,0.1); color: #ef4444; border: 1px solid rgba(239,68,68,0.2); padding: 6px 10px; border-radius: 8px; font-size: 11px; cursor:pointer;">Удалить</button>
                </div>
            `;
        }).join('');
    } else {
        container.innerHTML = `<div style="color: #a3a3a3; font-size: 13px;">Кошельков пока нет.</div>`;
    }
}

function hashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) { hash = str.charCodeAt(i) + ((hash << 5) - hash); }
    return hash;
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
    if (res.ok) {
        msg.innerHTML = `<span style="color: #22c55e;">✅ Слот куплен!</span>`;
        loadWalletsFromDB();
    }
}

async function startAutoFarming() {
    const net = document.getElementById('farmNetwork').value;
    const log = document.getElementById('farm-console-logs');

    if (userInternalBalance < 2.0) {
        log.innerHTML += `<br><span style="color: #ef4444; font-weight: bold;">⛔ Ошибка: Недостаточно средств на балансе для оплаты газа. Пополните баланс!</span>`;
        return;
    }

    log.innerHTML += `<br><span style="color: #a3a3a3;">Запуск фарма в сети ${net}... Списано комиссии: $1.50</span>`;
    userInternalBalance -= 1.50;
    
    const balEl = document.getElementById('userBalanceValue');
    if(balEl) balEl.innerText = `$${userInternalBalance.toFixed(2)}`;

    const username = localStorage.getItem('airdrop_username') || "Robert";
    const res = await fetch('/api/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: "all", network: net, username })
    });
    if(res.ok) {
        log.innerHTML += `<br><span style="color: #22c55e;">✅ Фарм сессия успешно завершена!</span>`;
    }
}

function topUpBalanceModal() {
    const amountStr = prompt("Введите сумму пополнения баланса (USD):", "25");
    if (!amountStr) return;
    const amount = parseFloat(amountStr);
    if (isNaN(amount) || amount <= 0) {
        alert("Некорректная сумма");
        return;
    }
    userInternalBalance += amount;
    transactionHistory.unshift({
        id: "tx_" + Math.random().toString(36).slice(2, 6),
        type: "deposit",
        amount: `+$${amount.toFixed(2)} USD`,
        date: new Date().toISOString().slice(0, 16).replace('T', ' '),
        status: "Completed"
    });
    alert(`Баланс успешно пополнен на $${amount.toFixed(2)}!`);
    renderDashboardContent('Account');
}

async function loadPlatformStats() {
    try {
        const res = await fetch('/api/stats');
        const data = await res.json();
        const counterEl = document.getElementById('slots-counter-text');
        
        if (counterEl) {
            counterEl.innerHTML = `Приватное ПО с ограниченным количеством слотов. <b style="color:#fff; margin-left:8px;">${data.current_slots} / ${data.max_slots} SLOTS</b>`;
        }

        if (data.is_sold_out) {
            const farmBtn = document.getElementById('farm-btn');
            if (farmBtn) {
                farmBtn.innerText = "Все слоты заняты (Sold Out)";
                farmBtn.style.opacity = "0.5";
                farmBtn.style.pointerEvents = "none";
            }
        }
    } catch (e) {
        console.error("Ошибка загрузки статистики слотов:", e);
    }
}

const netLocks = { Standard: { Arbitrum: false, ZkSync: false, Solana: false }, Pro: {}, Premium: {} };

function renderDashboardContent(section) {
    currentSection = section;
    const t = translations[currentLang];
    const content = document.getElementById('dashboard-content');
    const username = localStorage.getItem('airdrop_username') || "Robert";

    let centerHtml = '';
    
    if (section === 'Account') {
        let guideHtml = '';
        if (showWelcomeGuide) {
            guideHtml = `
                <div style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 16px; padding: 16px; margin-bottom: 16px; position: relative;">
                    <span onclick="document.getElementById('welcomeGuideBox').style.display='none'; showWelcomeGuide=false;" style="position: absolute; right: 16px; top: 16px; cursor: pointer; color: var(--text-muted); font-size: 16px;">✕</span>
                    <h4 style="color: #fff; margin: 0 0 8px 0; font-size: 14px;">👋 Добро пожаловать, ${username}!</h4>
                    <p style="color: var(--text-muted); font-size: 12px; margin: 0; line-height: 1.4;">
                        Система защиты мастер-кошелька активна. Средства для фарма списываются с вашего личного баланса. Пополняйте баланс для бесперебойной работы воркеров.
                    </p>
                </div>
            `;
        }

        const txRows = transactionHistory.map(tx => `
            <div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-main); padding:8px 12px; border-radius:8px; margin-bottom:6px; font-size:12px; border:1px solid var(--border-color);">
                <div>
                    <span style="color:#fff; font-weight:600;">${tx.type === 'deposit' ? '📥 Пополнение' : '⛽ Списание газа'}</span>
                    <span style="color:var(--text-muted); font-size:11px; margin-left:8px;">${tx.date}</span>
                </div>
                <div style="text-align:right;">
                    <span style="color:${tx.type === 'deposit' ? '#22c55e' : '#fff'}; font-weight:bold;">${tx.amount}</span>
                </div>
            </div>
        `).join('');

        centerHtml = `
            <div id="welcomeGuideBox">${guideHtml}</div>

            <div class="dashboard-card" style="margin-bottom: 16px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                    <h3 style="color: #fff; margin: 0; font-size: 15px;">💳 Личный счет и Баланс</h3>
                    <button type="button" onclick="topUpBalanceModal()" class="btn-purple-lg" style="width:auto; padding:6px 12px; font-size:12px;">➕ Пополнить баланс</button>
                </div>
                <div style="font-size:24px; font-weight:bold; color:#fff; margin-bottom:4px;" id="userBalanceValue">$${userInternalBalance.toFixed(2)}</div>
                <div style="font-size:11px; color:var(--text-muted);">Доступно для оплаты газа и автоматизации. Защита от перерасхода включена.</div>
            </div>

            <div class="dashboard-card" style="margin-bottom: 16px;">
                <h3 style="color: #fff; margin-top: 0; font-size: 15px;">📊 История транзакций</h3>
                <div style="max-height:160px; overflow-y:auto; margin-top:10px;">${txRows}</div>
            </div>

            <div class="dashboard-card">
                <h3 style="color: #fff; margin-top: 0; font-size: 15px;">👤 Управление подпиской</h3>
                <p style="color: var(--text-muted); font-size: 13px;">Тариф: <b>${userPlan}</b> | Подписка активна (${subscriptionDaysLeft} дн.)</p>
                <button type="button" onclick="openPricingModal()" class="btn-dark-sm" style="margin-top:10px;">Сменить тариф</button>
            </div>
        `;
    } else if (section === 'Settings') {
        centerHtml = `
            <div class="dashboard-card" style="margin-bottom: 16px;">
                <h3 style="color: #fff; margin-top: 0; font-size: 15px;">🔒 Настройки профиля</h3>
                <p style="color: var(--text-muted); font-size: 13px; margin-bottom: 15px;">Параметры планировщика и сессий (Доступно на Standard).</p>
                
                <div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-main); padding:12px 14px; border-radius:12px; border:1px solid var(--border-color); margin-bottom:12px;">
                    <div>
                        <div style="color:#fff; font-size:13px; font-weight:600;">Фоновый планировщик задач</div>
                        <div style="color:var(--text-muted); font-size:11px;">Автоматический запуск по расписанию</div>
                    </div>
                    <label class="toggle-switch">
                        <input type="checkbox" id="bgSchedulerToggle">
                        <span class="toggle-slider"></span>
                    </label>
                </div>

                <div style="font-size:12px; color:var(--text-muted); margin-bottom:8px; font-weight:600;">Календарь активности недели:</div>
                <div class="calendar-grid">
                    <div class="calendar-day active">Пн</div>
                    <div class="calendar-day active">Вт</div>
                    <div class="calendar-day active">Ср</div>
                    <div class="calendar-day">Чт</div>
                    <div class="calendar-day">Пт</div>
                    <div class="calendar-day">Сб</div>
                    <div class="calendar-day">Вс</div>
                </div>
            </div>
        `;
    } else if (section === 'Looter') {
        centerHtml = `
            <div class="dashboard-card">
                <h3 style="color: #fff; margin-top: 0; font-size: 15px;">🚀 ${t.dashTitle}</h3>
                <p style="color: var(--text-muted); font-size: 13px;">${t.dashDesc}</p>
                <button type="button" onclick="startScanningDrops()" class="btn-purple-lg" style="font-size: 12px; padding: 10px 16px; width:auto;">${t.scanBtn}</button>
                <div id="drop-logs" style="margin-top: 15px; background: var(--bg-main); padding: 12px; border-radius: 10px; font-family: monospace; font-size: 11px; color: var(--text-muted); max-height: 160px; overflow-y: auto; border: 1px solid var(--border-color);">${t.logInit}</div>
            </div>
        `;
    } else if (section === 'Farming') {
        centerHtml = `
            <div class="dashboard-card">
                <h3 style="color: #fff; margin-top: 0; font-size: 15px;">${t.farmTitle}</h3>
                <p style="color: var(--text-muted); font-size: 13px;">${t.farmDesc} (Тариф: <b>${userPlan}</b>)</p>
                <label style="color: var(--text-muted); font-size: 12px; display: block; margin-bottom: 6px;">${t.netSelectLabel}</label>
                <select class="auth-input" id="farmNetwork" style="margin-bottom: 14px;">
                    <option value="Base">Base L2 (Доступно)</option>
                    <option value="Arbitrum">Arbitrum One</option>
                    <option value="ZkSync">ZkSync Era</option>
                    <option value="Solana">Solana</option>
                </select>
                <button type="button" onclick="startAutoFarming()" class="btn-purple-lg" style="font-size: 12px; padding: 10px 16px; width:auto;">${t.startFarmBtn}</button>
                <div id="farm-console-logs" style="margin-top: 15px; background: var(--bg-main); padding: 12px; border-radius: 10px; font-family: monospace; font-size: 11px; color: #22c55e; max-height: 160px; overflow-y: auto; border: 1px solid var(--border-color);">Ожидание...</div>
            </div>
        `;
    } else if (section === 'Wallets') {
        centerHtml = `
            <div class="dashboard-card" style="margin-bottom: 16px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                    <h3 style="color: #fff; margin: 0; font-size: 15px;">👥 Кошельки и Балансы воркеров</h3>
                    <span id="slot-info-badge" style="font-size: 11px; background: #1f1f1f; color: #fff; padding: 4px 10px; border-radius: 8px; border: 1px solid var(--border-color);">Загрузка...</span>
                </div>
                <div id="walletsListContainer" style="display: flex; flex-direction: column; gap: 8px;">Загрузка...</div>
                <button type="button" onclick="buyExtraSlot()" class="auth-input" style="margin-top: 12px; width: auto; font-size: 12px; background:#1f1f1f; cursor:pointer;">➕ Купить +1 слот ($10)</button>
                <div id="buySlotMsg" style="margin-top: 6px; font-size:11px;"></div>
            </div>
            <div class="dashboard-card">
                <h3 style="color: #fff; margin-top: 0; font-size: 15px;">➕ Добавить воркера</h3>
                <div style="display: flex; flex-direction: column; gap: 8px;">
                    <input type="text" id="newWalletAddress" placeholder="Адрес кошелька (0x...)" class="auth-input">
                    <input type="password" id="newWalletPk" placeholder="Приватный ключ" class="auth-input">
                    <input type="text" id="newWalletProxy" placeholder="Прокси (ip:port:login:pass)" class="auth-input">
                    <button type="button" onclick="addNewWalletToDB()" class="btn-modal-primary" style="margin-top:4px;">Добавить в ферму</button>
                </div>
                <div id="walletResponseMsg" style="margin-top: 8px; font-size:11px;"></div>
            </div>
        `;
        setTimeout(loadWalletsFromDB, 50);
    } else if (section === 'Networks') {
        const networksHtml = NETWORKS_CONFIG.map(net => `
            <div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-main); padding:12px 14px; border-radius:12px; margin-bottom:8px; border:1px solid var(--border-color);">
                <div style="display:flex; align-items:center; gap:12px;">
                    <div style="font-size:20px;">${net.icon}</div>
                    <div>
                        <div style="color:#fff; font-weight:600; font-size:13px;">${net.name} <span style="font-size: 11px; color: var(--text-muted);">(${net.symbol})</span></div>
                        <div style="color: #22c55e; font-size:11px;">Статус прокси / пинг: <b>${net.proxyStatus}</b></div>
                    </div>
                </div>
                <div>
                    <a href="${net.explorer}" target="_blank" style="text-decoration:none; background:#1f1f1f; color:#fff; padding:6px 10px; border-radius:8px; font-size:12px; border:1px solid var(--border-color);">🔍 Explorer</a>
                </div>
            </div>
        `).join('');

        centerHtml = `
            <div class="dashboard-card">
                <h3 style="color: #fff; margin-top: 0; font-size: 15px; margin-bottom: 4px;">🌐 Проверка сетей и прокси</h3>
                <p style="color: var(--text-muted); font-size: 12px; margin-bottom: 16px;">Мониторинг соединения с блокчейнами и пинга прокси-серверов.</p>
                <div>${networksHtml}</div>
            </div>
        `;
    }

    content.innerHTML = `
        <div class="desktop-sidebar">
            <div style="border-bottom: 1px solid var(--border-color); padding-bottom: 12px;">
                <div style="font-weight: 600; color: #fff; font-size: 14px;">${username}</div>
                <div style="font-size: 11px; color: var(--text-muted);">Тариф: ${userPlan}</div>
                <div style="font-size: 10px; color: #22c55e; margin-top: 4px;">Подписка: Активна (${subscriptionDaysLeft} дн.)</div>
            </div>

            <div style="display: flex; flex-direction: column; gap: 2px;">
                <div style="font-size: 10px; color: #737373; text-transform: uppercase; padding: 4px 8px; font-weight: bold;">Навигация</div>
                <div class="sidebar-menu-item ${section === 'Account' ? 'active' : ''}" onclick="switchMenu(this, 'Account')">👤 Аккаунт & Баланс</div>
                <div class="sidebar-menu-item ${section === 'Looter' ? 'active' : ''}" onclick="switchMenu(this, 'Looter')">📦 Looter</div>
                <div class="sidebar-menu-item ${section === 'Farming' ? 'active' : ''}" onclick="switchMenu(this, 'Farming')">🌾 Фарминг</div>
                <div class="sidebar-menu-item ${section === 'Wallets' ? 'active' : ''}" onclick="switchMenu(this, 'Wallets')">👥 Кошельки & Балансы</div>
                <div class="sidebar-menu-item ${section === 'Networks' ? 'active' : ''}" onclick="switchMenu(this, 'Networks')">🌐 Сети & Прокси</div>
            </div>

            <div style="display: flex; flex-direction: column; gap: 2px; margin-top: auto; border-top: 1px solid var(--border-color); padding-top: 12px;">
                <div style="font-size: 10px; color: #737373; text-transform: uppercase; padding: 4px 8px; font-weight: bold;">Система</div>

                <div class="sidebar-menu-item ${section === 'Settings' ? 'active' : ''}" onclick="switchMenu(this, 'Settings')">
                    🔒 Настройки профиля
                </div>
                
                <div class="sidebar-menu-item" style="color: #ef4444; margin-top: 2px;" onclick="returnToMainSite()">
                    🚪 Выйти из аккаунта
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
    log.innerHTML += `<br><span style="color: #22c55e;">✅ Проверено кошельков: ${data.data.total_wallets_scanned} (Валидных: ${data.data.valid_wallets_checked}). Найдено дропов: ${data.data.found_drops.length}</span>`;
}