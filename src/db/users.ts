import { getSupabaseClient } from './client'
import { logger } from '../utils/logger'

export interface User {
  id: number
  username: string | null
  first_name: string | null
  last_name: string | null
  is_subscribed: boolean
  plan: string | null
  plan_expires_at: string | null
  last_prediction_fetch_date: string | null
  prediction_fetch_count: number
  referred_by: number | null
  referral_credit: number
  referral_reward_claimed: boolean
  created_at: string
  updated_at: string
}

interface TelegramFrom {
  id: number
  username?: string
  first_name?: string
  last_name?: string
}

export async function upsertUser(from: TelegramFrom): Promise<void> {
  const db = getSupabaseClient()
  const { error } = await db.from('users').upsert(
    {
      id: from.id,
      username: from.username ?? null,
      first_name: from.first_name ?? null,
      last_name: from.last_name ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id', ignoreDuplicates: false }
  )
  if (error) {
    logger.error('upsertUser failed', { userId: from.id, error: error.message })
  }
}

export async function setSubscription(userId: number, subscribe: boolean): Promise<void> {
  const db = getSupabaseClient()
  const now = new Date().toISOString()
  const patch = subscribe
    ? { id: userId, is_subscribed: true,  subscribed_at: now, unsubscribed_at: null, updated_at: now }
    : { id: userId, is_subscribed: false, unsubscribed_at: now, updated_at: now }

  const { error } = await db
    .from('users')
    .upsert(patch, { onConflict: 'id', ignoreDuplicates: false })
  if (error) {
    logger.error('setSubscription failed', { userId, subscribe, error: error.message })
    throw error
  }
}

export async function getSubscribedUsers(): Promise<User[]> {
  const db = getSupabaseClient()
  const { data, error } = await db
    .from('users')
    .select('*')
    .eq('is_subscribed', true)

  if (error) {
    logger.error('getSubscribedUsers failed', { error: error.message })
    throw error
  }
  return (data ?? []) as User[]
}

export async function recordPredictionFetch(userId: number, date: string, currentCount: number, isNewDay: boolean): Promise<void> {
  const db = getSupabaseClient()
  const { error } = await db
    .from('users')
    .upsert(
      {
        id: userId,
        last_prediction_fetch_date: date,
        prediction_fetch_count: isNewDay ? 1 : currentCount + 1,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id', ignoreDuplicates: false }
    )
  if (error) {
    logger.error('recordPredictionFetch failed', { userId, date, error: error.message })
  }
}

export async function setUserPlan(
  userId: number,
  tier: string,
  expiresAt: string
): Promise<void> {
  const db = getSupabaseClient()
  const { error } = await db
    .from('users')
    .upsert(
      { id: userId, plan: tier, plan_expires_at: expiresAt, updated_at: new Date().toISOString() },
      { onConflict: 'id', ignoreDuplicates: false }
    )
  if (error) {
    logger.error('setUserPlan failed', { userId, tier, error: error.message })
    throw error
  }
}

export async function cancelUserPlan(userId: number): Promise<void> {
  const db = getSupabaseClient()
  const now = new Date().toISOString()
  const { error } = await db
    .from('users')
    .upsert(
      { id: userId, plan: null, plan_expires_at: null, is_subscribed: false, updated_at: now },
      { onConflict: 'id', ignoreDuplicates: false }
    )
  if (error) {
    logger.error('cancelUserPlan failed', { userId, error: error.message })
    throw error
  }
}

export async function getUserById(userId: number): Promise<User | null> {
  const db = getSupabaseClient()
  const { data, error } = await db
    .from('users')
    .select('*')
    .eq('id', userId)
    .maybeSingle()

  if (error) {
    logger.error('getUserById failed', { userId, error: error.message })
    return null
  }
  return data as User | null
}

export async function setReferredBy(userId: number, referredBy: number): Promise<void> {
  const db = getSupabaseClient()
  const { error } = await db
    .from('users')
    .update({ referred_by: referredBy, updated_at: new Date().toISOString() })
    .eq('id', userId)
    .is('referred_by', null)  // only set if not already set
  if (error) {
    logger.error('setReferredBy failed', { userId, referredBy, error: error.message })
  }
}

export async function addReferralCredit(userId: number, amount: number): Promise<void> {
  const db = getSupabaseClient()
  const { data } = await db.from('users').select('referral_credit').eq('id', userId).maybeSingle()
  const current = (data as { referral_credit: number } | null)?.referral_credit ?? 0
  const { error } = await db
    .from('users')
    .update({ referral_credit: Math.max(0, current + amount), updated_at: new Date().toISOString() })
    .eq('id', userId)
  if (error) {
    logger.error('addReferralCredit failed', { userId, amount, error: error.message })
    throw error
  }
}

export async function markReferralRewardClaimed(userId: number): Promise<void> {
  const db = getSupabaseClient()
  const { error } = await db
    .from('users')
    .update({ referral_reward_claimed: true, updated_at: new Date().toISOString() })
    .eq('id', userId)
  if (error) {
    logger.error('markReferralRewardClaimed failed', { userId, error: error.message })
    throw error
  }
}

export async function getReferralStats(referrerId: number): Promise<{ joined: number; paid: number }> {
  const db = getSupabaseClient()

  const [joinedRes, paidRes] = await Promise.all([
    db.from('users').select('id', { count: 'exact', head: true }).eq('referred_by', referrerId),
    db.from('users').select('id', { count: 'exact', head: true }).eq('referred_by', referrerId).eq('referral_reward_claimed', true),
  ])

  if (joinedRes.error) logger.warn('getReferralStats: joined count failed', { referrerId, error: joinedRes.error.message })
  if (paidRes.error)   logger.warn('getReferralStats: paid count failed',   { referrerId, error: paidRes.error.message })

  return {
    joined: joinedRes.count ?? 0,
    paid:   paidRes.count   ?? 0,
  }
}
