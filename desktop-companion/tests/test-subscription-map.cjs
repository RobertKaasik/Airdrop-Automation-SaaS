'use strict';

const assert = require('node:assert/strict');
const { normalizeSubscription } = require('../subscription-map.cjs');

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

console.log('Subscription mapping checks passed.');
