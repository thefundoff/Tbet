import type { Context } from 'grammy'
import { InlineKeyboard } from 'grammy'
import { getPredictionsByDate } from '../../db/predictions'
import type { PredictionRow } from '../../db/predictions'
import { getUserById } from '../../db/users'
import { PLANS, getActivePlanTier } from '../../utils/plans'
import { MIN_PREDICTION_CONFIDENCE } from '../../utils/constants'
import { logger } from '../../utils/logger'
import { DISCLAIMER } from '../../utils/constants'

function outcomeLabel(row: PredictionRow): string {
  if (row.predicted_winner === 'home') return `${row.home_team} Win`
  if (row.predicted_winner === 'away') return `${row.away_team} Win`
  return 'Draw'
}

function estOdds(confidence: number): string {
  if (confidence <= 0) return '—'
  return (1 / (confidence / 100)).toFixed(2)
}

function buildSlipText(picks: PredictionRow[], date: string): string {
  const DIVIDER = '─────────────────────────'

  const lines: string[] = [
    `📋 <b>Betting Slip — ${date}</b>`,
    DIVIDER,
  ]

  let accaOdds = 1

  picks.forEach((p, i) => {
    const time    = p.match_time ? ` · ${p.match_time}` : ''
    const pick    = outcomeLabel(p)
    const conf    = p.winner_confidence
    const odds    = estOdds(conf)
    const ouLabel = p.over_under_prediction === 'over' ? 'Over 2.5' : 'Under 2.5'
    const btts    = p.btts_prediction ? 'Yes' : 'No'

    accaOdds *= 1 / (conf / 100)

    lines.push(
      `\n<b>${i + 1}. ${p.home_team} vs ${p.away_team}</b>`,
      `   🏆 ${p.league_name}${time}`,
      `   ✅ <b>${pick}</b> · ${conf}% · ~${odds} odds`,
      `   📈 O/U 2.5: ${ouLabel} · BTTS: ${btts}`
    )
  })

  lines.push(`\n${DIVIDER}`)

  if (picks.length > 1) {
    lines.push(
      `💰 <b>Accumulator: ~${accaOdds.toFixed(2)}×</b>`,
      `   (Stake × ${accaOdds.toFixed(2)} if all ${picks.length} correct)`,
    )
  } else {
    lines.push(`💰 <b>Estimated odds: ~${estOdds(picks[0].winner_confidence)}×</b>`)
  }

  lines.push(
    `\n${DIVIDER}`,
    `<i>Odds are estimates based on model confidence.</i>`,
    `<i>Always verify exact odds on your platform before placing.</i>`,
    `\n${DISCLAIMER}`,
  )

  return lines.join('\n')
}

/**
 * Core logic shared by the /slip command and the 📋 button callback.
 */
export async function buildAndSendSlip(ctx: Context): Promise<void> {
  const userId = ctx.from?.id
  if (!userId) {
    await ctx.reply('⚠️ Could not identify your account.')
    return
  }

  const user = await getUserById(userId)
  const tier = getActivePlanTier(user?.plan, user?.plan_expires_at)

  if (tier === 'free') {
    const kb = new InlineKeyboard().text('💎 View Plans', 'plans')
    await ctx.reply(
      '🔒 <b>Subscription Required</b>\n\nSubscribe to a plan to access the betting slip.',
      { parse_mode: 'HTML', reply_markup: kb }
    )
    return
  }

  const matchLimit = PLANS[tier].matchLimit
  const today      = new Date().toISOString().split('T')[0]
  const all        = await getPredictionsByDate(today)

  const picks = all
    .filter(p => p.winner_confidence >= MIN_PREDICTION_CONFIDENCE)
    .sort((a, b) => b.winner_confidence - a.winner_confidence)
    .slice(0, matchLimit)

  if (!picks.length) {
    const kb = new InlineKeyboard().text('🔮 Generate Predictions', 'cmd_predict')
    await ctx.reply(
      `📋 <b>No picks available yet for today.</b>\n\nRun /predict first to generate today's predictions, then come back for the slip.`,
      { parse_mode: 'HTML', reply_markup: kb }
    )
    return
  }

  const text = buildSlipText(picks, today)
  const kb   = new InlineKeyboard().text('🏠 Main Menu', 'cmd_start')

  await ctx.reply(text, { parse_mode: 'HTML', reply_markup: kb })
}

export async function handleSlip(ctx: Context): Promise<void> {
  try {
    await buildAndSendSlip(ctx)
  } catch (err) {
    logger.error('handleSlip error', { error: String(err) })
    await ctx.reply('⚠️ Could not generate slip right now. Please try again.')
  }
}
