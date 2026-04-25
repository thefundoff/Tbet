import type { Context } from 'grammy'
import { InlineKeyboard } from 'grammy'
import { PLANS, getActivePlanTier } from '../../utils/plans'
import type { PlanTier } from '../../utils/plans'
import { getUserById, setUserPlan, setSubscription, cancelUserPlan } from '../../db/users'
import { getPredictionsByDate } from '../../db/predictions'
import { formatPredictionChunks } from '../../prediction/formatter'
import { logger } from '../../utils/logger'
import { SAFE_CONFIDENCE_THRESHOLD, SAFE_GAME_COUNT } from '../../utils/constants'
import { handleMatches } from '../commands/matches'
import { handlePredict } from '../commands/predict'
import { handleResults } from '../commands/results'
import { handleStats }   from '../commands/stats'
import { buildAndSendSlip } from '../commands/slip'

// ── Shared helper ────────────────────────────────────────────────────────────

/**
 * Edits the message if we are inside a callback query (button tap),
 * or sends a new reply if called from a slash command.
 */
async function editOrReply(ctx: Context, text: string, extra: Record<string, unknown>): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (ctx as any).editMessageText(text, extra)
  } catch {
    await ctx.reply(text, extra as Parameters<Context['reply']>[1])
  }
}

// ── Plans overview ───────────────────────────────────────────────────────────

export async function showPlansOverview(ctx: Context): Promise<void> {
  const userId = ctx.from?.id
  let statusLine = ''

  if (userId) {
    const user = await getUserById(userId)
    const tier = getActivePlanTier(user?.plan, user?.plan_expires_at)

    if (tier !== 'free' && user?.plan_expires_at) {
      const plan = PLANS[tier as Exclude<PlanTier, 'free'>]
      const exp  = new Date(user.plan_expires_at)
      const d    = exp.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
      statusLine = `\n\n✅ <b>Active plan:</b> ${plan.emoji} ${plan.name} — expires ${d}`
    }
  }

  const text =
    `💎 <b>Tbet Plans</b>\n\n` +
    `Get daily football picks powered by real bookmaker odds and statistical analysis.${statusLine}\n\n` +
    `Select a plan below to see what's included:`

  const kb = new InlineKeyboard()
    .text('📅 Daily — ₦500',    'plan_daily')
    .row()
    .text('📆 Weekly — ₦2,500', 'plan_weekly')
    .row()
    .text('🗓️ Monthly — ₦8,000', 'plan_monthly')
    .row()
    .text('🎟️ Redeem a Code',   'redeem_info')
    .row()
    .text('⬅️ Back to Menu', 'cmd_start')

  await editOrReply(ctx, text, { parse_mode: 'HTML', reply_markup: kb })
}

// ── Plan detail ──────────────────────────────────────────────────────────────

export async function showPlanDetail(ctx: Context, tier: Exclude<PlanTier, 'free'>): Promise<void> {
  const plan = PLANS[tier]

  const featureLines = plan.features.map(f => `  ✅ ${f}`).join('\n')

  const durationLabel = plan.durationDays === 1
    ? '1 day'
    : `${plan.durationDays} days`

  const text =
    `${plan.emoji} <b>${plan.name} Plan — ${plan.price}</b>\n\n` +
    `${plan.tagline}\n\n` +
    `<b>What's included:</b>\n` +
    `${featureLines}\n\n` +
    `<b>Duration:</b> ${durationLabel} from activation`

  const kb = new InlineKeyboard()
    .text(`✅ Subscribe — ${plan.price}`, `buy_${tier}`)
    .row()
    .text('⬅️ Back to Plans', 'plans')

  await editOrReply(ctx, text, { parse_mode: 'HTML', reply_markup: kb })
}

// ── Purchase confirmation — Flutterwave ───────────────────────────────────────

