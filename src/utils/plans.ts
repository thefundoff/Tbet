export type PlanTier = 'free' | 'daily' | 'weekly' | 'monthly'

export interface Plan {
  tier: Exclude<PlanTier, 'free'>
  name: string
  emoji: string
  matchLimit: number
  price: string
  durationDays: number
  tagline: string
  features: string[]
}

export const PLANS: Record<Exclude<PlanTier, 'free'>, Plan> = {
  daily: {
    tier: 'daily',
    name: 'Daily',
    emoji: '📅',
    matchLimit: 2,
    price: '₦500',
    durationDays: 1,
    tagline: '2 top picks — valid today only',
    features: [
      '2 high-confidence picks today',
      'Market odds + statistical analysis',
      'Over/Under & BTTS predictions',
      'Value bet alerts',
    ],
  },
  weekly: {
    tier: 'weekly',
    name: 'Weekly',
    emoji: '📆',
    matchLimit: 4,
    price: '₦2,500',
    durationDays: 7,
    tagline: '4 picks per day — 7 days access',
    features: [
      '4 high-confidence picks per day',
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
    matchLimit: 10,
    price: '₦8,000',
    durationDays: 30,
    tagline: '10 picks per day — 30 days access',
    features: [
      'Up to 10 high-confidence picks per day',
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
