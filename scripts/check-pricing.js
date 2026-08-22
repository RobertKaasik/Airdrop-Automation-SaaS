const fs = require('fs');

const expected = { Standard: 29, Pro: 49, Premium: 89 };
const files = {
  client: fs.readFileSync('app.js', 'utf8'),
  server: fs.readFileSync('server.py', 'utf8'),
  markup: fs.readFileSync('index.html', 'utf8')
};

for (const [name, price] of Object.entries(expected)) {
  if (!files.client.includes(`${name}: ${price}`)) throw new Error(`Client price missing for ${name}`);
  if (!files.server.includes(`"${name}": ${price}`)) throw new Error(`Server price missing for ${name}`);
}

for (const legacyPrice of ['$95', '$150', '$280']) {
  if (files.markup.includes(legacyPrice)) throw new Error(`Legacy price remains in pricing modal: ${legacyPrice}`);
}

for (const onboardingMarker of ['ONBOARDING_PRICE', 'onboardingOption', 'onboarding-title', 'onboarding-desc']) {
  if (files.client.includes(onboardingMarker) || files.server.includes(onboardingMarker) || files.markup.includes(onboardingMarker)) {
    throw new Error(`Removed onboarding option is still exposed: ${onboardingMarker}`);
  }
}

console.log('Pricing configuration verified: $29 / $49 / $89, without onboarding add-on.');
