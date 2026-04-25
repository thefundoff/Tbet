import type { Context } from 'grammy'
import { InlineKeyboard } from 'grammy'
import { redeemCode } from '../../db/codes'
import { getUserById, setUserPlan, setSubscription } from '../../db/users'
import { PLANS, getActivePlanTier } from '../../utils/plans'
import type { PlanTier } from '../../utils/plans'
import { logger } from '../../utils/logger'

export async function handleRedeem(ctx: Context): Promise<void> {
  const userId = ctx.from?.id
  if (!userId) {
    await ctx.reply('⚠️ Could not identify your account.')
    return
  }

  const rawCode = (ctx.match as string | undefined)?.trim()

  if (!rawCode) {
    await ctx.reply(
      `🎟️ <b>Redeem a Promo Code</b>\n\n` +
      `Usage: <code>/redeem YOUR-CODE</code>\n\n` +
      `Example: <code>/redeem TBET-A3K9-M2X7</code>`,
      { parse_mode: 'HTML' }
    )
    return
  }

  try {
    const promo = await redeemCode(rawCode, userId)

    if (!promo) {
      await ctx.reply(
        `❌ <b>Code Not Valid</b>\n\n` +
        `This code is either invalid, has already been used, or has expired.\n\n` +
        `Double-check the code and try again, or tap below to buy a plan directly.`,
        {
          parse_mode: 'HTML',
          reply_markup: new InlineKeyboard().text('💎 View Plans', 'plans'),
        }
      )
      return
    }

    const tier = promo.plan_tier as Exclude<PlanTier, 'free'>
    const plan = PLANS[tier]

    if (!plan) {
      logger.error('handleRedeem: unknown plan_tier in redeemed code', { tier, code: promo.code })
      await ctx.reply('⚠️ Code redeemed but plan type is unrecognised. Please contact support.')
      return
    }

    // If the user already has an active plan, stack the new days on top of the current expiry.
    // Otherwise start from now.
    const existingUser = await getUserById(userId)
    const existingTier = getActivePlanTier(existingUser?.plan, existingUser?.plan_expires_at)

    const startFrom =
      existingTier !== 'free' && existingUser?.plan_expires_at
        ? new Date(existingUser.plan_expires_at)
        : new Date()

    const expiresAt = new Date(startFrom)
    expiresAt.setDate(expiresAt.getDate() + plan.durationDays)

    const expLabel = expiresAt.toLocaleDateString('en-GB', {
      weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
    })

    await setUserPlan(userId, tier, expiresAt.toISOString())
    await setSubscription(userId, true)

    const stackNote = existingTier !== 'free'
      ? `\n\n📌 <i>Your existing plan was extended — no access time was lost.</i>`
      : ''

    const kb = new InlineKeyboard()
      .text('🔮 Get Predictions Now', 'cmd_predict')
      .row()
      .text('🏠 Main Menu', 'cmd_start')

    await ctx.reply(
      `🎉 <b>Code Redeemed!</b>\n\n` +
      `${plan.emoji} <b>${plan.name} Plan</b> activated.\n` +
      `Valid until: <b>${expLabel}</b>\n` +
      `Picks per day: <b>${plan.matchLimit}</b>${stackNote}`,
      { parse_mode: 'HTML', reply_markup: kb }
    )
  } catch (err) {
    logger.error('handleRedeem error', { userId, rawCode, error: String(err) })
    await ctx.reply('⚠️ Could not redeem code right now. Please try again.')
  }
}
