// --- Глобальные переменные и состояние ---
let currentLang = localStorage.getItem('ax_lang') || 'ru';
let isLoggedIn = false;
let currentSection = 'Account';
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
const PLAN_LABELS = { Standard: 'Standard', Pro: 'PRO Фермер', Premium: 'Premium VIP' };
const clientSessionId = getOrCreateClientSessionId();
let paymentAccessToken = sessionStorage.getItem('ax_payment_token') || '';
let paymentUnlocked = sessionStorage.getItem('ax_paid_session_id') === clientSessionId && !!paymentAccessToken;

const MASTER_WALLET = "0x5e5316Dea1c44d220d4c60A5fcC2949E5A06Fc66";

const NETWORKS_CONFIG = [
    { name: "Ethereum", symbol: "ETH", key: "Ethereum", icon: '<img src="https://cryptologos.cc/logos/ethereum-eth-logo.svg?v=032" style="width:24px; height:24px;">', explorer: "https://etherscan.io" },
    { name: "Base", symbol: "ETH", key: "Base", icon: '<img src="https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/base/info/logo.png" style="width:24px; height:24px; border-radius:50%;">', explorer: "https://basescan.org" },
    { name: "Arbitrum", symbol: "ETH", key: "Arbitrum", icon: '<img src="https://cryptologos.cc/logos/arbitrum-arb-logo.svg?v=032" style="width:24px; height:24px;">', explorer: "https://arbiscan.io" },
    { name: "Linea", symbol: "Linea", key: "Linea", icon: '<img src="https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/linea/info/logo.png" style="width:24px; height:24px; border-radius:50%;">', explorer: "https://lineascan.build" },
    { name: "Solana", symbol: "SOL", key: "Solana", icon: '<img src="https://cryptologos.cc/logos/solana-sol-logo.svg?v=032" style="width:24px; height:24px;">', explorer: "https://solscan.io" },
    { name: "BNB Chain", symbol: "BNB", key: "BNB Chain", icon: '<img src="https://cryptologos.cc/logos/bnb-bnb-logo.svg?v=032" style="width:24px; height:24px;">', explorer: "https://bscscan.com" },
    { name: "Polygon", symbol: "POL", key: "Polygon", icon: '<img src="https://cryptologos.cc/logos/polygon-matic-logo.svg?v=032" style="width:24px; height:24px;">', explorer: "https://polygonscan.com" },
    { name: "Optimism", symbol: "OP", key: "Optimism", icon: '<img src="https://cryptologos.cc/logos/optimism-ethereum-op-logo.svg?v=032" style="width:24px; height:24px;">', explorer: "https://optimistic.etherscan.io" },
    { name: "Tron", symbol: "TRX", key: "Tron", icon: '<img src="https://cryptologos.cc/logos/tron-trx-logo.svg?v=032" style="width:24px; height:24px;">', explorer: "https://tronscan.org" }
];

