import type { Context } from 'grammy'
import { getFixturesByDate } from '../../football/apiClient'
import { MAJOR_LEAGUE_IDS } from '../../football/leagues'
import { formatResultsChunks } from '../../prediction/formatter'
import { resolvePredictions } from '../../db/predictions'
import { logger } from '../../utils/logger'

const FINISHED_STATUSES = new Set(['FT', 'AET', 'PEN'])

function yesterday(): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().split('T')[0]
}

export async function handleResults(ctx: Context): Promise<void> {
  const arg = (ctx.match as string | undefined)?.trim()
  let date: string

  if (arg && /^\d{4}-\d{2}-\d{2}$/.test(arg)) {
    const parsed = new Date(arg + 'T00:00:00Z')
    const today  = new Date()
    today.setUTCHours(0, 0, 0, 0)

    if (isNaN(parsed.getTime())) {
      await ctx.reply('⚠️ Invalid date. Use <code>/results YYYY-MM-DD</code>', { parse_mode: 'HTML' })
      return
    }
    if (parsed >= today) {
      await ctx.reply('⚠️ You can only look up past results. Try yesterday or earlier.', { parse_mode: 'HTML' })
      return
    }
    const cutoff = new Date(today)
    cutoff.setUTCDate(cutoff.getUTCDate() - 30)
    if (parsed < cutoff) {
      await ctx.reply('⚠️ Results are only available for the last 30 days.', { parse_mode: 'HTML' })
      return
    }
    date = arg
  } else if (arg) {
    await ctx.reply('⚠️ Invalid format. Use <code>/results YYYY-MM-DD</code>, e.g. <code>/results 2026-04-20</code>', { parse_mode: 'HTML' })
    return
  } else {
    date = yesterday()
  }

  await ctx.reply(`🔍 Fetching results for ${date}…`)

  try {
    const fixtures = await getFixturesByDate(date)
    const filtered = fixtures.filter(f =>
      MAJOR_LEAGUE_IDS.includes(f.league.id) &&
      FINISHED_STATUSES.has(f.fixture.status.short)
    )

    const chunks = formatResultsChunks(filtered, date)
    for (const chunk of chunks) {
      await ctx.reply(chunk, { parse_mode: 'HTML' })
    }

    // Silently resolve any predictions we made for this date
    resolvePredictions(date, filtered).catch(err =>
      logger.warn('resolvePredictions failed', { date, error: String(err) })
    )
  } catch (err) {
    logger.error('handleResults error', { error: String(err) })
    await ctx.reply('⚠️ Could not fetch results right now. Please try again later.')
  }
}