export async function showPurchaseConfirmation(ctx: Context, tier: Exclude<PlanTier, 'free'>): Promise<void> {
  const userId = ctx.from?.id
  if (!userId) { await ctx.reply('⚠️ Could not identify your account.'); return }

  const plan    = PLANS[tier]
  const txRef   = `tbet-${userId}-${tier}-${Date.now()}`
  const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : ''

  // Show spinner while we hit the Flutterwave API
  await editOrReply(ctx, '⏳ Preparing your payment link…', { parse_mode: 'HTML' })

  let paymentLink: string
  try {
    const res = await fetch('https://api.flutterwave.com/v3/payments', {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${process.env.FLW_SECRET_KEY}`,
      },
      body: JSON.stringify({
        tx_ref:       txRef,
        amount:       plan.priceNGN,
        currency:     'NGN',
        redirect_url: `${baseUrl}/api/payment-complete`,
        customer: {
          email: `user${userId}@tbet.app`,
          name:  ctx.from?.first_name ?? 'Tbet User',
        },
        meta: { telegram_user_id: userId, plan_tier: tier },
        customizations: {
          title:       'Tbet Subscription',
          description: `${plan.name} Plan — ${plan.matchLimit} pick${plan.matchLimit > 1 ? 's' : ''}/day`,
        },
      }),
    })

    const json = await res.json() as { status: string; data?: { link: string } }
    if (json.status !== 'success' || !json.data?.link) {
      throw new Error(`Flutterwave API error: ${json.status}`)
    }
    paymentLink = json.data.link
  } catch (err) {
    logger.error('showPurchaseConfirmation: Flutterwave init failed', { userId, tier, error: String(err) })
    const kb = new InlineKeyboard().text('⬅️ Back to Plans', 'plans')
    await ctx.reply(
      '⚠️ <b>Payment Unavailable</b>\n\nCould not initialise payment right now. Please try again in a moment.',
      { parse_mode: 'HTML', reply_markup: kb }
    )
    return
  }

  const expiryDate = new Date()
  expiryDate.setDate(expiryDate.getDate() + plan.durationDays)
  const expLabel = expiryDate.toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  })

  const text =
    `🧾 <b>Order Summary</b>\n\n` +
    `Plan:      ${plan.emoji} ${plan.name}\n` +
    `Price:     <b>${plan.price}</b>\n` +
    `Access:    ${plan.durationDays === 1 ? 'Today only' : `${plan.durationDays} days`}\n` +
    `Expires:   ${expLabel}\n` +
    `Picks/day: <b>${plan.matchLimit}</b>\n\n` +
    `Tap the button below to pay securely via Flutterwave.\n` +
    `<i>Your plan activates automatically once payment is confirmed.</i>`

  const kb = new InlineKeyboard()
    .url(`💳 Pay ${plan.price} Now`, paymentLink)
    .row()
    .text('❌ Cancel', `plan_${tier}`)

  await ctx.reply(text, { parse_mode: 'HTML', reply_markup: kb })
}

// ── Activate plan (mock) ──────────────────────────────────────────────────────

export async function activatePlan(ctx: Context, tier: Exclude<PlanTier, 'free'>): Promise<void> {
  const userId = ctx.from?.id
  if (!userId) {
    await ctx.reply('⚠️ Could not identify your account.')
    return
  }

  const plan = PLANS[tier]

  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + plan.durationDays)
  const expLabel = expiresAt.toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  })

  try {
    await setUserPlan(userId, tier, expiresAt.toISOString())
    await setSubscription(userId, true)
  } catch (err) {
    logger.error('activatePlan failed', { userId, tier, error: String(err) })
    await ctx.reply('⚠️ Could not activate your plan. Please try again.')
    return
  }

  const text =
    `🎉 <b>${plan.emoji} ${plan.name} Plan Activated!</b>\n\n` +
    `Your plan is valid until <b>${expLabel}</b>.\n` +
    `You'll get up to <b>${plan.matchLimit} picks per day</b>.\n\n` +
    `You'll also receive daily morning predictions automatically.\n\n` +
    `Tap below to get your picks for today:`

  const kb = new InlineKeyboard()
    .text('🔮 Get Predictions Now', 'cmd_predict')
    .row()
    .text('🏠 Main Menu', 'cmd_start')

  await editOrReply(ctx, text, { parse_mode: 'HTML', reply_markup: kb })
}

// ── My Plan ───────────────────────────────────────────────────────────────────

export async function showMyPlan(ctx: Context): Promise<void> {
  const userId = ctx.from?.id
  if (!userId) {
    await ctx.reply('⚠️ Could not identify your account.')
    return
  }

  const user = await getUserById(userId)
  const tier = getActivePlanTier(user?.plan, user?.plan_expires_at)

  if (tier === 'free') {
    const hadPlan    = user?.plan && user.plan !== 'free'
    const expiredNote = hadPlan ? '\n\n⏰ <i>Your previous plan has expired.</i>' : ''

    const kb = new InlineKeyboard()
      .text('💎 View Plans', 'plans')
      .row()
      .text('🏠 Main Menu', 'cmd_start')

    await editOrReply(ctx,
      `💳 <b>My Plan</b>\n\n` +
      `You don't have an active subscription.${expiredNote}\n\n` +
      `Subscribe to unlock today's fixtures, predictions, and betting slips.`,
      { parse_mode: 'HTML', reply_markup: kb }
    )
    return
  }

  const plan = PLANS[tier as Exclude<PlanTier, 'free'>]
  const exp  = new Date(user!.plan_expires_at!)
  const now  = new Date()

  const daysLeft  = Math.ceil((exp.getTime() - now.getTime()) / 86_400_000)
  const expLabel  = exp.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
  const dayWord   = daysLeft === 1 ? '1 day' : `${daysLeft} days`

  const kb = new InlineKeyboard()
    .text('🔮 Get Predictions', 'cmd_predict')
    .row()
    .text('💎 Upgrade Plan', 'plans')
    .row()
    .text('❌ Cancel Plan', 'cancel_plan_confirm')
    .row()
    .text('🏠 Main Menu', 'cmd_start')

  await editOrReply(ctx,
    `💳 <b>My Plan</b>\n\n` +
    `${plan.emoji} <b>${plan.name} Plan</b> — Active\n\n` +
    `📦 Picks per day:  <b>${plan.matchLimit}</b>\n` +
    `📅 Expires:        <b>${expLabel}</b>\n` +
    `⏳ Time remaining: <b>${dayWord}</b>`,
    { parse_mode: 'HTML', reply_markup: kb }
  )
}

// ── Command shortcuts from buttons ────────────────────────────────────────────

export async function handleCommandButton(ctx: Context, command: string): Promise<void> {
  if (command === 'start') {
    const name = ctx.from?.first_name ?? 'there'

    const text =
      `👋 <b>Welcome, ${name}!</b>\n\n` +
      `I analyse real football matches and generate statistical predictions powered by market odds and AI modelling.\n\n` +
      `<b>What would you like to do?</b>`

    const kb = new InlineKeyboard()
      .text('⚽ Matches',     'cmd_matches')
      .text('🔮 Predictions', 'cmd_predict')
      .row()
      .text('📊 Results',     'cmd_results')
      .text('📈 Stats',       'cmd_stats')
      .row()
      .text('💳 My Plan',     'my_plan')
      .text('💎 View Plans',  'plans')

    await editOrReply(ctx, text, { parse_mode: 'HTML', reply_markup: kb })
    return
  }

  // For commands that trigger heavy handlers, answer the callback first
  // then call the handler — the handler sends its own reply message
  switch (command) {
    case 'matches': return handleMatches(ctx)
    case 'predict': return handlePredict(ctx)
    case 'results': return handleResults(ctx)
    case 'stats':   return handleStats(ctx)
  }
}

// ── Safe games filter ─────────────────────────────────────────────────────────

export async function showSafeGames(ctx: Context): Promise<void> {
  const userId = ctx.from?.id
  if (!userId) {
    await ctx.reply('⚠️ Could not identify your account.')
    return
  }

  const user = await getUserById(userId)
  const tier = getActivePlanTier(user?.plan, user?.plan_expires_at)

  if (tier === 'free' || PLANS[tier as Exclude<PlanTier, 'free'>].matchLimit <= 4) {
    const kb = new InlineKeyboard().text('💎 View Plans', 'plans')
    await ctx.reply(
      '🛡️ <b>Safe Games</b> is available on the Monthly plan.\n\nUpgrade to unlock this feature.',
      { parse_mode: 'HTML', reply_markup: kb }
    )
    return
  }

  const today       = new Date().toISOString().split('T')[0]
  const predictions = await getPredictionsByDate(today)

  const safe = predictions
    .filter(p => p.winner_confidence >= SAFE_CONFIDENCE_THRESHOLD)
    .sort((a, b) => b.winner_confidence - a.winner_confidence)
    .slice(0, SAFE_GAME_COUNT)

  if (!safe.length) {
    const kb = new InlineKeyboard().text('🏠 Main Menu', 'cmd_start')
    await ctx.reply(
      `🛡️ <b>No Safe Games Today</b>\n\n` +
      `No matches meet the safety threshold of <b>≥${SAFE_CONFIDENCE_THRESHOLD}%</b> confidence today.\n\n` +
      `Your full picks are still available — run /predict to view them.`,
      { parse_mode: 'HTML', reply_markup: kb }
    )
    return
  }

  await ctx.reply(
    `🛡️ <b>Safe Games — ${safe.length} pick${safe.length !== 1 ? 's' : ''}</b>\n\n` +
    `Filtered to <b>≥${SAFE_CONFIDENCE_THRESHOLD}%</b> confidence only.\n\n` +
    `⚠️ <i>Higher-confidence picks carry shorter odds (typically 1.2–1.6). ` +
    `These trades prioritise consistency over payout size.</i>`,
    { parse_mode: 'HTML' }
  )

  const chunks = formatPredictionChunks(safe, today)
  for (const chunk of chunks) {
    await ctx.reply(chunk, { parse_mode: 'HTML' })
  }
}

// ── Cancel plan ───────────────────────────────────────────────────────────────

export async function showCancelConfirmation(ctx: Context): Promise<void> {
  const userId = ctx.from?.id
  if (!userId) { await ctx.reply('⚠️ Could not identify your account.'); return }

  const user = await getUserById(userId)
  const tier = getActivePlanTier(user?.plan, user?.plan_expires_at)

  if (tier === 'free') {
    await editOrReply(ctx, '⚠️ You have no active plan to cancel.', {
      reply_markup: new InlineKeyboard().text('🏠 Main Menu', 'cmd_start'),
    })
    return
  }

  const plan     = PLANS[tier as Exclude<PlanTier, 'free'>]
  const expLabel = new Date(user!.plan_expires_at!).toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  })

  const kb = new InlineKeyboard()
    .text('Yes, cancel my plan', 'cancel_plan_execute')
    .row()
    .text('No, keep my plan', 'my_plan')

  await editOrReply(ctx,
    `⚠️ <b>Cancel Plan — Are you sure?</b>\n\n` +
    `You are about to cancel your <b>${plan.emoji} ${plan.name} Plan</b>.\n\n` +
    `Your access will be removed immediately and you will lose the remaining time until <b>${expLabel}</b>.\n\n` +
    `This cannot be undone.`,
    { parse_mode: 'HTML', reply_markup: kb }
  )
}

export async function executeCancelPlan(ctx: Context): Promise<void> {
  const userId = ctx.from?.id
  if (!userId) { await ctx.reply('⚠️ Could not identify your account.'); return }

  try {
    await cancelUserPlan(userId)
  } catch {
    await ctx.reply('⚠️ Could not cancel your plan. Please try again.')
    return
  }

  const kb = new InlineKeyboard()
    .text('💎 View Plans', 'plans')
    .row()
    .text('🏠 Main Menu', 'cmd_start')

  await editOrReply(ctx,
    `✅ <b>Plan Cancelled</b>\n\n` +
    `Your subscription has been cancelled and your access has been removed.\n\n` +
    `You can resubscribe at any time.`,
    { parse_mode: 'HTML', reply_markup: kb }
  )
}

// ── Central callback router ───────────────────────────────────────────────────

export async function handlePlanCallback(ctx: Context, data: string): Promise<void> {
  try {
    if (data === 'plans') {
      return showPlansOverview(ctx)
    }

    if (data === 'plan_daily')   return showPlanDetail(ctx, 'daily')
    if (data === 'plan_weekly')  return showPlanDetail(ctx, 'weekly')
    if (data === 'plan_monthly') return showPlanDetail(ctx, 'monthly')

    if (data === 'buy_daily')    return showPurchaseConfirmation(ctx, 'daily')
    if (data === 'buy_weekly')   return showPurchaseConfirmation(ctx, 'weekly')
    if (data === 'buy_monthly')  return showPurchaseConfirmation(ctx, 'monthly')

    if (data === 'confirm_daily')   return activatePlan(ctx, 'daily')
    if (data === 'confirm_weekly')  return activatePlan(ctx, 'weekly')
    if (data === 'confirm_monthly') return activatePlan(ctx, 'monthly')

    if (data === 'my_plan')             return showMyPlan(ctx)
    if (data === 'cancel_plan_confirm') return showCancelConfirmation(ctx)
    if (data === 'cancel_plan_execute') return executeCancelPlan(ctx)
    if (data === 'safe_games')          return showSafeGames(ctx)
    if (data === 'show_slip')  return buildAndSendSlip(ctx)

    if (data === 'redeem_info') {
      const kb = new InlineKeyboard().text('⬅️ Back to Plans', 'plans')
      await editOrReply(ctx,
        `🎟️ <b>Redeem a Promo Code</b>\n\n` +
        `Type the command below with your code:\n\n` +
        `<code>/redeem YOUR-CODE</code>\n\n` +
        `Example: <code>/redeem TBET-A3K9-M2X7</code>\n\n` +
        `<i>Codes are single-use and case-insensitive.</i>`,
        { parse_mode: 'HTML', reply_markup: kb }
      )
      return
    }

    if (data.startsWith('cmd_')) {
      return handleCommandButton(ctx, data.slice(4))
    }
  } catch (err) {
    logger.error('handlePlanCallback error', { data, error: String(err) })
    await ctx.reply('⚠️ Something went wrong. Please try again.')
  }
}
