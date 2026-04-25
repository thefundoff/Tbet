import type { Context } from 'grammy'
import { getAccuracyStats } from '../../db/predictions'
import { logger } from '../../utils/logger'

function pct(correct: number, total: number): string {
  if (total === 0) return 'N/A'
  return `${Math.round((correct / total) * 100)}%`
}

function bar(correct: number, total: number): string {
  if (total === 0) return '░░░░░░░░░░ N/A'
  const filled = Math.round((correct / total) * 10)
  return '█'.repeat(filled) + '░'.repeat(10 - filled) + ` ${pct(correct, total)} (${correct}/${total})`
}

export async function handleStats(ctx: Context): Promise<void> {
  try {
    const s = await getAccuracyStats()

    if (s.total === 0) {
      await ctx.reply(
        '📊 <b>No predictions resolved yet.</b>\n\n' +
        'Run /results to score yesterday\'s predictions.\n' +
        'Stats will appear here once matches have been resolved.',
        { parse_mode: 'HTML' }
      )
      return
    }

    const text = [
      `📊 <b>Tbet Accuracy Report</b>`,
      ``,
      `📅 <b>All Time</b>`,
      `Overall: ${bar(s.correct, s.total)}`,
      ``,
      `<b>By Outcome:</b>`,
      `🏠 Home Win  ${bar(s.byOutcome.home.correct, s.byOutcome.home.total)}`,
      `🤝 Draw      ${bar(s.byOutcome.draw.correct, s.byOutcome.draw.total)}`,
      `✈️ Away Win  ${bar(s.byOutcome.away.correct, s.byOutcome.away.total)}`,
      ``,
      `<b>By Source:</b>`,
      `📡 Market Odds   ${bar(s.bySource.market.correct,      s.bySource.market.total)}`,
      `📐 Statistical   ${bar(s.bySource.statistical.correct, s.bySource.statistical.total)}`,
      ``,
      `📅 <b>Last 30 Days</b>`,
      `Overall: ${bar(s.last30.correct, s.last30.total)}`,
      ``,
      `<i>Stats update automatically each time you run /results.</i>`,
    ].join('\n')

    await ctx.reply(text, { parse_mode: 'HTML' })
  } catch (err) {
    logger.error('handleStats error', { error: String(err) })
    await ctx.reply('⚠️ Could not load stats right now. Please try again later.')
  }
}
