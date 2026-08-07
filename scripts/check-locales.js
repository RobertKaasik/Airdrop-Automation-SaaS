const fs = require('fs');
const vm = require('vm');

const context = { window: {} };
for (const language of ['ru', 'en', 'zh']) {
  vm.runInNewContext(fs.readFileSync(`locales/${language}.js`, 'utf8'), context, { filename: `${language}.js` });
}

const flatten = (value, prefix = '', result = new Set()) => {
  for (const [key, item] of Object.entries(value)) {
    if (!prefix && key === 'backend') continue;
    const path = prefix ? `${prefix}.${key}` : key;
    if (item && typeof item === 'object' && !Array.isArray(item)) flatten(item, path, result);
    else result.add(path);
  }
  return result;
};

const locales = context.window.AIRDROP_LOCALES;
const localeKeys = Object.fromEntries(Object.entries(locales).map(([language, locale]) => [language, flatten(locale)]));
const allKeys = new Set(Object.values(localeKeys).flatMap(keys => [...keys]));
const app = fs.readFileSync('app.js', 'utf8');
const requestedKeys = new Set([...app.matchAll(/\bt\(\s*['"]([^'"]+)['"]/g)].map(([, key]) => key));
for (const key of ['legal.termsTitle', 'legal.termsContent', 'legal.privacyTitle', 'legal.privacyContent']) requestedKeys.add(key);
const bindingBlock = app.match(/const STATIC_TEXT_BINDINGS = \[([\s\S]*?)\n\];/);
if (!bindingBlock) throw new Error('STATIC_TEXT_BINDINGS is missing');
for (const [, key] of bindingBlock[1].matchAll(/\[['"][^'"]+['"],\s*['"]([^'"]+)['"]/g)) requestedKeys.add(key);

const errors = [];
for (const [language, keys] of Object.entries(localeKeys)) {
  const missingTranslations = [...allKeys].filter(key => !keys.has(key));
  const missingUsageKeys = [...requestedKeys].filter(key => !keys.has(key));
  if (missingTranslations.length) errors.push(`${language}: missing dictionary keys: ${missingTranslations.join(', ')}`);
  if (missingUsageKeys.length) errors.push(`${language}: missing app keys: ${missingUsageKeys.join(', ')}`);
}

if (errors.length) throw new Error(errors.join('\n'));
console.log(`Locales verified: ${[...requestedKeys].length} app keys across ${Object.keys(locales).length} languages.`);
