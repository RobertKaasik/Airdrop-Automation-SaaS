'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const appSource = fs.readFileSync('app.js', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');
const style = fs.readFileSync('style.css', 'utf8');
const context = vm.createContext({ window: { AIRDROP_LOCALES: {} } });

for (const language of ['ru', 'en', 'zh']) {
    vm.runInContext(fs.readFileSync(`locales/${language}.js`, 'utf8'), context);
    const locale = context.window.AIRDROP_LOCALES[language];
    for (const key of [
        'footerCookies', 'cookieConsentEyebrow', 'cookieConsentTitle', 'cookieConsentDesc',
        'cookieConsentEssential', 'cookieConsentPolicy', 'cookieConsentAccept',
    ]) {
        assert.ok(locale[key], `${language}.${key} is missing`);
    }
    assert.ok(locale.legal.cookiesTitle, `${language}.legal.cookiesTitle is missing`);
    assert.ok(locale.legal.cookiesContent, `${language}.legal.cookiesContent is missing`);
}

for (const expected of [
    'id="cookieConsentBanner"',
    "openLegalModal('cookies')",
    "type === 'cookies' ? 'legal.cookies'",
]) {
    assert.ok(html.includes(expected), `index must include ${expected}`);
}

for (const expected of [
    "const OPTIONAL_STORAGE_CONSENT_KEY = 'ax_optional_storage_consent_v1';",
    'function initializeCookieConsent()',
    "window.acceptOptionalCookies = () => setOptionalStorageConsent('accepted');",
    "window.declineOptionalCookies = () => setOptionalStorageConsent('essential');",
    "['footer-cookies', 'footerCookies']",
]) {
    assert.ok(appSource.includes(expected), `consent flow must include ${expected}`);
}

assert.ok(style.includes('.cookie-consent-banner'), 'cookie banner styles are missing');
console.log('cookie consent frontend tests passed');
