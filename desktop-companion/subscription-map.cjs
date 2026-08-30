'use strict';

const STATUSES = new Set(['active', 'grace', 'expired']);

function pickStatus(...values) {
  for (const value of values) {
    if (STATUSES.has(value)) return value;
  }
  return '';
}

function normalizeSubscription(data = {}, fallbackPlan = '') {
  const nested = (data.subscription && typeof data.subscription === 'object') ? data.subscription : {};
  const plan = String(
    nested.plan || data.tier_name || data.user_tier || fallbackPlan || ''
  ).trim();
  // Never use top-level data.status — that is the API result ("success"), not the plan.
  const status = pickStatus(nested.status, data.subscription_status) || (plan ? 'active' : 'unknown');
  const expiresAt = nested.expires_at || nested.expiresAt || data.subscription_expires_at || null;
  return { plan, status, expiresAt: expiresAt || null };
}

module.exports = { normalizeSubscription };
