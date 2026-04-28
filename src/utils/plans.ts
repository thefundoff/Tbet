export type PlanTier = 'free' | 'daily' | 'weekly' | 'monthly'

export interface Plan {
  tier: Exclude<PlanTier, 'free'>
  name: string
  emoji: string
  matchLimit: number
  price: string
  priceNGN: number
  durationDays: number
  tagline: string
  features: string[]
}

export const PLANS: Record<Exclude<PlanTier, 'free'>, Plan> = {
  daily: {
    tier: 'daily',
    name: 'Daily',
    emoji: '📅',
    matchLimit: 4,
    price: '₦500',
    priceNGN: 500,
    durationDays: 1,
    tagline: '4 top picks — valid today only',
    features: [
      '4 high-confidence picks today',
      'Market odds + statistical analysis',
      'Over/Under & BTTS predictions',
      'Value bet alerts',
    ],
  },
  weekly: {
    tier: 'weekly',
    name: 'Weekly',
    emoji: '📆',
    matchLimit: 7,
    price: '₦2,500',
    priceNGN: 2500,
    durationDays: 7,
    tagline: '7 picks per day — 7 days access',
    features: [
      '7 high-confidence picks per day',
      'Market odds + statistical analysis',
      'Over/Under & BTTS predictions',
      'Value bet alerts',
      'Saves ₦1,000 vs 7 daily plans',
    ],
  },
  monthly: {
    tier: 'monthly',
    name: 'Monthly',
    emoji: '🗓️',
    matchLimit: 11,
    price: '₦8,000',
    priceNGN: 8000,
    durationDays: 30,
    tagline: '11 picks per day — 30 days access',
    features: [
      'Up to 11 high-confidence picks per day',
      'Market odds + statistical analysis',
      'Over/Under & BTTS predictions',
      'Value bet alerts',
      'Best value — saves ₦7,000 vs daily',
    ],
  },
}

/**
 * Returns the user's current active plan tier.
 * Returns 'free' if the user has no plan, or if the plan has expired.
 */
export function getActivePlanTier(
  plan: string | null | undefined,
  planExpiresAt: string | null | undefined
): PlanTier {
  if (!plan || plan === 'free') return 'free'
  if (!planExpiresAt) return 'free'
  if (new Date(planExpiresAt) <= new Date()) return 'free'
  return plan as PlanTier
}
