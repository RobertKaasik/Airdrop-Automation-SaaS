'use strict';

const assert = require('node:assert/strict');
const { normalizeSubscription, resolveTier } = require('../subscription-map.cjs');

const fromTierName = normalizeSubscription({
  status: 'success',
  tier_name: 'Premium',
  user_tier: 'premium',
  tier_level: 3,
});
assert.equal(fromTierName.plan, 'Premium');
assert.equal(fromTierName.status, 'active');

const fromNested = normalizeSubscription({
  status: 'success',
  tier_name: 'Standard',
  subscription: { plan: 'Pro', status: 'grace', expires_at: 1710000000 },
});
assert.equal(fromNested.plan, 'Pro');
assert.equal(fromNested.status, 'grace');
assert.equal(fromNested.expiresAt, 1710000000);

const empty = normalizeSubscription({ status: 'success' });
assert.equal(empty.plan, '');
assert.equal(empty.status, 'unknown');

const premiumWithoutLevel = resolveTier({
  status: 'success',
  tier_name: 'Premium',
});
assert.equal(premiumWithoutLevel.plan, 'Premium');
assert.equal(premiumWithoutLevel.level, 3);
assert.equal(premiumWithoutLevel.allowed, true);

const staleStandard = resolveTier({
  status: 'success',
  tier_level: 0,
  subscription: { plan: 'Premium', status: 'active' },
});
assert.equal(staleStandard.plan, 'Premium');
assert.equal(staleStandard.level, 3);
assert.equal(staleStandard.allowed, true);

console.log('Subscription mapping checks passed.');
