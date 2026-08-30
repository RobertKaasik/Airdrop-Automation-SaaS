'use strict';

const STATUSES = new Set(['active', 'grace', 'expired']);
const TIER_LEVELS = {
  free: 0,
  standard: 1,
  pro: 2,
  'pro farmer': 2,
  premium: 3,
  'premium vip': 3,
  'vip ultimate': 4,
  whale: 4,
  'whale / syndicate': 4,
  enterprise: 5,
};
const AGENT_MODE_MIN_LEVEL = 3;

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

function resolveTier(data = {}, fallback = {}) {
  const nested = (data.subscription && typeof data.subscription === 'object') ? data.subscription : {};
  const plan = String(
    data.tier_name || nested.plan || data.user_tier || fallback.plan || fallback.tierName || ''
  ).trim();
  const namedLevel = TIER_LEVELS[plan.toLowerCase()];
  const numeric = Number(data.tier_level);
  const level = Number.isFinite(namedLevel)
    ? namedLevel
    : (Number.isFinite(numeric) ? numeric : Number(fallback.level) || 0);
  return {
    plan: plan || fallback.plan || 'Standard',
    userTier: String(data.user_tier || plan || fallback.userTier || 'standard').toLowerCase(),
    level,
    allowed: data.auto_mode_allowed === true || level >= AGENT_MODE_MIN_LEVEL,
  };
}

module.exports = { normalizeSubscription, resolveTier, AGENT_MODE_MIN_LEVEL };
