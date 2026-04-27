import type { Context } from 'grammy'
import { InlineKeyboard } from 'grammy'
import { getFixturesByDate, getTeamStatistics, getHeadToHead } from '../../football/apiClient'
import { MAJOR_LEAGUE_IDS, LEAGUE_TO_SPORT_KEY } from '../../football/leagues'
import { fetchOddsMap, lookupOdds } from '../../football/oddsClient'
import { generatePrediction } from '../../prediction/engine'
import { formatPredictionChunks } from '../../prediction/formatter'
import { getPredictionsByDate, upsertPrediction } from '../../db/predictions'
import type { PredictionInsert } from '../../db/predictions'
import { getUserById, recordPredictionFetch } from '../../db/users'
import { PLANS, getActivePlanTier } from '../../utils/plans'
import { logger } from '../../utils/logger'
import { API_CALL_DELAY_MS, PREDICTION_CACHE_HOURS, MIN_PREDICTION_CONFIDENCE, SAFE_CONFIDENCE_THRESHOLD } from '../../utils/constants'

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function handlePredict(ctx: Context): Promise<void> {
  const userId = ctx.from?.id

  if (!userId) {
    await ctx.reply('⚠️ Could not identify your account.')
    return
  }

  const user = await getUserById(userId)

  // ── Plan check ──────────────────────────────────────────────────────────────
  const tier = getActivePlanTier(user?.plan, user?.plan_expires_at)

  if (tier === 'free') {
    const hadPlan     = user?.plan && user.plan !== 'free'
    const expiredNote = hadPlan ? '\n\n⏰ <i>Your previous plan has expired.</i>' : ''

    const kb = new InlineKeyboard()
      .text('📅 Daily — ₦500',     'plan_daily')
      .row()
      .text('📆 Weekly — ₦2,500',  'plan_weekly')
      .row()
      .text('🗓️ Monthly — ₦8,000', 'plan_monthly')

    await ctx.reply(
      `🔒 <b>Subscription Required</b>${expiredNote}\n\n` +
      `Subscribe to a plan to unlock daily football predictions:\n\n` +
      `📅 <b>Daily</b> — ₦500 · 2 picks now.toISOString().split('T')[0]\n` +
      `📆 <b>Weekly</b> — ₦2,500 · 4 picks/day for 7 days\n` +
      `🗓️ <b>Monthly</b> — ₦8,000 · 6 picks/day for 30 days`,
      { parse_mode: 'HTML', reply_markup: kb }
    )
    return
  }

  const plan = PLANS[tier]

  // ── Fetch limit: 2 fetches per 2-hour window ───────────────────────────────
  // Window key format: "YYYY-MM-DD-N" where N = floor(UTC_hour / 2), giving
  // 12 fixed slots per day (00-02, 02-04, … 22-24).
  const MAX_WINDOW_FETCHES = 2
  const now         = new Date()
  const slot        = Math.floor(now.getUTCHours() / 2)
  const windowKey   = `${now.toISOString().split('T')[0]}-${slot}`
  const isSameWindow = user?.last_prediction_fetch_date === windowKey
  const fetchCount   = isSameWindow ? (user?.prediction_fetch_count ?? 0) : 0

  if (isSameWindow && fetchCount >= MAX_WINDOW_FETCHES) {
    // Time until the next even UTC hour
    const nextSlot = new Date(now)
    nextSlot.setUTCHours((slot + 1) * 2, 0, 0, 0)
    const minsLeft   = Math.ceil((nextSlot.getTime() - now.getTime()) / 60_000)
    const resetLabel = minsLeft <= 60
      ? `${minsLeft} minute${minsLeft !== 1 ? 's' : ''}`
      : `${Math.ceil(minsLeft / 60)} hour${Math.ceil(minsLeft / 60) !== 1 ? 's' : ''}`

    const isUpgradeable = tier === 'daily' || tier === 'weekly'
    const upgradeText   = tier === 'daily'
      ? `\n\nWant more picks per fetch?\n📆 <b>Weekly</b> — 4 picks/day · ₦2,500\n🗓️ <b>Monthly</b> — 6 picks/day · ₦8,000`
      : tier === 'weekly'
      ? `\n\nWant even more picks?\n🗓️ <b>Monthly</b> — 6 picks/day · ₦8,000`
      : ''

    const kb = new InlineKeyboard()
    if (isUpgradeable) kb.text('💎 Upgrade Plan', 'plans').row()
    kb.text('🏠 Main Menu', 'cmd_start')

    await ctx.reply(
      `🔒 <b>Fetch limit reached.</b>\n\n` +
      `You can fetch predictions <b>twice every 2 hours</b>.\n` +
      `Your next fetch opens in <b>${resetLabel}</b>.${upgradeText}`,
      { parse_mode: 'HTML', reply_markup: kb }
    )
    return
  }

  const matchLimit = plan.matchLimit

  // ── Generate predictions ────────────────────────────────────────────────────
  await ctx.reply('⚙️ Generating predictions… this may take a moment.')

  try {
    const cached = await getPredictionsByDate(now.toISOString().split('T')[0])
    const cacheAge = cached.length
      ? (Date.now() - new Date(cached[0].created_at).getTime()) / 3_600_000
      : Infinity

    let predictions = cached

    if (!cached.length || cacheAge > PREDICTION_CACHE_HOURS) {
      predictions = await buildPredictions(now.toISOString().split('T')[0])
    }

    const confident = predictions
      .filter(p => p.winner_confidence >= MIN_PREDICTION_CONFIDENCE)
      .sort((a, b) => b.winner_confidence - a.winner_confidence)
      .slice(0, matchLimit)

    const chunks = formatPredictionChunks(confident, now.toISOString().split('T')[0])
    for (const chunk of chunks) {
      await ctx.reply(chunk, { parse_mode: 'HTML' })
    }

    // Action buttons after predictions
    if (confident.length > 0) {
      const kb = new InlineKeyboard()

      if (matchLimit > 4) {
        kb.text('🛡️ Safe Games', 'safe_games').text('📋 Betting Slip', 'show_slip')
      } else {
        kb.text('📋 Betting Slip', 'show_slip')
      }

      const hint = matchLimit > 4
        ? `💡 <i>Filter to safest picks or get a clean slip for your platform.</i>`
        : `💡 <i>Tap for a clean betting slip ready for manual entry on any platform.</i>`

      await ctx.reply(hint, { parse_mode: 'HTML', reply_markup: kb })
    }

    // Record successful fetch — fire and forget so it never blocks the user
    recordPredictionFetch(userId, windowKey, fetchCount, !isSameWindow).catch(err =>
      logger.warn('recordPredictionFetch failed', { userId, error: String(err) })
    )
  } catch (err) {
    logger.error('handlePredict error', { error: String(err) })
    await ctx.reply('⚠️ Could not generate predictions right now. Please try again later.')
  }
}

