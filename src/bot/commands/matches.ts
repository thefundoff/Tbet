import type { Context } from 'grammy'
import { InlineKeyboard } from 'grammy'
import { getFixturesByDate } from '../../football/apiClient'
import { MAJOR_LEAGUE_IDS } from '../../football/leagues'
import { formatMatchListChunks } from '../../prediction/formatter'
import { logger } from '../../utils/logger'
import { getUserById } from '../../db/users'
import { getActivePlanTier } from '../../utils/plans'

export async function handleMatches(ctx: Context): Promise<void> {
  const userId = ctx.from?.id

  if (userId) {
    const user = await getUserById(userId)
    const tier = getActivePlanTier(user?.plan, user?.plan_expires_at)

    if (tier === 'free') {
      const kb = new InlineKeyboard()
        .text('📅 Daily — ₦500',     'plan_daily')
        .row()
        .text('📆 Weekly — ₦2,500',  'plan_weekly')
        .row()
        .text('🗓️ Monthly — ₦8,000', 'plan_monthly')

      await ctx.reply(
        `🔒 <b>Subscription Required</b>\n\n` +
        `Today\'s fixtures are available to subscribers only.\n\n` +
        `Subscribe to a plan to unlock:\n` +
        `⚽ Today\'s match schedule\n` +
        `🔮 Daily predictions\n` +
        `📋 Betting slip`,
        { parse_mode: 'HTML', reply_markup: kb }
      )
      return
    }
  }

  await ctx.reply('🔍 Fetching today\'s matches…')

  const today = new Date().toISOString().split('T')[0]

  try {
    const fixtures = await getFixturesByDate(today)
    const filtered = fixtures.filter(f => MAJOR_LEAGUE_IDS.includes(f.league.id))

    const matchList = filtered.map(f => {
      const date    = new Date(f.fixture.date)
      const hours   = String(date.getUTCHours()).padStart(2, '0')
      const minutes = String(date.getUTCMinutes()).padStart(2, '0')
      return {
        home:   f.teams.home.name,
        away:   f.teams.away.name,
        league: f.league.name,
        time:   `${hours}:${minutes} UTC`,
      }
    })

    const chunks = formatMatchListChunks(matchList, today)
    for (const chunk of chunks) {
      await ctx.reply(chunk, { parse_mode: 'HTML' })
    }
  } catch (err) {
    logger.error('handleMatches error', { error: String(err) })
    await ctx.reply('⚠️ Could not fetch matches right now. Please try again later.')
  }
}