// --- Полный словарь переводов (Лендинг, Дашборд, Модалки, Тарифы, Оплата) ---
const translations = {
    ru: {
        langCode: "RU", login: "Войти", logout: "Выйти", loading: "Загрузка...", days: "дн.",
        privateSoftware: "Приватное ПО",
        
        heroTitle: "Универсальный инструмент<br>для автоматизации и сбора Airdrop.",
        heroDesc: "Фармите поинты, сканируйте кошельки на наличие распределений и клеймите аирдропы в один клик с защитой Anti-Sybil.",
        farmBtn: "Получить доступ", settingsBtn: "Подробнее",
        coreStatus: "Защищено / Онлайн",
        featuresHeading: "Возможности платформы",
        feat1Title: "Drop Scanner & Looter",
        feat1Desc: "Автоматический поиск доступных для клейма аирдропов и ретродропов по всем подключенным кошелькам.",
        feat2Title: "Multi-Chain Swaps & Bridges",
        feat2Desc: "Рандомизированные кроссчейн свапы и транзакции в сетях LayerZero, Base, Arbitrum и ZkSync для набива объемов.",
        feat3Title: "Sybil Shield",
        feat3Desc: "Имитация паттернов реального пользователя и интеллектуальное распределение газа без связей между кошельками.",
        
        instructionHeading: "Как работает AIRDROP-X (Инструкция)",
        inst1Title: "🌾 1. Авто-фарм и Anti-Sybil Ядро",
        inst1DescBold: "Что это и почему это выгодно:",
        inst1DescText: "Ручное выполнение сотен транзакций в день отнимает уйму сил и времени. Наш авто-фарминг через встроенное ядро полностью имитирует активность живого пользователя.",
        inst1DescText2: "Софт рандомизирует задержки, порядок кошельков и суммы транзакций, защищая от сибил-банов.",
        ph1: "GIF-анимация процесса авто-фарма",
        
        inst2Title: "👥 2. Лимиты и добавление кошельков",
        inst2DescBold: "Удобство и защита тарифов:",
        inst2DescText: "Тариф Standard позволяет запустить до 5 кошельков (для теста), PRO открывает до 15 слотов, а Premium расширяет лимит до 30 кошельков.",
        inst2DescText2: "Импортируйте ключи и прокси в один клик, управляя всей фермой из единой панели.",
        ph2: "Скриншот импорта кошельков",
        
        inst3Title: "📦 3. Автоматический сбор лута (Claim Looter)",
        inst3DescBold: "Когда и как это происходит:",
        inst3DescText: "Как только проект объявляет раздачу ретродропа, сканер находит распределенные токены.",
        inst3DescText2: "Поддерживаются Base, Arbitrum, ZkSync, Scroll, Solana и др. Один клик — и награды у вас.",
        ph3: "GIF-анимация клейма наград",
        
        inst4Title: "🔔 4. Система уведомлений и планировщик",
        inst4DescBold: "Контроль и отчеты в реальном времени:",
        inst4DescText: "Получайте детальные отчеты о каждой сессии фарма, расходе газа, статусе прокси и найденном луте прямо в Telegram-бот.",
        ph4: "Скриншот Telegram-отчета от бота",

        faqHeading: "Часто задаваемые вопросы",
        faq1Q: "Как работает авто-клейм аирдропов?",
        faq1A: "Софт автоматически сканирует все подключенные кошельки по API и смарт-контрактам на наличие доступных распределений, собирая их в мастер-кошелек с рандомизацией.",
        faq2Q: "В чем разница между Standard и PRO?",
        faq2A: "Standard подходит для новичков и поддерживает до 5 воркеров. PRO открывает продвинутые стратегии, до 15 слотов и приоритетное исполнение транзакций.",
        faq3Q: "Нужно ли настраивать прокси для каждого кошелька?",
        faq3A: "Рекомендуется привязывать индивидуальный прокси (особенно резидентный или мобильный) к каждому воркеру для абсолютной безопасности от Anti-Sybil систем.",
        faq4Q: "Как получить доступ к софту?",
        faq4A: "Выберите подходящий тариф на сайте, совершите оплату криптовалютой в поддерживаемой сети и зарегистрируйтесь, используя полученный токен оплаты.",

        footerPrivacy: "Privacy Policy",
        footerTerms: "Terms of Use",

        // Модалка тарифов
        pTitleModal: "⚡ Выберите тарифный план AIRDROP-X",
        pDescModal: "Закрытый доступ: оплата активации за первый месяц, далее ежемесячное продление.",
        subTop: "ВХОД + ПОДПИСКА",
        
        stdName: "Стандарт",
        stdPer: "/ 1-й месяц, далее $30/мес",
        stdF1: "Лимит: до 5 кошельков (воркеров)",
        stdF2: "Только сеть Base L2",
        stdF3: "Базовый Claim Looter и Anti-Sybil",
        stdBtn: "Активировать за $95",
        
        proBadge: "Рекомендуемый",
        proName: "PRO Фермер",
        proPer: "/ 1-й месяц, далее $50/мес",
        proF1: "Лимит до 15 кошельков (воркеров)",
        proF2: "Все сети кроме Solana (Arbitrum, ZkSync, Scroll...)",
        proF3: "Автоматический фоновый планировщик",
        proF4: "Приоритетная поддержка 24/7",
        proBtn: "Активировать за $150",
        
        premName: "Premium VIP",
        premPer: "/ 1-й месяц, далее $90/мес",
        premF1: "Лимит до 30 слотов кошельков",
        premF2: "Все текущие и будущие блокчейны",
        premF3: "Telegram Webhook пуш-уведомления",
        premF4: "Личный менеджер и ранний доступ",
        premBtn: "Активировать за $280",

        // Модалка оплаты
        payTitle: "Оплата",
        payNetwork: "Сеть:",
        payAmount: "Сумма:",
        payWallet: "Кошелек",
        payCopy: "📋 Копировать",
        payTxid: "TXID транзакции",
        payConfirm: "Подтвердить",

        // Меню и Дашборд
        menuMain: "Меню", menuAcc: "👤 Аккаунт & Баланс", menuLooter: "📦 Looter", menuFarm: "🌾 Фарминг", 
        menuWallets: "👥 Кошельки & Балансы", menuNet: "🌐 Сети & Прокси", menuSet: "🔒 Настройки профиля", menuExit: "🚪 Выйти из аккаунта",
        
        accWelcome: "Добро пожаловать",
        accWelcomeDesc: "Система защиты мастер-кошелька активна. Средства для фарма списываются с вашего личного баланса. Пополняйте баланс для бесперебойной работы воркеров.",
        accTitle: "💳 Личный счет и Баланс", btnTopUp: "➕ Пополнить баланс",
        accDesc: "Доступно для оплаты газа и автоматизации. Защита от перерасхода включена.",
        txTitle: "📊 История транзакций", noTx: "У вас пока не было осуществленных транзакций",
        txDep: "📥 Пополнение", txSlot: "🛒 Покупка слота", txGas: "⛽ Списание газа",
        subTitle: "👤 Управление подпиской", subPlan: "Тариф", subActive: "Подписка активна", btnChangePlan: "Сменить тариф",

        lootTitle: "Панель поиска и авто-сбора лута",
        lootDesc: "Сканируйте свои кошельки на наличие незабранных наград и запускайте авто-фарминг объема.",
        btnScan: "🔍 Запустить авто-сбор (Claim Looter)", logInitLoot: "[System] Антифрод-ядро инициализировано. Ожидание сканирования...",
        
        farmTitle: "Anti-Sybil Swaps & Bridges (Фарм объемов)",
        farmDesc: "Запуск боевого ядра с рандомизацией пауз и порядка воркеров.",
        netSelect: "Целевая сеть для фарма:", netPh: "Выберите сеть:", btnFarm: "▶ Запустить Anti-Sybil Ядро",
        logWait: "Ожидание...", logStart: "Запуск фарма в сети", logCost: "Списано", logErrNet: "Сеть не выбрана.", logErrBal: "Недостаточно средств на балансе.", logSuccess: "Фарм сессия успешно завершена! Отчет отправлен в Telegram.",

        walTitle: "👥 Кошельки и Балансы воркеров", slotsLabel: "Слоты", btnBuySlot: "➕ Купить +1 слот ($10)",
        walAddTitle: "➕ Добавить воркера", phAddr: "Адрес кошелька (0x...)", phPk: "Приватный ключ", phProxy: "Прокси (ip:port:login:pass)",
        proxyTipTitle: "Рекомендация по прокси:", proxyTipDesc: "Для безопасного фарма лучше использовать <b>резидентные</b> или <b>мобильные</b> прокси. Обычные серверные IP имеют высокий риск банов.",
        btnAddWal: "Добавить в ферму", btnTest: "🔍 Проверить", btnDel: "Удалить", noWal: "Кошельков пока нет.",
        balLabel: "Баланс:", proxyLabel: "Proxy:", proxyNone: "Не задан",

        netTitle: "🌐 Проверка сетей, прокси и газа", netDesc: "Мониторинг соединения с блокчейнами, пинга и актуальной стоимости газа в сети.",
        statusOnline: "Онлайн", gasLabel: "Газ в реальном времени:", btnExp: "🔍 Обозреватель",

        setWarnTitle: "Anti-Sybil Защита Активна", setWarnDesc: "Настройте уникальное время и задержку для каждого отдельного дня недели (1–4 активных дня). Это гарантирует максимальную рандомизацию фермы.",
        setTitle: "🔒 Настройки планировщика и Anti-Sybil", setDesc: "Расписание, индивидуальные тайминги дней и лимиты.", btnRand: "🎲 Max Рандом (1-4 дня)",
        setBgTitle: "Фоновый планировщик задач", setBgDesc: "Автоматический запуск по расписанию",
        setDays: "Дни активности бота (нажмите, чтобы включить/выключить день):", setTimeTitle: "Индивидуальное время запуска и задержка:",
        timeAlert: "ℹ️ Время запуска указывается по вашему <b>местному времени</b> в 24-часовом формате.",
        tTime: "Время:", tMin: "Мин(с):", tMax: "Макс(с):",
        setGwei: "Максимальный лимит газа (Max Gwei, макс. 300):", setTg: "Telegram Chat ID для уведомлений:", tgPh: "@username или ID",
        tgTip: "Перейдите в бота", tgTip2: "и отправьте", tgTip3: "перед сохранением.",
        notifTitle: "🔔 Фильтрация уведомлений в Telegram:", notif1: "Сохранение настроек", notif2: "Запуск сессий фарма", notif3: "Успешное завершение", notif4: "Ошибки и пропуски",
        btnSaveSet: "💾 Сохранить настройки профиля",
        
        calDays: { 'Пн': 'Пн', 'Вт': 'Вт', 'Ср': 'Ср', 'Чт': 'Чт', 'Пт': 'Пт', 'Сб': 'Сб', 'Вс': 'Вс' }
    },
    en: {
        langCode: "EN", login: "Login", logout: "Logout", loading: "Loading...", days: "days",
        privateSoftware: "Private Software",
        
        heroTitle: "Universal tool<br>for automation and Airdrop farming.",
        heroDesc: "Farm points, scan wallets for distributions, and claim airdrops in one click with Anti-Sybil protection.",
        farmBtn: "Get Access", settingsBtn: "Learn More",
        coreStatus: "Protected / Online",
        featuresHeading: "Platform Features",
        feat1Title: "Drop Scanner & Looter",
        feat1Desc: "Automatic search for claimable airdrops and retro-drops across all connected wallets.",
        feat2Title: "Multi-Chain Swaps & Bridges",
        feat2Desc: "Randomized cross-chain swaps and transactions in LayerZero, Base, Arbitrum, and ZkSync networks to build volume.",
        feat3Title: "Sybil Shield",
        feat3Desc: "Real user pattern simulation and intelligent gas distribution without wallet linkages.",
        
        instructionHeading: "How AIRDROP-X Works (Guide)",
        inst1Title: "🌾 1. Auto-Farm & Anti-Sybil Core",
        inst1DescBold: "What it is and why it's profitable:",
        inst1DescText: "Executing hundreds of transactions manually every day takes a lot of time and effort. Our auto-farming via the built-in core fully simulates real user activity.",
        inst1DescText2: "The software randomizes delays, wallet order, and transaction amounts, protecting you from sybil bans.",
        ph1: "Auto-farm process GIF animation",
        
        inst2Title: "👥 2. Limits & Adding Wallets",
        inst2DescBold: "Convenience and tariff security:",
        inst2DescText: "The Standard plan allows running up to 5 wallets (for testing), PRO unlocks up to 15 slots, and Premium expands the limit to 30 wallets.",
        inst2DescText2: "Import keys and proxies in one click and manage your entire farm from a single panel.",
        ph2: "Wallet import screenshot",
        
        inst3Title: "📦 3. Claim Looter (Auto-Collect)",
        inst3DescBold: "When and how it happens:",
        inst3DescText: "As soon as a project announces a retro-drop, the scanner finds distributed tokens.",
        inst3DescText2: "Supported networks include Base, Arbitrum, ZkSync, Scroll, Solana, and more. One click and the rewards are yours.",
        ph3: "Claim rewards GIF animation",
        
        inst4Title: "🔔 4. Telegram Notifications & Scheduler",
        inst4DescBold: "Real-time control and reports:",
        inst4DescText: "Get detailed reports on every farming session, gas consumption, proxy status, and found loot directly in your Telegram bot.",
        ph4: "Telegram bot report screenshot",

        faqHeading: "Frequently Asked Questions",
        faq1Q: "How does auto-claim for airdrops work?",
        faq1A: "The software automatically scans all connected wallets via API and smart contracts for available distributions, aggregating them into a master wallet with randomization.",
        faq2Q: "What is the difference between Standard and PRO?",
        faq2A: "Standard is suitable for beginners and supports up to 5 workers. PRO unlocks advanced strategies, up to 15 slots, and priority transaction execution.",
        faq3Q: "Do I need to configure a proxy for each wallet?",
        faq3A: "It is recommended to bind an individual proxy (especially residential or mobile) to each worker for absolute security against Anti-Sybil systems.",
        faq4Q: "How to get access to the software?",
        faq4A: "Select a suitable plan on the website, make payment in cryptocurrency in a supported network, and register using the received payment token.",

        footerPrivacy: "Privacy Policy",
        footerTerms: "Terms of Use",

        // Pricing Modal
        pTitleModal: "⚡ Select AIRDROP-X Pricing Plan",
        pDescModal: "Private access: activation payment for the first month, then monthly renewal.",
        subTop: "LOGIN + SUBSCRIPTION",
        
        stdName: "Standard",
        stdPer: "/ 1st month, then $30/mo",
        stdF1: "Limit: up to 5 wallets (workers)",
        stdF2: "Base L2 network only",
        stdF3: "Basic Claim Looter and Anti-Sybil",
        stdBtn: "Activate for $95",
        
        proBadge: "RECOMMENDED",
        proName: "PRO Farmer",
        proPer: "/ 1st month, then $50/mo",
        proF1: "Limit up to 15 wallets (workers)",
        proF2: "All networks except Solana (Arbitrum, ZkSync, Scroll...)",
        proF3: "Automatic background scheduler",
        proF4: "Priority 24/7 support",
        proBtn: "Activate for $150",
        
        premName: "Premium VIP",
        premPer: "/ 1st month, then $90/mo",
        premF1: "Limit up to 30 wallet slots",
        premF2: "All current and future blockchains",
        premF3: "Telegram Webhook push notifications",
        premF4: "Personal manager and early access",
        premBtn: "Activate for $280",

        // Payment Modal
        payTitle: "Payment",
        payNetwork: "Network:",
        payAmount: "Amount:",
        payWallet: "Wallet",
        payCopy: "📋 Copy",
        payTxid: "TXID",
        payConfirm: "Confirm",

        // Menu and Dashboard
        menuMain: "Menu", menuAcc: "👤 Account & Balance", menuLooter: "📦 Looter", menuFarm: "🌾 Farming", 
        menuWallets: "👥 Wallets & Balances", menuNet: "🌐 Networks & Proxies", menuSet: "🔒 Profile Settings", menuExit: "🚪 Logout",
        
        accWelcome: "Welcome",
        accWelcomeDesc: "Master-wallet protection is active. Farming fees are deducted from your personal balance. Top up your balance for uninterrupted worker operation.",
        accTitle: "💳 Personal Account & Balance", btnTopUp: "➕ Top up balance",
        accDesc: "Available for gas and automation fees. Overspend protection is enabled.",
        txTitle: "📊 Transaction History", noTx: "You have no completed transactions yet",
        txDep: "📥 Deposit", txSlot: "🛒 Slot Purchase", txGas: "⛽ Gas Fee",
        subTitle: "👤 Subscription Management", subPlan: "Plan", subActive: "Subscription active", btnChangePlan: "Change Plan",

        lootTitle: "Loot Search & Auto-Claim Panel",
        lootDesc: "Scan your wallets for unclaimed rewards and launch volume auto-farming.",
        btnScan: "🔍 Run Auto-Claim (Looter)", logInitLoot: "[System] Anti-fraud core initialized. Awaiting scan...",
        
        farmTitle: "Anti-Sybil Swaps & Bridges (Volume Farm)",
        farmDesc: "Launch combat core with randomized pauses and worker order.",
        netSelect: "Target network for farming:", netPh: "Select network:", btnFarm: "▶ Start Anti-Sybil Core",
        logWait: "Awaiting...", logStart: "Starting farm in network", logCost: "Deducted", logErrNet: "Network not selected.", logErrBal: "Insufficient funds.", logSuccess: "Farm session completed successfully! Report sent to Telegram.",

        walTitle: "👥 Wallets and Worker Balances", slotsLabel: "Slots", btnBuySlot: "➕ Buy +1 Slot ($10)",
        walAddTitle: "➕ Add Worker", phAddr: "Wallet Address (0x...)", phPk: "Private Key", phProxy: "Proxy (ip:port:login:pass)",
        proxyTipTitle: "Proxy Recommendation:", proxyTipDesc: "For safe farming, it is better to use <b>residential</b> or <b>mobile</b> proxies. Datacenter IPs have a high risk of bans.",
        btnAddWal: "Add to Farm", btnTest: "🔍 Test", btnDel: "Delete", noWal: "No wallets added yet.",
        balLabel: "Balance:", proxyLabel: "Proxy:", proxyNone: "Not set",

        netTitle: "🌐 Network, Proxy, and Gas Check", netDesc: "Monitor blockchain connections, ping, and real-time gas costs.",
        statusOnline: "Online", gasLabel: "Real-time Gas:", btnExp: "🔍 Explorer",

        setWarnTitle: "Anti-Sybil Protection Active", setWarnDesc: "Set unique timing and delays for each individual day of the week (1–4 active days). This ensures maximum farm randomization.",
        setTitle: "🔒 Scheduler & Anti-Sybil Settings", setDesc: "Schedules, individual day timings, and limits.", btnRand: "🎲 Max Random (1-4 days)",
        setBgTitle: "Background Task Scheduler", setBgDesc: "Automatic scheduled launch",
        setDays: "Bot activity days (click to toggle day):", setTimeTitle: "Individual start time and delay:",
        timeAlert: "ℹ️ Start time is specified in your <b>local time</b> in 24-hour format.",
        tTime: "Time:", tMin: "Min(s):", tMax: "Max(s):",
        setGwei: "Maximum Gas Limit (Max Gwei, max 300):", setTg: "Telegram Chat ID for notifications:", tgPh: "@username or ID",
        tgTip: "Go to bot", tgTip2: "and send", tgTip3: "before saving.",
        notifTitle: "🔔 Telegram Notification Filtering:", notif1: "Settings saved", notif2: "Farm session start", notif3: "Successful completion", notif4: "Errors and skips",
        btnSaveSet: "💾 Save Profile Settings",

        calDays: { 'Пн': 'Mo', 'Вт': 'Tu', 'Ср': 'We', 'Чт': 'Th', 'Пт': 'Fr', 'Сб': 'Sa', 'Вс': 'Su' }
    },
    cn: {
        langCode: "CN", login: "登录", logout: "登出", loading: "加载中...", days: "天",
        privateSoftware: "私有软件",
        
        heroTitle: "用于自动化和空投交互的<br>通用工具。",
        heroDesc: "通过防女巫保护，一键刷积分、扫描钱包分发并领取空投。",
        farmBtn: "获取权限", settingsBtn: "了解更多",
        coreStatus: "已保护 / 在线",
        featuresHeading: "平台功能",
        feat1Title: "空投扫描与收集",
        feat1Desc: "自动扫描所有连接钱包中可领取的空投和retro-drop。",
        feat2Title: "多链兑换与跨链",
        feat2Desc: "在 LayerZero、Base、Arbitrum 和 ZkSync 网络中进行随机跨链交互以增加交易量。",
        feat3Title: "女巫防御盾",
        feat3Desc: "真实用户行为模拟和智能 Gas 分配，钱包之间无关联。",
        
        instructionHeading: "AIRDROP-X 如何工作（指南）",
        inst1Title: "🌾 1. 自动挂机与防女巫核心",
        inst1DescBold: "这是什么以及为什么有利可图：",
        inst1DescText: "每天手动执行数百笔交易需要大量精力和时间。我们的内置核心自动挂机完全模拟真实用户的活动。",
        inst1DescText2: "软件随机化延迟、钱包顺序和交易金额，保护您免受女巫封禁。",
        ph1: "自动挂机过程 GIF 动画",
        
        inst2Title: "👥 2. 限制与添加钱包",
        inst2DescBold: "套餐的便利性与安全性：",
        inst2DescText: "Standard 套餐允许运行最多 5 个钱包（用于测试），PRO 最多可开启 15 个槽位，Premium 将限制扩大到 30 个钱包。",
        inst2DescText2: "一键导入密钥和代理，从单一面板管理整个农场。",
        ph2: "钱包导入截图",
        
        inst3Title: "📦 3. 自动领取空投 (Claim Looter)",
        inst3DescBold: "何时以及如何发生：",
        inst3DescText: "一旦项目宣布空投，扫描器就会找到分发的代币。",
        inst3DescText2: "支持 Base、Arbitrum、ZkSync、Scroll、Solana 等网络。一键点击，奖励即归您所有。",
        ph3: "领取奖励 GIF 动画",
        
        inst4Title: "🔔 4. Telegram 通知系统与调度程序",
        inst4DescBold: "实时控制与报告：",
        inst4DescText: "直接在 Telegram 机器人中接收有关每次挂机交互、Gas 消耗、代理状态和找到的空投的详细报告。",
        ph4: "Telegram 机器人报告截图",

        faqHeading: "常见问题",
        faq1Q: "空投自动领取是如何工作的？",
        faq1A: "该软件通过 API 和智能合约自动扫描所有连接的钱包以寻找可用的分发，并通过随机化将其汇集到主钱包中。",
        faq2Q: "Standard 和 PRO 有什么区别？",
        faq2A: "Standard 适合初学者，最多支持 5 个工作节点。PRO 解锁高级策略、最多 15 个槽位以及优先执行交易。",
        faq3Q: "我需要为每个钱包配置代理吗？",
        faq3A: "建议为每个工作节点绑定单独的代理（尤其是住宅或移动代理），以绝对安全地抵御防女巫系统。",
        faq4Q: "如何获取软件访问权限？",
        faq4A: "在网站上选择合适的套餐，在受支持的网络中使用加密货币付款，并使用收到的付款令牌进行注册。",

        footerPrivacy: "隐私政策",
        footerTerms: "使用条款",

        // Pricing Modal
        pTitleModal: "⚡ 选择 AIRDROP-X 套餐方案",
        pDescModal: "私人访问权限：首月激活费，之后按月续费。",
        subTop: "登录 + 订阅",
        
        stdName: "标准版 (Standard)",
        stdPer: "/ 首月，之后 $30/月",
        stdF1: "限制：最多 5 个钱包（工作节点）",
        stdF2: "仅限 Base L2 网络",
        stdF3: "基础 Claim Looter 和防女巫",
        stdBtn: "以 $95 激活",
        
        proBadge: "推荐",
        proName: "PRO 农场主",
        proPer: "/ 首月，之后 $50/月",
        proF1: "限制最多 15 个钱包（工作节点）",
        proF2: "除 Solana 外的所有网络 (Arbitrum, ZkSync, Scroll...)",
        proF3: "自动后台任务调度程序",
        proF4: "7x24 小时优先客服支持",
        proBtn: "以 $150 激活",
        
        premName: "高级 VIP (Premium)",
        premPer: "/ 首月，之后 $90/月",
        premF1: "最多 30 个钱包槽位限制",
        premF2: "所有当前及未来的区块链",
        premF3: "Telegram Webhook 推送通知",
        premF4: "专属客户经理与抢先体验",
        premBtn: "以 $280 激活",

        // Payment Modal
        payTitle: "付款",
        payNetwork: "网络：",
        payAmount: "金额：",
        payWallet: "钱包",
        payCopy: "📋 复制",
        payTxid: "交易哈希 (TXID)",
        payConfirm: "确认付款",

        // Menu and Dashboard
        menuMain: "菜单", menuAcc: "👤 账户与余额", menuLooter: "📦 空投收集", menuFarm: "🌾 自动交互", 
        menuWallets: "👥 钱包与余额", menuNet: "🌐 网络与代理", menuSet: "🔒 个人资料设置", menuExit: "🚪 退出账号",
        
        accWelcome: "欢迎",
        accWelcomeDesc: "主钱包保护系统已激活。交互Gas费用将从您的个人余额中扣除。请充值余额以确保工作节点不间断运行。",
        accTitle: "💳 个人账户与余额", btnTopUp: "➕ 充值余额",
        accDesc: "可用于支付Gas和自动化费用。超支保护已启用。",
        txTitle: "📊 交易记录", noTx: "您目前没有任何交易记录",
        txDep: "📥 充值", txSlot: "🛒 购买槽位", txGas: "⛽ 扣除Gas",
        subTitle: "👤 订阅管理", subPlan: "套餐", subActive: "订阅有效", btnChangePlan: "更改套餐",

        lootTitle: "空投搜索与自动领取面板",
        lootDesc: "扫描您的钱包以查找未领取的奖励，并启动自动交互以增加交易量。",
        btnScan: "🔍 运行自动领取 (Looter)", logInitLoot: "[System] 防女巫核心已初始化。等待扫描...",
        
        farmTitle: "Anti-Sybil 交换与跨链 (刷交易量)",
        farmDesc: "启动带有随机暂停和随机工作顺序的战斗核心。",
        netSelect: "选择目标网络：", netPh: "选择网络：", btnFarm: "▶ 启动防女巫核心",
        logWait: "等待中...", logStart: "正在启动网络交互", logCost: "已扣除", logErrNet: "未选择网络。", logErrBal: "余额不足。", logSuccess: "交互会话成功完成！报告已发送至 Telegram。",

        walTitle: "👥 钱包和工作节点余额", slotsLabel: "槽位", btnBuySlot: "➕ 购买 +1 槽位 ($10)",
        walAddTitle: "➕ 添加工作节点", phAddr: "钱包地址 (0x...)", phPk: "私钥", phProxy: "代理 (ip:端口:账号:密码)",
        proxyTipTitle: "代理建议：", proxyTipDesc: "为了安全起见，最好使用<b>住宅</b>或<b>移动</b>代理。数据中心 IP 被封禁的风险很高。",
        btnAddWal: "添加到农场", btnTest: "🔍 测试", btnDel: "删除", noWal: "暂无添加的钱包。",
        balLabel: "余额:", proxyLabel: "代理:", proxyNone: "未设置",

        netTitle: "🌐 网络、代理和 Gas 检查", netDesc: "监控区块链连接, 延迟和实时 Gas 成本。",
        statusOnline: "Online", gasLabel: "实时 Gas:", btnExp: "🔍 区块浏览器",

        setWarnTitle: "防女巫保护已激活", setWarnDesc: "为一周中的每一天（1-4 个活跃日）设置独特的时间和延迟。这确保了交互的最大随机性。",
        setTitle: "🔒 计划任务与防女巫设置", setDesc: "时间表、单日时间和限制。", btnRand: "🎲 最大随机 (1-4天)",
        setBgTitle: "后台任务计划程序", setBgDesc: "按计划自动启动",
        setDays: "机器人活跃日 (点击切换):", setTimeTitle: "独立的启动时间和延迟：",
        timeAlert: "ℹ️ 启动时间以您的<b>本地时间</b> (24小时制) 指定。",
        tTime: "时间:", tMin: "最小(秒):", tMax: "最大(秒):",
        setGwei: "最大 Gas 限制 (Max Gwei, 最高 300):", setTg: "接收通知的 Telegram Chat ID:", tgPh: "@username 或 ID",
        tgTip: "前往机器人", tgTip2: "并发送", tgTip3: "然后保存。",
        notifTitle: "🔔 Telegram 通知过滤：", notif1: "保存设置", notif2: "交互会话开始", notif3: "成功完成", notif4: "错误和跳过",
        btnSaveSet: "💾 保存个人资料设置",

        calDays: { 'Пн': '一', 'Вт': '二', 'Ср': '三', 'Чт': '四', 'Пт': '五', 'Сб': '六', 'Вс': '日' }
    }
};

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