// API-Football free tier: 10 req/min. Standings take 8 calls alone, leaving only 2
// for fixture stats. Skipping standings (engine returns neutral 0.5 when null) lets
// us process 5 fixtures within the 60-second serverless limit.
const MAX_FIXTURES_PER_BUILD = 5

export async function buildPredictions(date: string) {
  const fixtures = await getFixturesByDate(date)
  const filtered = fixtures
    .filter(f => MAJOR_LEAGUE_IDS.includes(f.league.id))
    .slice(0, MAX_FIXTURES_PER_BUILD)

  // --- Market odds (The Odds API) ---
  const sportKeys = [...new Set(
    filtered.map(f => LEAGUE_TO_SPORT_KEY[f.league.id]).filter(Boolean)
  )] as string[]
  const oddsMap = await fetchOddsMap(sportKeys)

  // --- Per-fixture prediction (sequential to respect 10 req/min rate limit) ---
  for (const fixture of filtered) {
    try {
      const season      = fixture.league.season
      const fixtureDate = new Date(fixture.fixture.date)
      const matchTime   = `${String(fixtureDate.getUTCHours()).padStart(2, '0')}:${String(fixtureDate.getUTCMinutes()).padStart(2, '0')} UTC`

      const marketOdds = lookupOdds(fixture.teams.home.name, fixture.teams.away.name, oddsMap)

      // Sequential calls — parallel would exceed the 10 req/min free-tier limit
      const homeStats = await getTeamStatistics(fixture.teams.home.id, fixture.league.id, season)
      await sleep(API_CALL_DELAY_MS)
      const awayStats = await getTeamStatistics(fixture.teams.away.id, fixture.league.id, season)
      await sleep(API_CALL_DELAY_MS)

      // H2H only needed for statistical 1X2 — skip when market odds are available
      const h2h = marketOdds
        ? []
        : await getHeadToHead(fixture.teams.home.id, fixture.teams.away.id, 5)

      if (!marketOdds) await sleep(API_CALL_DELAY_MS)

      // Stats prediction always runs — used for O/U and BTTS
      // Standings skipped (null = neutral 0.5 in engine), saving 8 API calls per build
      const statsResult = await generatePrediction({ fixture, homeStats, awayStats, h2h, homeStanding: null, awayStanding: null })

      // 1X2: prefer market odds, fall back to statistical
      let homeProbability: number
      let drawProbability: number
      let awayProbability: number
      let predictedWinner: 'home' | 'draw' | 'away'
      let winnerConfidence: number
      let predictionSource: 'market' | 'statistical'

      if (marketOdds) {
        homeProbability  = marketOdds.homeProbability
        drawProbability  = marketOdds.drawProbability
        awayProbability  = marketOdds.awayProbability
        predictionSource = 'market'

        const maxProb = Math.max(homeProbability, drawProbability, awayProbability)
        if (maxProb === drawProbability)      { predictedWinner = 'draw'; winnerConfidence = drawProbability }
        else if (maxProb === homeProbability) { predictedWinner = 'home'; winnerConfidence = homeProbability }
        else                                 { predictedWinner = 'away'; winnerConfidence = awayProbability }
      } else {
        homeProbability  = statsResult.homeProbability
        drawProbability  = statsResult.drawProbability
        awayProbability  = statsResult.awayProbability
        predictedWinner  = statsResult.predictedWinner
        winnerConfidence = statsResult.winnerConfidence
        predictionSource = 'statistical'
      }

      // Value bet: where our statistical model gives ≥10% more probability than the market
      const VALUE_THRESHOLD = 10
      let valueBet: 'home' | 'draw' | 'away' | null = null
      let valueEdge: number | null = null

      if (marketOdds) {
        const edges = {
          home: statsResult.homeProbability - marketOdds.homeProbability,
          draw: statsResult.drawProbability - marketOdds.drawProbability,
          away: statsResult.awayProbability - marketOdds.awayProbability,
        }
        const best = (Object.entries(edges) as ['home' | 'draw' | 'away', number][])
          .sort((a, b) => b[1] - a[1])[0]

        if (best[1] >= VALUE_THRESHOLD) {
          valueBet  = best[0]
          valueEdge = Math.round(best[1])
        }
      }

      const insert: PredictionInsert = {
        fixture_id:              fixture.fixture.id,
        match_date:              date,
        home_team:               fixture.teams.home.name,
        away_team:               fixture.teams.away.name,
        league_name:             fixture.league.name,
        league_id:               fixture.league.id,
        match_time:              matchTime,
        predicted_winner:        predictedWinner,
        winner_confidence:       winnerConfidence,
        home_probability:        homeProbability,
        draw_probability:        drawProbability,
        away_probability:        awayProbability,
        prediction_source:       predictionSource,
        stat_home_probability:   statsResult.homeProbability,
        stat_draw_probability:   statsResult.drawProbability,
        stat_away_probability:   statsResult.awayProbability,
        value_bet:               valueBet,
        value_edge:              valueEdge,
        over_under_prediction:   statsResult.overUnderPrediction,
        over_under_confidence:   statsResult.overUnderConfidence,
        btts_prediction:         statsResult.bttsPrediction,
        btts_confidence:         statsResult.bttsConfidence,
        actual_winner:           null,
        was_correct:             null,
        resolved_at:             null,
        algorithm_inputs:        {
          ...statsResult.algorithmInputs,
          ...(marketOdds ? { bookmakerCount: marketOdds.bookmakerCount } : {}),
        },
      }

      await upsertPrediction(insert)
    } catch (err) {
      logger.warn('Skipping fixture due to error', {
        fixtureId: fixture.fixture.id,
        error: String(err),
      })
    }
  }

  return getPredictionsByDate(date)
}
