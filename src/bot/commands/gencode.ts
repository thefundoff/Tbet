import type { Context } from 'grammy'
import { generateCodeString, insertCodes } from '../../db/codes'
import { PLANS } from '../../utils/plans'
import type { PlanTier } from '../../utils/plans'
import { logger } from '../../utils/logger'

function isAdmin(userId: number): boolean {
  const raw = process.env.ADMIN_TELEGRAM_ID ?? ''
  return raw
    .split(',')
    .map(s => parseInt(s.trim(), 10))
    .filter(n => !isNaN(n) && n > 0)
    .includes(userId)
}

export async function handleGencode(ctx: Context): Promise<void> {
  const userId = ctx.from?.id

  if (!userId || !isAdmin(userId)) {
    await ctx.reply('⛔ Unauthorised.')
    return
  }

  const args    = ((ctx.match as string | undefined) ?? '').trim().split(/\s+/)
  const tierArg = args[0]?.toLowerCase() as Exclude<PlanTier, 'free'> | undefined
  const count   = parseInt(args[1] ?? '1', 10)

  const validTiers: Exclude<PlanTier, 'free'>[] = ['daily', 'weekly', 'monthly']

  if (!tierArg || !validTiers.includes(tierArg)) {
    await ctx.reply(
      `⚙️ <b>Generate Promo Codes</b>\n\n` +
      `Usage: <code>/gencode [daily|weekly|monthly] [count]</code>\n\n` +
      `Examples:\n` +
      `<code>/gencode daily 3</code> — 3 one-day codes\n` +
      `<code>/gencode weekly 10</code> — 10 seven-day codes\n` +
      `<code>/gencode monthly 1</code> — 1 thirty-day code`,
      { parse_mode: 'HTML' }
    )
    return
  }

  if (isNaN(count) || count < 1 || count > 50) {
    await ctx.reply('⚠️ Count must be between 1 and 50.')
    return
  }

  try {
    const codes = Array.from({ length: count }, generateCodeString)
    await insertCodes(codes, tierArg)

    const plan      = PLANS[tierArg]
    const codeLines = codes.map(c => `• <code>${c}</code>`).join('\n')

    await ctx.reply(
      `✅ <b>${count} ${plan.name} Code${count > 1 ? 's' : ''} Generated</b>\n\n` +
      `Plan: ${plan.emoji} ${plan.name} · ${plan.price} · ${plan.durationDays} day${plan.durationDays > 1 ? 's' : ''} · ${plan.matchLimit} picks/day\n\n` +
      `${codeLines}\n\n` +
      `<i>Each code is single-use. Share via /redeem TBET-XXXX-XXXX.</i>`,
      { parse_mode: 'HTML' }
    )
  } catch (err) {
    logger.error('handleGencode error', { userId, tierArg, count, error: String(err) })
    await ctx.reply('⚠️ Could not generate codes. Please try again.')
  }
}