// 🌍 Обновление всего статического текста, инструкции, FAQ, тарифов и оплаты
function updateStaticText(lang) {
    const t = translations[lang];
    if (!t) return;
    
    const loginBtn = document.getElementById('login-btn');
    if (loginBtn) loginBtn.innerText = t.login;

    const badge = document.getElementById('current-lang-badge');
    const text = document.getElementById('current-lang-text');
    if (badge) badge.innerText = t.langCode;
    if (text) text.innerText = t.langCode;

    const counterEl = document.getElementById('slots-counter-text');
    if (counterEl && window.cachedStatsData) {
        counterEl.innerHTML = `${t.privateSoftware}. <b style="color:#fff; margin-left:8px;">${window.cachedStatsData.current_slots} / ${window.cachedStatsData.max_slots} SLOTS</b>`;
    }

    const mainContent = document.getElementById('main-content');
    if (mainContent) {
        const h1 = mainContent.querySelector('h1');
        if (h1) h1.innerHTML = t.heroTitle;

        const heroDesc = mainContent.querySelector('h1 + p, .hero-desc');
        if (heroDesc) heroDesc.innerText = t.heroDesc;

        const buttons = mainContent.querySelectorAll('button, a.btn, .btn-primary, .btn-secondary');
        if (buttons.length >= 1) buttons[0].innerText = t.farmBtn;
        if (buttons.length >= 2) buttons[1].innerText = t.settingsBtn;

        const statusSpan = mainContent.querySelector('span[style*="color: #22c55e"], span[style*="color:#22c55e"]');
        if (statusSpan) statusSpan.innerText = t.coreStatus;

        const featuresHeadingEl = document.getElementById('features-heading');
        if (featuresHeadingEl) featuresHeadingEl.innerText = t.featuresHeading;

        const instrTitleEl = document.getElementById('instr-title');
        if (instrTitleEl) instrTitleEl.innerText = t.instructionHeading;

        const faqHeadingEl = document.getElementById('faq-heading');
        if (faqHeadingEl) faqHeadingEl.innerText = t.faqHeading;

        const featTitles = mainContent.querySelectorAll('.features-grid h3');
        if (featTitles.length >= 3) {
            featTitles[0].innerText = t.feat1Title;
            featTitles[1].innerText = t.feat2Title;
            featTitles[2].innerText = t.feat3Title;
        }

        const featDescs = mainContent.querySelectorAll('.features-grid p');
        if (featDescs.length >= 3) {
            featDescs[0].innerText = t.feat1Desc;
            featDescs[1].innerText = t.feat2Desc;
            featDescs[2].innerText = t.feat3Desc;
        }

        const sc1t = document.getElementById('sc1-t');
        const sc1d1 = document.getElementById('sc1-d1');
        const sc1d2 = document.getElementById('sc1-d2');
        const ph1 = document.getElementById('ph1');
        if (sc1t) sc1t.innerText = t.inst1Title;
        if (sc1d1) sc1d1.innerHTML = `<b style="color:#fff;">${t.inst1DescBold}</b> ${t.inst1DescText}`;
        if (sc1d2) sc1d2.innerText = t.inst1DescText2;
        if (ph1) ph1.innerText = t.ph1;

        const sc2t = document.getElementById('sc2-t');
        const sc2d1 = document.getElementById('sc2-d1');
        const sc2d2 = document.getElementById('sc2-d2');
        const ph2 = document.getElementById('ph2');
        if (sc2t) sc2t.innerText = t.inst2Title;
        if (sc2d1) sc2d1.innerHTML = `<b style="color:#fff;">${t.inst2DescBold}</b> ${t.inst2DescText}`;
        if (sc2d2) sc2d2.innerText = t.inst2DescText2;
        if (ph2) ph2.innerText = t.ph2;

        const sc3t = document.getElementById('sc3-t');
        const sc3d1 = document.getElementById('sc3-d1');
        const sc3d2 = document.getElementById('sc3-d2');
        const ph3 = document.getElementById('ph3');
        if (sc3t) sc3t.innerText = t.inst3Title;
        if (sc3d1) sc3d1.innerHTML = `<b style="color:#fff;">${t.inst3DescBold}</b> ${t.inst3DescText}`;
        if (sc3d2) sc3d2.innerText = t.inst3DescText2;
        if (ph3) ph3.innerText = t.ph3;

        const sc4t = document.getElementById('sc4-t');
        const sc4d1 = document.getElementById('sc4-d1');
        const ph4 = document.getElementById('ph4');
        if (sc4t) sc4t.innerText = t.inst4Title;
        if (sc4d1) sc4d1.innerHTML = `<b style="color:#fff;">${t.inst4DescBold}</b> ${t.inst4DescText}`;
        if (ph4) ph4.innerText = t.ph4;

        const faqQuestions = mainContent.querySelectorAll('.faq-question span:first-child');
        if (faqQuestions.length >= 4) {
            faqQuestions[0].innerText = t.faq1Q;
            faqQuestions[1].innerText = t.faq2Q;
            faqQuestions[2].innerText = t.faq3Q;
            faqQuestions[3].innerText = t.faq4Q;
        }

        const faqAnswers = mainContent.querySelectorAll('.faq-answer');
        if (faqAnswers.length >= 4) {
            faqAnswers[0].innerText = t.faq1A;
            faqAnswers[1].innerText = t.faq2A;
            faqAnswers[2].innerText = t.faq3A;
            faqAnswers[3].innerText = t.faq4A;
        }

        const footerLinks = mainContent.querySelectorAll('footer a, div[style*="display:flex"] span[onclick*="openLegalModal"]');
        footerLinks.forEach(link => {
            const attr = link.getAttribute('onclick') || '';
            if (attr.includes('privacy') || link.innerText.toLowerCase().includes('privacy')) {
                link.innerText = t.footerPrivacy;
            } else if (attr.includes('terms') || link.innerText.toLowerCase().includes('terms')) {
                link.innerText = t.footerTerms;
            }
        });
    }

    // Обновление модального окна тарифов
    const pTitleModal = document.getElementById('p-title-modal');
    if (pTitleModal) pTitleModal.innerText = t.pTitleModal;

    const pDescModal = document.getElementById('p-desc-modal');
    if (pDescModal) pDescModal.innerText = t.pDescModal;

    const stdTop = document.getElementById('p-std-top');
    if (stdTop) {
        stdTop.innerText = t.subTop;
        document.getElementById('p-std-name').innerText = t.stdName;
        document.getElementById('p-std-per').innerText = t.stdPer;
        document.getElementById('p-std-f1').innerText = t.stdF1;
        document.getElementById('p-std-f2').innerText = t.stdF2;
        document.getElementById('p-std-f3').innerText = t.stdF3;
        document.getElementById('p-std-btn').innerText = t.stdBtn;

        document.getElementById('p-pro-badge').innerText = t.proBadge;
        document.getElementById('p-pro-top').innerText = t.subTop;
        document.getElementById('p-pro-name').innerText = t.proName;
        document.getElementById('p-pro-per').innerText = t.proPer;
        document.getElementById('p-pro-f1').innerText = t.proF1;
        document.getElementById('p-pro-f2').innerText = t.proF2;
        document.getElementById('p-pro-f3').innerText = t.proF3;
        document.getElementById('p-pro-f4').innerText = t.proF4;
        document.getElementById('p-pro-btn').innerText = t.proBtn;

        document.getElementById('p-prem-top').innerText = t.subTop;
        document.getElementById('p-prem-name').innerText = t.premName;
        document.getElementById('p-prem-per').innerText = t.premPer;
        document.getElementById('p-prem-f1').innerText = t.premF1;
        document.getElementById('p-prem-f2').innerText = t.premF2;
        document.getElementById('p-prem-f3').innerText = t.premF3;
        document.getElementById('p-prem-f4').innerText = t.premF4;
        document.getElementById('p-prem-btn').innerText = t.premBtn;
    }
}

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
    currentLang = lang;
    localStorage.setItem('ax_lang', lang);
    document.getElementById('langMenu').classList.remove('show');
    updateStaticText(lang);
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
    const t = translations[currentLang];

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
                    <span style="font-weight:bold; font-size:16px;">${t.login}</span>
                    <span onclick="closeAuthModal()" style="cursor: pointer; color: #a3a3a3; font-size: 18px;">✕</span>
                </div>
                <div class="input-group" style="margin-bottom:12px;">
                    <label style="font-size: 11px; color: #a3a3a3; display: block; margin-bottom: 4px;">Email / Nickname</label>
                    <input type="text" class="auth-input" placeholder="..." id="loginUsername">
                </div>
                <div class="input-group" style="margin-bottom:16px;">
                    <label style="font-size: 11px; color: #a3a3a3; display: block; margin-bottom: 4px;">Password</label>
                    <div class="password-wrapper" style="position:relative;">
                        <input type="password" class="auth-input" placeholder="..." id="loginPass" style="padding-right: 35px;">
                        <span class="password-toggle-icon" onclick="togglePasswordVisibility('loginPass', this)" style="position:absolute; right:12px; top:50%; transform:translateY(-50%); cursor:pointer; font-size:14px;">👁️</span>
                    </div>
                </div>
                <button type="submit" class="btn-modal-primary" style="width:100%; padding:12px;">${t.login}</button>
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
                <span style="font-weight:bold; font-size:16px;">${t.payTitle}: ${planDisplayLabel}</span>
                <span onclick="closeAuthModal()" style="cursor: pointer; color: #a3a3a3; font-size: 18px;">✕</span>
            </div>
            
            <div style="margin-bottom: 12px;">
                <label style="font-size: 11px; color: #a3a3a3; display: block; margin-bottom: 4px;">${t.payNetwork}</label>
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px;">
                    <button type="button" class="btn-dark-sm auth-input" id="net-base" onclick="setPayNetwork('Base', '${MASTER_WALLET}', '${displayAmount}')" style="background:#1f1f1f; border-color:#fff; cursor:pointer;">Base L2</button>
                    <button type="button" class="btn-dark-sm auth-input" id="net-arb" onclick="setPayNetwork('Arbitrum', '${MASTER_WALLET}', '${displayAmount}')" style="cursor:pointer;">Arbitrum</button>
                    <button type="button" class="btn-dark-sm auth-input" id="net-eth" onclick="setPayNetwork('Ethereum', '${MASTER_WALLET}', '${displayAmount}')" style="cursor:pointer;">Ethereum</button>
                </div>
            </div>

            <div style="background:#0a0a0a; border:1px solid var(--border-color); border-radius:12px; padding:12px; margin-bottom:12px; text-align:center;">
                <div style="font-size:11px; color:#a3a3a3; margin-bottom:2px;">${t.payAmount}</div>
                <div style="font-size:20px; color:#fff; font-weight:700; margin-bottom:8px;">$${displayAmount}</div>
                
                <div style="font-size:11px; color:#a3a3a3; margin-bottom:2px;">${t.payWallet} (<span id="activePayNet">Base L2</span>):</div>
                <div style="background:#181818; padding:6px 8px; border-radius:8px; font-family:monospace; font-size:11px; color:#fff; word-break:break-all; margin-bottom:6px;">${MASTER_WALLET}</div>
                
                <button type="button" id="copyWalletBtn" class="auth-input" style="margin: 0 auto; font-size: 11px; padding: 6px 12px; width:auto; cursor:pointer;" onclick="copyWalletAddress('${MASTER_WALLET}', this)">${t.payCopy}</button>
                <div id="qrcodeContainer" style="display:flex; justify-content:center; align-items:center; margin:10px auto 0 auto; background:#fff; padding:8px; border-radius:8px; width:110px; height:110px; box-sizing:border-box; overflow:hidden;"></div>
            </div>

            <div class="input-group" style="margin-bottom:12px;">
                <label style="font-size: 11px; color: #a3a3a3; display: block; margin-bottom: 4px;">${t.payTxid}</label>
                <input type="text" class="auth-input" placeholder="0x..." id="txidInput">
            </div>

            <button type="button" id="paymentActionBtn" class="btn-modal-primary" onclick="startPlanPayment()" style="width:100%; padding:10px;">${t.payConfirm} ($${displayAmount})</button>
            <div id="paymentStatusContainer"></div>
        `;
        setTimeout(() => renderPaymentQR(MASTER_WALLET, displayAmount), 100);
    } else if (type === 'register') {
        const chosenPlan = localStorage.getItem('selected_plan') || 'Standard';
        const chosenPrice = Number(localStorage.getItem('selected_price') || PLAN_PRICES[chosenPlan] || 95);
        const planDisplayLabel = chosenPlan === 'Standard' ? t.stdName : chosenPlan === 'Pro' ? t.proName : t.premName;
        const btnText = codeCooldownSeconds > 0 ? `${codeCooldownSeconds}s` : 'Send';
        const btnDisabled = codeCooldownSeconds > 0 ? 'disabled' : '';
        const emailState = codeCooldownSeconds > 0 ? `readonly style="opacity: 0.7;" value="${confirmedRegistrationEmail}"` : '';

        container.innerHTML = `
            <form onsubmit="event.preventDefault(); validateRegister();">
                <div class="modal-logo" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                    <span style="font-weight:bold; font-size:16px;">Register: ${planDisplayLabel} ($${chosenPrice})</span>
                    <span onclick="closeAuthModal()" style="cursor: pointer; color: #a3a3a3; font-size: 18px;">✕</span>
                </div>
                
                <div class="input-group" style="margin-bottom:10px;">
                    <label style="font-size: 11px; color: #a3a3a3; display: block; margin-bottom: 4px;">Nickname</label>
                    <input type="text" class="auth-input" placeholder="..." id="regUsername">
                </div>
                
                <div class="input-group" style="margin-bottom:10px;">
                    <label style="font-size: 11px; color: #a3a3a3; display: block; margin-bottom: 4px;">Email</label>
                    <input type="email" class="auth-input" placeholder="Email" id="regEmail" ${emailState}>
                </div>
                
                <div class="input-group" style="margin-bottom:10px;">
                    <label style="font-size: 11px; color: #a3a3a3; display: block; margin-bottom: 4px;">Password</label>
                    <div class="password-wrapper" style="position:relative;">
                        <input type="password" class="auth-input" placeholder="..." id="regPass" style="padding-right: 35px;">
                        <span class="password-toggle-icon" onclick="togglePasswordVisibility('regPass', this)" style="position:absolute; right:12px; top:50%; transform:translateY(-50%); cursor:pointer; font-size:14px;">👁️</span>
                    </div>
                </div>
                
                <div class="input-group" style="margin-bottom:14px;">
                    <label style="font-size: 11px; color: #a3a3a3; display: block; margin-bottom: 4px;">Code</label>
                    <div style="display: flex; gap: 8px;">
                        <input type="text" class="auth-input" placeholder="..." id="regCode" style="flex: 1; margin: 0;">
                        <button type="button" id="sendCodeBtn" onclick="sendVerificationEmailCode()" ${btnDisabled} class="auth-input" style="width: auto; background:#1f1f1f; color:#fff; cursor:pointer; font-weight:600;">${btnText}</button>
                    </div>
                </div>
                
                <button type="submit" class="btn-modal-primary" style="width:100%; padding:10px;">Register</button>
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
    
    if(!email || !email.includes('@')) { 
        err.innerHTML = `<div style="color:#ef4444; font-size:12px;">Invalid email!</div>`; 
        return; 
    }
    
    emailInput.readOnly = true;
    emailInput.style.opacity = "0.7";
    confirmedRegistrationEmail = email;
    btn.disabled = true;

    try {
        await fetch('/api/send-code', { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ email }) 
        });
        showNotification("OK!");
    } catch (e) {
        showNotification("OK!");
    }
    
    codeCooldownSeconds = 60;
    btn.innerText = `${codeCooldownSeconds}s`;
    
    codeCooldownTimer = setInterval(() => {
        codeCooldownSeconds--;
        const currentBtn = document.getElementById('sendCodeBtn'); 
        if (codeCooldownSeconds <= 0) {
            clearInterval(codeCooldownTimer);
            if(currentBtn) { currentBtn.innerText = "Send"; currentBtn.disabled = false; }
            const currentEmailInput = document.getElementById('regEmail');
            if(currentEmailInput) { currentEmailInput.readOnly = false; currentEmailInput.style.opacity = "1"; }
        } else {
            if(currentBtn) currentBtn.innerText = `${codeCooldownSeconds}s`;
        }
    }, 1000);
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
        status.innerHTML = `<div style="color:#ef4444; font-size:12px; margin-top:8px;">Enter TXID!</div>`;
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
            status.innerHTML = `<div style="color:#ef4444; font-size:12px; margin-top:8px;">${confirmData.detail || 'Error'}</div>`;
            return;
        }

        paymentUnlocked = true;
        paymentAccessToken = confirmData.payment_token;
        sessionStorage.setItem('ax_payment_token', paymentAccessToken);
        sessionStorage.setItem('ax_paid_session_id', clientSessionId);

        showNotification("OK!");
        setTimeout(() => openModal('register'), 800);
    } catch (e) {
        status.innerHTML = `<div style="color:#ef4444; font-size:12px; margin-top:8px;">Network error.</div>`;
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
        err.innerHTML = `<div style="color:#ef4444; font-size:12px;">Fill all fields!</div>`; 
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
        showNotification("OK!");
        setTimeout(() => openModal('login'), 1200);
    } else {
        const r = await res.json();
        let errMsg = "Registration error";
        if (r.detail) errMsg = Array.isArray(r.detail) ? r.detail.map(e => e.msg).join(', ') : r.detail;
        err.innerHTML = `<div style="color:#ef4444; font-size:12px;">${errMsg}</div>`;
    }
}

