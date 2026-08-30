const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = __dirname;
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

function expectMatch(source, pattern, message) {
    assert.match(source, pattern, message);
}

expectMatch(
    html,
    /<meta\s+name="viewport"\s+content="width=device-width,\s*initial-scale=1\.0,[^"]+">/i,
    'The page must declare a mobile viewport.',
);

const marker = '/* Narrow-screen guardrails: keep primary controls reachable at 320–430px. */';
const guardStart = css.indexOf(marker);
assert.notEqual(guardStart, -1, 'The narrow-screen guardrail block is missing.');
const guardEnd = css.indexOf('.icon-button-plain {', guardStart);
assert.ok(guardEnd > guardStart, 'The narrow-screen guardrail block cannot be isolated.');
const guard = css.slice(guardStart, guardEnd);

expectMatch(guard, /@media\s*\(max-width:\s*760px\)/, 'Mobile rules must cover the dashboard breakpoint.');
expectMatch(guard, /\.hero-buttons\s*\{[^}]*flex-direction:\s*column/s, 'Hero actions must stack on a narrow screen.');
expectMatch(guard, /\.hero-buttons\s+\.btn-purple-lg,[\s\S]*?min-height:\s*44px/, 'Hero actions need a 44px touch target.');
expectMatch(guard, /\.dashboard-card button,[\s\S]*?min-height:\s*44px/, 'Dashboard controls need a 44px touch target.');
expectMatch(guard, /\.modal-overlay button,[\s\S]*?min-height:\s*44px/, 'Modal controls need a 44px touch target.');
expectMatch(guard, /\.modal-overlay\s*\{\s*padding:\s*8px/, 'Narrow modals need enough usable width.');
expectMatch(guard, /\.modal-overlay\s+\.auth-modal\s*\{[^}]*width:\s*100%\s*!important;[^}]*max-width:\s*100%\s*!important/s, 'Mobile modals must stay inside the viewport.');
expectMatch(guard, /#pricingModal\s+\.auth-modal\s*>\s*div\[style\*="grid-template-columns"\][^{]*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*!important/s, 'Pricing cards must collapse to one column.');
expectMatch(guard, /\.wallet-list-actions\s*>\s*button\s*\{[^}]*flex:\s*1\s+1\s+136px/s, 'Wallet actions must wrap instead of leaving the card.');
expectMatch(guard, /\.wallet-schedule-item\s*\{[^}]*flex-direction:\s*column/s, 'Schedule rows must stack on mobile.');
expectMatch(guard, /@media\s*\(max-width:\s*380px\)[\s\S]*?\.wallet-schedule-calendar\s*\{[^}]*repeat\(2,\s*minmax\(0,\s*1fr\)\)/, 'The schedule calendar needs wider day cells at 320px.');

expectMatch(css, /@media\s*\(max-width:\s*760px\)[\s\S]*?\.safe-start__laser\s*\{\s*display:\s*none;/, 'The Safe Start laser must not distort the mobile panel.');
expectMatch(css, /\.dashboard-card\s+\[style\*="grid-template-columns:repeat\(2"\][\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)\s*!important;/, 'Inline two-column operation forms must collapse on mobile.');

for (const id of ['pricingModal', 'authModal', 'walletConfigModal', 'walletScheduleModal', 'baseSwapConfirmModal', 'appConfirmModal']) {
    assert.ok(html.includes(`id="${id}"`), `${id} must remain covered by the modal guardrails.`);
}

for (const pane of ['dex', 'bridges', 'lending', 'journal']) {
    assert.ok(app.includes(`['${pane}'`) || app.includes(`${pane}:`), `Activity pane ${pane} disappeared from the responsive surface.`);
}

console.log('Mobile responsive assertions passed.');
