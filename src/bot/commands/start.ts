import type { Context } from 'grammy'
import { getUserById, setReferredBy } from '../../db/users'
import { buildMainMenuKeyboard } from '../keyboards'

export async function handleStart(ctx: Context): Promise<void> {
  const userId = ctx.from?.id
  const name   = ctx.from?.first_name ?? 'there'

  await ctx.reply(
    `👋 <b>Welcome, ${name}!</b>\n\n` +
    `I analyse real football matches and generate statistical predictions powered by market odds and AI modelling.\n\n` +
    `<b>What would you like to do?</b>`,
    { parse_mode: 'HTML', reply_markup: buildMainMenuKeyboard() }
  )

  // Handle referral deep-link: /start ref_12345678
  const payload = typeof ctx.match === 'string' ? ctx.match.trim() : ''
  if (userId && payload.startsWith('ref_')) {
    const referrerId = parseInt(payload.slice(4), 10)
    if (!isNaN(referrerId) && referrerId !== userId) {
      const self = await getUserById(userId)
      if (!self?.referred_by) {
        await setReferredBy(userId, referrerId)
      }
    }
  }
}