async function validateLogin() {
    const username = document.getElementById('loginUsername').value.trim();
    const pass = document.getElementById('loginPass').value.trim();
    const err = document.getElementById('loginErrorContainer');
    
    if(!username || !pass) {
        err.innerHTML = `<div style="color:#ef4444; font-size:12px;">Enter login & password!</div>`;
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
        let errMsg = "Login error";
        if (data.detail) errMsg = Array.isArray(data.detail) ? data.detail.map(e => e.msg).join(', ') : data.detail;
        err.innerHTML = `<div style="color:#ef4444; font-size:12px;">${errMsg}</div>`;
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
                        <div style="color: var(--text-muted); font-size: 11px; margin-top:2px;">${t.balLabel} <b style="color:#fff;">$${mockBalance}</b> | ${t.proxyLabel} ${w.proxy || t.proxyNone}</div>
                    </div>
                    <div style="display:flex; gap:6px;">
                        <button type="button" onclick="testWalletProxy(${w.id}, this)" style="background: rgba(34,197,94,0.1); color: #22c55e; border: 1px solid rgba(34,197,94,0.2); padding: 6px 10px; border-radius: 8px; font-size: 11px; cursor:pointer;">${t.btnTest}</button>
                        <button type="button" onclick="deleteWallet(${w.id})" style="background: rgba(239,68,68,0.1); color: #ef4444; border: 1px solid rgba(239,68,68,0.2); padding: 6px 10px; border-radius: 8px; font-size: 11px; cursor:pointer;">${t.btnDel}</button>
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
    
    const activeDays = [];
    document.querySelectorAll('#globalCalendarGrid .calendar-day.active').forEach(el => {
        activeDays.push(el.getAttribute('data-raw-day'));
    });

    if (activeDays.length === 0) {
        container.innerHTML = `<div style="font-size: 11px; color: var(--text-muted); font-style: italic; padding: 6px;">-</div>`;
        return;
    }

    let htmlContent = `
        <div style="font-size: 11px; color: #b19cd9; background: rgba(157,78,221,0.1); padding: 8px 12px; border-radius: 8px; border: 1px solid rgba(157,78,221,0.3); margin-bottom: 12px;">
            ${t.timeAlert}
        </div>
    `;

    htmlContent += activeDays.map(day => {
        const savedTime = localStorage.getItem(`day_time_${day}`) || `${String(Math.floor(Math.random()*15)+8).padStart(2,'0')}:${String(Math.floor(Math.random()*60)).padStart(2,'0')}`;
        const savedMinDelay = localStorage.getItem(`day_min_delay_${day}`) || 60;
        const savedMaxDelay = localStorage.getItem(`day_max_delay_${day}`) || 300;
        const displayDay = t.calDays[day] || day;

        return `
            <div style="display: flex; justify-content: space-between; align-items: center; background: var(--bg-main); padding: 8px 12px; border-radius: 10px; border: 1px solid var(--border-color); margin-bottom: 6px; gap: 10px;" data-day="${day}">
                <div style="color: #fff; font-weight: bold; font-size: 12px; width: 35px;">${displayDay}</div>
                <div style="display: flex; gap: 10px; align-items: center; flex: 1; justify-content: flex-end; flex-wrap: wrap;">
                    
                    <div style="display: flex; align-items: center; gap: 4px;">
                        <span style="font-size: 11px; color: var(--text-muted);">${t.tTime}</span>
                        <input type="text" class="auth-input day-time-val" value="${savedTime}" placeholder="15:30" maxlength="5"
                            style="padding: 5px; width: 55px; font-size: 11px; background: var(--bg-card); text-align: center;"
                            oninput="let v = this.value.replace(/[^0-9]/g, '').substring(0, 4); let h = v.substring(0, 2); let m = v.substring(2, 4); if (h && parseInt(h) > 23) h = '23'; if (m && parseInt(m) > 59) m = '59'; this.value = (v.length > 2) ? h + ':' + m : h;">
                    </div>
                    
                    <div style="display: flex; align-items: center; gap: 4px;">
                        <span style="font-size: 11px; color: var(--text-muted);">${t.tMin}</span>
                        <input type="number" class="auth-input day-min-delay-val" value="${savedMinDelay}" min="15" max="7200" oninput="checkInputLimit(this, 7200)" style="padding: 5px; width: 60px; font-size: 11px; background: var(--bg-card);">
                    </div>
                    
                    <div style="display: flex; align-items: center; gap: 4px;">
                        <span style="font-size: 11px; color: var(--text-muted);">${t.tMax}</span>
                        <input type="number" class="auth-input day-max-delay-val" value="${savedMaxDelay}" min="15" max="7200" oninput="checkInputLimit(this, 7200)" style="padding: 5px; width: 60px; font-size: 11px; background: var(--bg-card);">
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
            if (log) log.innerHTML += `<br><span style="color: #22c55e;">✅ ${t.logSuccess}</span>`;
            if (data.new_balance !== undefined) {
                userInternalBalance = data.new_balance;
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
            <label style="font-size: 11px; color: #a3a3a3; display: block; margin-bottom: 4px;">USD</label>
            <input type="number" class="auth-input" value="25" id="topupAmountInput" min="1" max="10000" style="padding: 10px; font-size: 14px;" oninput="updateTopupQR(this.value)">
        </div>

        <div style="margin-bottom: 12px;">
            <label style="font-size: 11px; color: #a3a3a3; display: block; margin-bottom: 4px;">${t.payNetwork}</label>
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px;">
                <button type="button" class="btn-dark-sm auth-input" id="net-base" onclick="setTopupNetwork('Base', '${MASTER_WALLET}')" style="background:#1f1f1f; border-color:#fff; cursor:pointer;">Base L2</button>
                <button type="button" class="btn-dark-sm auth-input" id="net-arb" onclick="setTopupNetwork('Arbitrum', '${MASTER_WALLET}')" style="cursor:pointer;">Arbitrum</button>
                <button type="button" class="btn-dark-sm auth-input" id="net-eth" onclick="setTopupNetwork('Ethereum', '${MASTER_WALLET}')" style="cursor:pointer;">Ethereum</button>
            </div>
        </div>

        <div style="background:#0a0a0a; border:1px solid var(--border-color); border-radius:12px; padding:12px; margin-bottom:12px; text-align:center;">
            <div style="font-size:11px; color:#a3a3a3; margin-bottom:2px;">${t.payWallet} (<span id="activeTopupNet">Base L2</span>):</div>
            <div style="background:#181818; padding:6px 8px; border-radius:8px; font-family:monospace; font-size:11px; color:#fff; word-break:break-all; margin-bottom:6px;">${MASTER_WALLET}</div>
            <button type="button" class="auth-input" style="margin: 0 auto; font-size: 11px; padding: 6px 12px; width:auto; cursor:pointer;" onclick="copyWalletAddress('${MASTER_WALLET}', this)">${t.payCopy}</button>
            <div id="qrcodeTopupContainer" style="display:flex; justify-content:center; align-items:center; margin:10px auto 0 auto; background:#fff; padding:8px; border-radius:8px; width:110px; height:110px; box-sizing:border-box; overflow:hidden;"></div>
        </div>

        <div class="input-group" style="margin-bottom:12px;">
            <label style="font-size: 11px; color: #a3a3a3; display: block; margin-bottom: 4px;">${t.payTxid}</label>
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

    let centerHtml = '';
    
    if (section === 'Account') {
        let guideHtml = '';
        if (showWelcomeGuide) {
            guideHtml = `
                <div style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 16px; padding: 16px; margin-bottom: 16px; position: relative;" id="welcomeGuideBox">
                    <span onclick="document.getElementById('welcomeGuideBox').style.display='none'; showWelcomeGuide=false;" style="position: absolute; right: 16px; top: 16px; cursor: pointer; color: var(--text-muted); font-size: 16px;">✕</span>
                    <h4 style="color: #fff; margin: 0 0 8px 0; font-size: 14px;">👋 ${t.accWelcome}, ${username}!</h4>
                    <p style="color: var(--text-muted); font-size: 12px; margin: 0; line-height: 1.4;">
                        ${t.accWelcomeDesc}
                    </p>
                </div>
            `;
        }

        centerHtml = `
            ${guideHtml}

            <div class="dashboard-card" style="margin-bottom: 16px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                    <h3 style="color: #fff; margin: 0; font-size: 15px;">${t.accTitle}</h3>
                    <button type="button" onclick="topUpBalanceModal()" class="btn-purple-lg" style="width:auto; padding:6px 12px; font-size:12px;">${t.btnTopUp}</button>
                </div>
                <div style="font-size:24px; font-weight:bold; color:#fff; margin-bottom:4px;" id="userBalanceValue">${t.loading}</div>
                <div style="font-size:11px; color:var(--text-muted);">${t.accDesc}</div>
            </div>

            <div class="dashboard-card" style="margin-bottom: 16px;">
                <h3 style="color: #fff; margin-top: 0; font-size: 15px;">${t.txTitle}</h3>
                <div id="transactionsListContainer" style="max-height:160px; overflow-y:auto; margin-top:10px;">${t.loading}</div>
            </div>

            <div class="dashboard-card">
                <h3 style="color: #fff; margin-top: 0; font-size: 15px;">${t.subTitle}</h3>
                <p style="color: var(--text-muted); font-size: 13px;">${t.subPlan}: <b>${userPlan}</b> | ${t.subActive} (${subscriptionDaysLeft} ${t.days})</p>
                <button type="button" onclick="openPricingModal()" class="btn-dark-sm" style="margin-top:10px;">${t.btnChangePlan}</button>
            </div>
        `;

        const setEmptyState = () => {
            const balEl = document.getElementById('userBalanceValue');
            if (balEl) balEl.innerText = '$0.00';
            const txContainer = document.getElementById('transactionsListContainer');
            if (txContainer) {
                txContainer.innerHTML = `
                    <div style="color:var(--text-muted); font-size:12px; text-align:center; padding: 24px; border: 1px dashed var(--border-color); border-radius: 10px; background: rgba(255,255,255,0.02);">
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
                                <div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-main); padding:8px 12px; border-radius:8px; margin-bottom:6px; font-size:12px; border:1px solid var(--border-color);">
                                    <div>
                                        <span style="color:#fff; font-weight:600;">${tx.type === 'deposit' ? t.txDep : tx.type === 'slot_purchase' ? t.txSlot : t.txGas}</span>
                                        <span style="color:var(--text-muted); font-size:11px; margin-left:8px;">${tx.date}</span>
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

        centerHtml = `
            <div id="antiSybilWarningBox" style="background: linear-gradient(135deg, rgba(234, 179, 8, 0.12), rgba(234, 179, 8, 0.03)); border: 1px solid rgba(234, 179, 8, 0.35); border-radius: 16px; padding: 16px 18px; margin-bottom: 18px; display: flex; gap: 14px; align-items: flex-start; position: relative; box-shadow: 0 4px 20px rgba(0,0,0,0.2);">
                <span style="font-size: 20px; margin-top: 1px;">🛡️</span>
                <div style="flex: 1;">
                    <div style="color: #eab308; font-weight: bold; font-size: 13px; margin-bottom: 3px; letter-spacing: 0.3px;">${t.setWarnTitle}</div>
                    <div style="color: var(--text-muted); font-size: 12px; line-height: 1.5;">${t.setWarnDesc}</div>
                </div>
                <span onclick="document.getElementById('antiSybilWarningBox').style.display='none'" style="cursor: pointer; color: var(--text-muted); font-size: 16px; padding: 2px 6px; transition: color 0.2s;" onmouseover="this.style.color='#fff'" onmouseout="this.style.color='var(--text-muted)'">✕</span>
            </div>

            <div class="dashboard-card" style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 18px; padding: 22px; box-shadow: 0 8px 30px rgba(0,0,0,0.4);">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 16px; border-bottom: 1px solid var(--border-color); padding-bottom: 14px;">
                    <div>
                        <h3 style="color: #fff; margin: 0 0 3px 0; font-size: 16px; font-weight: 600;">${t.setTitle}</h3>
                        <p style="color: var(--text-muted); font-size: 12px; margin: 0;">${t.setDesc}</p>
                    </div>
                    <button type="button" onclick="randomizeGlobalSettings()" style="background: linear-gradient(135deg, #2563eb, #1d4ed8); color:#fff; border:none; padding: 8px 14px; border-radius: 10px; font-size: 11px; cursor:pointer; font-weight: 600; box-shadow: 0 4px 12px rgba(37,99,235,0.3);">${t.btnRand}</button>
                </div>
                
                <div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-main); padding:14px 16px; border-radius:14px; border:1px solid var(--border-color); margin-bottom:18px;">
                    <div>
                        <div style="color:#fff; font-size:13px; font-weight:600;">${t.setBgTitle}</div>
                        <div style="color:var(--text-muted); font-size:11px; margin-top:2px;">${t.setBgDesc}</div>
                    </div>
                    <label class="toggle-switch">
                        <input type="checkbox" id="bgSchedulerToggle" checked onchange="toggleSchedulerState(this)">
                        <span class="toggle-slider"></span>
                    </label>
                </div>

                <div id="schedulerSettingsWrapper" style="transition: opacity 0.3s ease;">
                    <div style="font-size:12px; color:var(--text-muted); margin-bottom:8px; font-weight:600;">${t.setDays}</div>
                    
                    <div class="calendar-grid" id="globalCalendarGrid" style="margin-bottom:16px; display: flex; gap: 8px; flex-wrap: wrap;">
                        <div class="calendar-day active" data-raw-day="Пн" onclick="handleCalendarDayClick(this)" style="cursor:pointer; user-select:none; flex: 1; min-width: 45px; padding: 12px 6px; font-size: 13px;">${t.calDays['Пн']}</div>
                        <div class="calendar-day active" data-raw-day="Вт" onclick="handleCalendarDayClick(this)" style="cursor:pointer; user-select:none; flex: 1; min-width: 45px; padding: 12px 6px; font-size: 13px;">${t.calDays['Вт']}</div>
                        <div class="calendar-day active" data-raw-day="Ср" onclick="handleCalendarDayClick(this)" style="cursor:pointer; user-select:none; flex: 1; min-width: 45px; padding: 12px 6px; font-size: 13px;">${t.calDays['Ср']}</div>
                        <div class="calendar-day active" data-raw-day="Чт" onclick="handleCalendarDayClick(this)" style="cursor:pointer; user-select:none; flex: 1; min-width: 45px; padding: 12px 6px; font-size: 13px;">${t.calDays['Чт']}</div>
                        <div class="calendar-day" data-raw-day="Пт" onclick="handleCalendarDayClick(this)" style="cursor:pointer; user-select:none; flex: 1; min-width: 45px; padding: 12px 6px; font-size: 13px;">${t.calDays['Пт']}</div>
                        <div class="calendar-day" data-raw-day="Сб" onclick="handleCalendarDayClick(this)" style="cursor:pointer; user-select:none; flex: 1; min-width: 45px; padding: 12px 6px; font-size: 13px;">${t.calDays['Сб']}</div>
                        <div class="calendar-day" data-raw-day="Вс" onclick="handleCalendarDayClick(this)" style="cursor:pointer; user-select:none; flex: 1; min-width: 45px; padding: 12px 6px; font-size: 13px;">${t.calDays['Вс']}</div>
                    </div>

                    <div style="font-size:12px; color:var(--text-muted); margin-bottom:8px; font-weight:600;">${t.setTimeTitle}</div>
                    <div id="dailyTimeConfigsContainer" style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 18px;"></div>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 16px;">
                    <div>
                        <label style="font-size: 11px; color: var(--text-muted); display: block; margin-bottom: 6px;">${t.setGwei}</label>
                        <input type="number" class="auth-input" value="30" min="5" max="300" id="globalGweiInput" oninput="checkInputLimit(this, 300)" style="padding: 10px 12px; background: var(--bg-main); border-radius: 10px;">
                    </div>
                    <div>
                        <label style="font-size: 11px; color: var(--text-muted); display: block; margin-bottom: 6px;">${t.setTg}</label>
                        <input type="text" class="auth-input" placeholder="${t.tgPh}" id="globalTelegramInput" value="${savedTelegramId}" style="padding: 10px 12px; background: var(--bg-main); border-radius: 10px;">
                        <div style="background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.3); border-radius: 8px; padding: 8px 10px; margin-top: 6px; font-size: 10px; color: var(--text-muted); line-height: 1.3;">
                            ℹ️ ${t.tgTip} <b style="color:#fff;">AirdropX Bot (@AirdropX_Support_Bot)</b> ${t.tgTip2} <code style="color:#fff; background:#1f1f1f; padding:1px 3px; border-radius:3px;">/start</code> ${t.tgTip3}
                        </div>
                    </div>
                </div>

                <div style="background: var(--bg-main); border: 1px solid var(--border-color); border-radius: 12px; padding: 14px; margin-bottom: 16px;">
                    <div style="font-size: 12px; color: #fff; font-weight: 600; margin-bottom: 10px;">${t.notifTitle}</div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 11px; color: var(--text-muted);">
                        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;"><input type="checkbox" id="notifSettingsToggle" ${notifSettingsChecked}> ${t.notif1}</label>
                        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;"><input type="checkbox" id="notifStartToggle" ${notifStartChecked}> ${t.notif2}</label>
                        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;"><input type="checkbox" id="notifSuccessToggle" ${notifSuccessChecked}> ${t.notif3}</label>
                        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;"><input type="checkbox" id="notifErrorToggle" ${notifErrorChecked}> ${t.notif4}</label>
                    </div>
                </div>

                <button type="button" onclick="saveGlobalProfileSettings()" class="btn-modal-primary" style="width:100%; padding: 12px; font-size: 13px; font-weight: 600; border-radius: 12px; cursor: pointer;">${t.btnSaveSet}</button>
            </div>
        `;
        setTimeout(updateDailyConfigsUI, 50);
    } else if (section === 'Looter') {
        centerHtml = `
            <div class="dashboard-card">
                <h3 style="color: #fff; margin-top: 0; font-size: 15px;">🚀 ${t.lootTitle}</h3>
                <p style="color: var(--text-muted); font-size: 13px;">${t.lootDesc}</p>
                <button type="button" onclick="startScanningDrops()" class="btn-purple-lg" style="font-size: 12px; padding: 10px 16px; width:auto;">${t.btnScan}</button>
                <div id="drop-logs" style="margin-top: 15px; background: var(--bg-main); padding: 12px; border-radius: 10px; font-family: monospace; font-size: 11px; color: var(--text-muted); max-height: 160px; overflow-y: auto; border: 1px solid var(--border-color);">${t.logInitLoot}</div>
            </div>
        `;
    } else if (section === 'Farming') {
        centerHtml = `
            <div class="dashboard-card">
                <h3 style="color: #fff; margin-top: 0; font-size: 15px;">${t.farmTitle}</h3>
                <p style="color: var(--text-muted); font-size: 13px;">${t.farmDesc} (${t.subPlan}: <b>${userPlan}</b>)</p>
                <label style="color: var(--text-muted); font-size: 12px; display: block; margin-bottom: 6px;">${t.netSelect}</label>
                <select class="auth-input" id="farmNetwork" style="margin-bottom: 14px;">
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
                <button type="button" onclick="startAutoFarming()" class="btn-purple-lg" style="font-size: 12px; padding: 10px 16px; width:auto;">${t.btnFarm}</button>
                <div id="farm-console-logs" style="margin-top: 15px; background: var(--bg-main); padding: 12px; border-radius: 10px; font-family: monospace; font-size: 11px; color: #22c55e; max-height: 160px; overflow-y: auto; border: 1px solid var(--border-color);">${t.logWait}</div>
            </div>
        `;
    } else if (section === 'Wallets') {
        const isTipHidden = localStorage.getItem('hideProxyTip') === 'true';
        const proxyTipHtml = isTipHidden ? '' : `
            <div id="proxyTipBox" style="background: rgba(59, 130, 246, 0.08); border: 1px solid rgba(59, 130, 246, 0.2); padding: 10px 12px; border-radius: 10px; font-size: 11px; color: #93c5fd; display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; box-sizing: border-box;">
                <div style="display: flex; align-items: flex-start; gap: 8px;">
                    <span style="font-size: 14px; line-height: 1;">💡</span>
                    <div style="line-height: 1.4;">
                        <b style="color: #bfdbfe;">${t.proxyTipTitle}</b> ${t.proxyTipDesc}
                    </div>
                </div>
                <button type="button" onclick="hideProxyTip()" style="background: none; border: none; color: #93c5fd; cursor: pointer; font-size: 16px; padding: 0; line-height: 1; opacity: 0.7;" title="X">×</button>
            </div>
        `;

        centerHtml = `
            <div class="dashboard-card" style="margin-bottom: 16px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                    <h3 style="color: #fff; margin: 0; font-size: 15px;">${t.walTitle}</h3>
                    <span id="slot-info-badge" style="font-size: 11px; background: #1f1f1f; color: #fff; padding: 4px 10px; border-radius: 8px; border: 1px solid var(--border-color);">${t.loading}</span>
                </div>
                <div id="walletsListContainer" style="display: flex; flex-direction: column; gap: 8px;">${t.loading}</div>
                <button type="button" onclick="buyExtraSlot()" class="auth-input" style="margin-top: 12px; width: auto; font-size: 12px; background:#1f1f1f; cursor:pointer;">${t.btnBuySlot}</button>
                <div id="buySlotMsg" style="margin-top: 6px; font-size:11px;"></div>
            </div>
            <div class="dashboard-card">
                <h3 style="color: #fff; margin-top: 0; font-size: 15px;">${t.walAddTitle}</h3>
                <div style="display: flex; flex-direction: column; gap: 8px;">
                    <input type="text" id="newWalletAddress" placeholder="${t.phAddr}" class="auth-input">
                    <input type="password" id="newWalletPk" placeholder="${t.phPk}" class="auth-input">
                    ${proxyTipHtml}
                    <input type="text" id="newWalletProxy" placeholder="${t.phProxy}" class="auth-input">
                    <button type="button" onclick="addNewWalletToDB()" class="btn-modal-primary" style="margin-top:4px;">${t.btnAddWal}</button>
                </div>
                <div id="walletResponseMsg" style="margin-top: 8px; font-size:11px;"></div>
            </div>
        `;
        setTimeout(loadWalletsFromDB, 50);
    } else if (section === 'Networks') {
        const networksHtml = NETWORKS_CONFIG.map(net => `
            <div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-main); padding:12px 14px; border-radius:12px; margin-bottom:8px; border:1px solid var(--border-color);">
                <div style="display:flex; align-items:center; gap:12px;">
                    <div style="display:flex; align-items:center; justify-content:center; width:24px; height:24px;">${net.icon}</div>
                    <div>
                        <div style="color:#fff; font-weight:600; font-size:13px;">${net.name} <span style="font-size: 11px; color: var(--text-muted);">(${net.symbol})</span></div>
                        <div style="color: #22c55e; font-size:11px;">Status: <b style="color:#fff;">${t.statusOnline}</b> | ${t.gasLabel} <span id="gas-${net.key}" style="color:#eab308; font-weight:bold;">${t.loading}</span></div>
                    </div>
                </div>
                <div>
                    <a href="${net.explorer}" target="_blank" style="text-decoration:none; background:#1f1f1f; color:#fff; padding:6px 10px; border-radius:8px; font-size:12px; border:1px solid var(--border-color); transition: background 0.2s;" onmouseover="this.style.background='#333'" onmouseout="this.style.background='#1f1f1f'">${t.btnExp}</a>
                </div>
            </div>
        `).join('');

        centerHtml = `
            <div class="dashboard-card">
                <h3 style="color: #fff; margin-top: 0; font-size: 15px; margin-bottom: 4px;">${t.netTitle}</h3>
                <p style="color: var(--text-muted); font-size: 12px; margin-bottom: 16px;">${t.netDesc}</p>
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
                } catch(e) {
                    const el = document.getElementById(`gas-${net.key}`);
                    if (el) el.innerText = "N/A";
                }
            }
        }, 100);
    }

    content.innerHTML = `
        <div class="desktop-sidebar" style="height: fit-content; align-self: flex-start;">
            <div style="border-bottom: 1px solid var(--border-color); padding-bottom: 12px; margin-bottom: 8px;">
                <div style="font-weight: 600; color: #fff; font-size: 14px;">${username}</div>
                <div style="font-size: 11px; color: var(--text-muted);">${t.subPlan}: ${userPlan}</div>
                <div style="font-size: 10px; color: #22c55e; margin-top: 4px;">${t.subActive} (${subscriptionDaysLeft} ${t.days})</div>
            </div>

            <div style="display: flex; flex-direction: column; gap: 2px;">
                <div style="font-size: 10px; color: #737373; text-transform: uppercase; padding: 4px 8px; font-weight: bold;">${t.menuMain}</div>
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