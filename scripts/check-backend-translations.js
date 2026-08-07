const fs = require('fs');
const vm = require('vm');

const storage = new Map();
const element = () => ({ addEventListener() {}, style: {}, classList: { add() {}, remove() {}, toggle() {} } });
const context = {
  console,
  setTimeout() {},
  clearInterval() {},
  setInterval() { return 0; },
  localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, String(value)), removeItem: key => storage.delete(key) },
  sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  navigator: { userAgent: 'locale-test' },
  document: { getElementById: element, documentElement: { setAttribute() {} }, body: { setAttribute() {} } },
  window: { AIRDROP_LOCALES: {}, addEventListener() {} }
};

vm.createContext(context);
for (const language of ['ru', 'en', 'zh']) {
  vm.runInContext(fs.readFileSync(`locales/${language}.js`, 'utf8'), context, { filename: `${language}.js` });
}
vm.runInContext(fs.readFileSync('app.js', 'utf8'), context, { filename: 'app.js' });

const messages = [
  'Invalid login or password',
  'Invalid code! Attempts left: 2',
  'Plan limit reached: PRO',
  'Slot purchased! Total slots: 12',
  'Proxy is working! Ping: 240ms',
  'Connection error: timeout',
  'Delay limit exceeded for day Monday'
];

for (const language of ['ru', 'en', 'zh']) {
  context.setLanguage(language);
  for (const message of messages) {
    const translated = context.window.translateBackendMessage(message);
    if (!translated || translated.includes('{details}')) {
      throw new Error(`${language}: translation failed for "${message}"`);
    }
  }
  const validationError = context.translateBackendDetail([{ msg: 'Field required' }]);
  if (!validationError || validationError === 'Field required') {
    throw new Error(`${language}: validation error was not translated`);
  }
}

context.setLanguage('ru');
const unknown = 'An unknown server response';
if (context.window.translateBackendMessage(unknown) !== unknown) {
  throw new Error('Unknown backend messages must remain readable.');
}
if (context.translateBackendDetail('<img src=x onerror=alert(1)>').includes('<img')) {
  throw new Error('Backend details must be escaped before HTML rendering.');
}

console.log('Backend message translations verified for RU, EN, and ZH.');
