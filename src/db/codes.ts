import { getSupabaseClient } from './client'
import { logger } from '../utils/logger'

export interface PromoCode {
  code: string
  plan_tier: string
  is_used: boolean
  used_by: number | null
  used_at: string | null
  expires_at: string | null
  created_at: string
}

/** Generates one code string in the format TBET-XXXX-XXXX */
export function generateCodeString(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  const rand = (n: number) =>
    Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
  return `TBET-${rand(4)}-${rand(4)}`
}

/** Bulk-insert new promo codes for a given plan tier. */
export async function insertCodes(codes: string[], planTier: string): Promise<void> {
  const db = getSupabaseClient()
  const rows = codes.map(code => ({ code, plan_tier: planTier }))
  const { error } = await db.from('promo_codes').insert(rows)
  if (error) {
    logger.error('insertCodes failed', { planTier, count: codes.length, error: error.message })
    throw error
  }
}

/**
 * Attempt to atomically redeem a code for a user.
 *
 * The UPDATE only succeeds when:
 *   - the code exists
 *   - is_used = false
 *   - expires_at is NULL  OR  expires_at > now
 *
 * If no row is updated, returns null (code invalid / already used / expired).
 * This single-query approach prevents two concurrent redemptions of the same code.
 */
export async function redeemCode(rawCode: string, userId: number): Promise<PromoCode | null> {
  const db   = getSupabaseClient()
  const code = rawCode.toUpperCase().replace(/\s/g, '')
  const now  = new Date().toISOString()

  const { data, error } = await db
    .from('promo_codes')
    .update({ is_used: true, used_by: userId, used_at: now })
    .eq('code', code)
    .eq('is_used', false)
    .or('expires_at.is.null,expires_at.gt.now()')
    .select()
    .maybeSingle()

  if (error) {
    logger.error('redeemCode failed', { code, userId, error: error.message })
    throw error
  }

  return data as PromoCode | null
}
