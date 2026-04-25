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

export async function recordPredictionFetch(userId: number, date: string): Promise<void> {
  const db = getSupabaseClient()
  const { error } = await db
    .from('users')
    .upsert(
      { id: userId, last_prediction_fetch_date: date, updated_at: new Date().toISOString() },
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
