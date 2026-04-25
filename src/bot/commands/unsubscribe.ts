import type { Context } from 'grammy'
import { setSubscription } from '../../db/users'
import { logger } from '../../utils/logger'

export async function handleUnsubscribe(ctx: Context): Promise<void> {
  if (!ctx.from) return

  try {
    await setSubscription(ctx.from.id, false)
    await ctx.reply(
      '👋 <b>You\'ve unsubscribed.</b>\n\n' +
      'You won\'t receive daily predictions anymore.\n' +
      'Use /subscribe to re-enable them at any time.',
      { parse_mode: 'HTML' }
    )
  } catch (err) {
    logger.error('handleUnsubscribe error', { userId: ctx.from.id, error: String(err) })
    await ctx.reply('⚠️ Could not update subscription. Please try again.')
  }
}
