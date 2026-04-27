import type { Context } from 'grammy'
import { getSupabaseClient } from '../../db/client'
import { logger } from '../../utils/logger'
import { PLANS } from '../../utils/plans'

function isAdmin(userId: number): boolean {
  return (process.env.ADMIN_TELEGRAM_ID ?? '')
    .split(',')
    .map(s => parseInt(s.trim(), 10))
    .includes(userId)
}

export async function handleAdminStats(ctx: Context): Promise<void> {
  const userId = ctx.from?.id
  if (!userId || !isAdmin(userId)) return

  try {
    const db  = getSupabaseClient()
    const now = new Date().toISOString()

    const [
      totalRes,
      activeRes,
      dailyRes,
      weeklyRes,
      monthlyRes,
      referralRes,
    ] = await Promise.all([
      // All registered users
      db.from('users').select('id', { count: 'exact', head: true }),

      // Anyone with an active (non-expired) plan
      db.from('users').select('id', { count: 'exact', head: true })
        .gt('plan_expires_at', now),

      // Active daily subscribers
      db.from('users').select('id', { count: 'exact', head: true })
        .eq('plan', 'daily').gt('plan_expires_at', now),

      // Active weekly subscribers
      db.from('users').select('id', { count: 'exact', head: true })
        .eq('plan', 'weekly').gt('plan_expires_at', now),

      // Active monthly subscribers
      db.from('users').select('id', { count: 'exact', head: true })
        .eq('plan', 'monthly').gt('plan_expires_at', now),

      // Total referral credit distributed (sum of referral_credit across all users)
      db.from('users').select('referral_credit').gt('referral_credit', 0),
    ])

    const total   = totalRes.count   ?? 0
    const active  = activeRes.count  ?? 0
    const daily   = dailyRes.count   ?? 0
    const weekly  = weeklyRes.count  ?? 0
    const monthly = monthlyRes.count ?? 0
    const free    = total - active

    const dailyRevenue   = daily   * PLANS.daily.priceNGN
    const weeklyRevenue  = weekly  * PLANS.weekly.priceNGN
    const monthlyRevenue = monthly * PLANS.monthly.priceNGN
    const totalRevenue   = dailyRevenue + weeklyRevenue + monthlyRevenue

    const totalCredits = (referralRes.data ?? [])
      .reduce((sum, row) => sum + ((row as { referral_credit: number }).referral_credit ?? 0), 0)

    const fmt = (n: number) => `₦${n.toLocaleString()}`

    const text =
      `📊 <b>Admin Stats</b>\n` +
      `<i>${new Date().toLocaleString('en-GB', { timeZone: 'UTC', dateStyle: 'medium', timeStyle: 'short' })} UTC</i>\n\n` +

      `👥 <b>Users</b>\n` +
      `  Total registered:  <b>${total}</b>\n` +
      `  Active subscribers: <b>${active}</b>\n` +
      `  Free / no plan:     <b>${free}</b>\n\n` +

      `📦 <b>Active Plans</b>\n` +
      `  📅 Daily   — <b>${daily}</b> user${daily !== 1 ? 's' : ''}\n` +
      `  📆 Weekly  — <b>${weekly}</b> user${weekly !== 1 ? 's' : ''}\n` +
      `  🗓️ Monthly — <b>${monthly}</b> user${monthly !== 1 ? 's' : ''}\n\n` +

      `💰 <b>Revenue (active subscriptions)</b>\n` +
      `  Daily:   <b>${fmt(dailyRevenue)}</b>\n` +
      `  Weekly:  <b>${fmt(weeklyRevenue)}</b>\n` +
      `  Monthly: <b>${fmt(monthlyRevenue)}</b>\n` +
      `  ─────────────────────\n` +
      `  Total:   <b>${fmt(totalRevenue)}</b>\n\n` +

      `🎁 <b>Referral credits outstanding: ${fmt(totalCredits)}</b>`

    await ctx.reply(text, { parse_mode: 'HTML' })
  } catch (err) {
    logger.error('handleAdminStats error', { error: String(err) })
    await ctx.reply('⚠️ Could not fetch stats. Please try again.')
  }
}
