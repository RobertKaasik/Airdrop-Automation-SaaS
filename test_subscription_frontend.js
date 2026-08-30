const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const appSource = fs.readFileSync('app.js', 'utf8');

function extractFunction(source, name) {
    const marker = `function ${name}(`;
    const asyncStart = source.indexOf(`async ${marker}`);
    const start = asyncStart >= 0 ? asyncStart : source.indexOf(marker);
    assert.notEqual(start, -1, `${name} is missing`);
    const bodyStart = source.indexOf('{', start);
    let depth = 0;
    for (let index = bodyStart; index < source.length; index += 1) {
        if (source[index] === '{') depth += 1;
        if (source[index] === '}') depth -= 1;
        if (depth === 0) return source.slice(start, index + 1);
    }
    throw new Error(`${name} is incomplete`);
}

function loadLocales() {
    const context = vm.createContext({ window: { AIRDROP_LOCALES: {} } });
    for (const language of ['ru', 'en', 'zh']) {
        vm.runInContext(fs.readFileSync(`locales/${language}.js`, 'utf8'), context);
    }
    return context.window.AIRDROP_LOCALES;
}

function createPricingHarness(locales) {
    const elements = Object.fromEntries(
        ['p-std-btn', 'p-pro-btn', 'p-prem-btn'].map((id) => [id, {
            disabled: false,
            style: {},
            textContent: '',
        }]),
    );
    elements.pricingAccountStatus = {
        hidden: true,
        className: '',
        textContent: '',
        classList: { add(value) { elements.pricingAccountStatus.className += ` ${value}`; } },
    };
    elements.pricingModalClose = {
        attributes: {},
        setAttribute(name, value) { this.attributes[name] = value; },
    };

    const context = vm.createContext({
        translations: locales,
        getActiveLang: () => 'ru',
        document: { getElementById: (id) => elements[id] || null },
        PLAN_PRICES: { Standard: 29, Pro: 49, Premium: 89 },
        isLoggedIn: false,
        subscriptionStatus: 'active',
        subscriptionGraceDaysLeft: 0,
        userPlan: 'Standard',
    });
    vm.runInContext(extractFunction(appSource, 'syncPricingModalForAccount'), context);
    return { context, elements };
}

const locales = loadLocales();
const requiredKeys = [
    'payNetworkUnavailable', 'payDetailsInvalid', 'payCancelInWalletFirst', 'payVerificationInProgress',
    'payClosePendingTitle', 'payClosePendingMessage', 'payClosePendingAction',
    'subscriptionPricingActive', 'subscriptionPricingGrace', 'subscriptionPricingExpired',
    'subscriptionUpgradePlan', 'subscriptionRestorePlan', 'modalCloseLabel',
];
for (const language of ['ru', 'en', 'zh']) {
    for (const key of requiredKeys) assert.ok(locales[language][key], `${language}.${key} is missing`);
}

const { context, elements } = createPricingHarness(locales);
context.syncPricingModalForAccount();
assert.equal(elements.pricingAccountStatus.hidden, true, 'guest status must stay hidden');
assert.equal(elements['p-std-btn'].disabled, false);

context.isLoggedIn = true;
context.userPlan = 'Pro';
context.subscriptionStatus = 'active';
context.syncPricingModalForAccount();
assert.equal(elements.pricingAccountStatus.hidden, false);
assert.match(elements.pricingAccountStatus.textContent, /PRO/);
assert.equal(elements['p-std-btn'].disabled, true, 'active downgrade must be blocked');
assert.equal(elements['p-pro-btn'].disabled, true, 'current active plan must not create a duplicate checkout');
assert.equal(elements['p-prem-btn'].disabled, false, 'active upgrade must be available');
assert.match(elements['p-prem-btn'].textContent, /89/);

context.subscriptionStatus = 'grace';
context.subscriptionGraceDaysLeft = 4;
context.syncPricingModalForAccount();
assert.match(elements.pricingAccountStatus.textContent, /4/);
for (const id of ['p-std-btn', 'p-pro-btn', 'p-prem-btn']) {
    assert.equal(elements[id].disabled, false, `${id} must be available during grace`);
    assert.match(elements[id].textContent, /Восстановить/);
}

context.subscriptionStatus = 'expired';
context.userPlan = 'Premium';
context.syncPricingModalForAccount();
assert.match(elements.pricingAccountStatus.textContent, /приостановлен/);
for (const id of ['p-std-btn', 'p-pro-btn', 'p-prem-btn']) {
    assert.equal(elements[id].disabled, false, `${id} must be available after expiry`);
}

assert.match(appSource, /response\.status === 402[\s\S]*handleSubscriptionExpired\(\)/);
assert.match(appSource, /requestCloseAuthModal\(\)/);
assert.match(appSource, /event\.key !== 'Escape'/);
assert.match(appSource, /payNetworkUnavailable/);
assert.match(appSource, /payDetailsInvalid/);

async function testSafePaymentClose(pending, inProgress, confirmResult) {
    const calls = [];
    const closeContext = vm.createContext({
        activeAuthModalType: 'payment',
        paymentInteractionInProgress: inProgress,
        translations: locales,
        getActiveLang: () => 'ru',
        getPendingSubscriptionPayment: () => pending,
        showNotification: (message, type) => calls.push(['notice', message, type]),
        closeAuthModal: () => calls.push(['close']),
        openModal: (type) => calls.push(['open', type]),
        openAppConfirm: async () => confirmResult,
    });
    vm.runInContext(extractFunction(appSource, 'requestCloseAuthModal'), closeContext);
    await closeContext.requestCloseAuthModal();
    return calls;
}

(async () => {
    assert.deepEqual(await testSafePaymentClose(null, false, false), [['close']]);
    assert.equal((await testSafePaymentClose(null, true, false))[0][0], 'notice');
    assert.equal((await testSafePaymentClose({ txid: '0x1' }, true, false))[0][0], 'notice');
    assert.deepEqual(await testSafePaymentClose({ txid: '0x1' }, false, false), [['open', 'payment']]);
    assert.deepEqual(await testSafePaymentClose({ txid: '0x1' }, false, true), [['close']]);
    console.log('subscription frontend lifecycle: OK');
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
