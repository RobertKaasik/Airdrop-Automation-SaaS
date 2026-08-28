'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('app.js', 'utf8');
const context = vm.createContext({ window: { AIRDROP_LOCALES: {} } });

for (const language of ['ru', 'en', 'zh']) {
    vm.runInContext(fs.readFileSync(`locales/${language}.js`, 'utf8'), context);
    const locale = context.window.AIRDROP_LOCALES[language];
    assert.ok(locale.auth.loginRateLimited.includes('{seconds}'), `${language} must localize login cooldown`);
    assert.ok(locale.auth.retryInSeconds.includes('{seconds}'), `${language} must localize the disabled button`);
    assert.ok(locale.backend['Too many requests. Please wait and try again'], `${language} must localize server 429`);
}

for (const expected of [
    'let loginRequestInFlight = false;',
    "id=\"loginSubmitBtn\"",
    'if (loginRequestInFlight) return;',
    'res.status === 429',
    "res.headers.get('Retry-After')",
    'startLoginRateLimitCooldown',
]) {
    assert.ok(source.includes(expected), `login flow must include ${expected}`);
}

console.log('login rate-limit frontend tests passed');
