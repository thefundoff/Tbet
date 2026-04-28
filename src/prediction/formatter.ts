import type { PredictionRow } from '../db/predictions'
import type { Fixture } from '../football/types'
import { DISCLAIMER, MAX_MATCHES_PER_MESSAGE } from '../utils/constants'

function winnerLabel(row: PredictionRow): string {
  if (row.predicted_winner === 'home') return `<b>${row.home_team} Win</b>`
  if (row.predicted_winner === 'away') return `<b>${row.away_team} Win</b>`
  return `<b>Draw</b>`
}

function confidenceBar(pct: number): string {
  const filled = Math.round(pct / 10)
  return '█'.repeat(filled) + '░'.repeat(10 - filled) + ` ${pct}%`
}

function formatMatch(row: PredictionRow): string {
  const time      = row.match_time ? ` · ${row.match_time}` : ''
  const homeBar   = confidenceBar(row.home_probability)
  const drawBar   = confidenceBar(row.draw_probability)
  const awayBar   = confidenceBar(row.away_probability)
  const homeLabel = row.predicted_winner === 'home' ? `<b>${row.home_team} ✅</b>` : row.home_team
  const drawLabel = row.predicted_winner === 'draw' ? `<b>Draw ✅</b>` : 'Draw'
  const awayLabel = row.predicted_winner === 'away' ? `<b>${row.away_team} ✅</b>` : row.away_team

  const bookmakerCount = (row.algorithm_inputs as Record<string, unknown> | null)?.bookmakerCount
  const sourceLine = row.prediction_source === 'market'
    ? `📡 <i>Market Odds${bookmakerCount ? ` · ${bookmakerCount} bookmakers` : ''}</i>`
    : `📐 <i>Statistical Model</i>`

  const valueLine = row.value_bet !== null && row.value_edge !== null
    ? `💎 <b>Value Bet: ${
        row.value_bet === 'home' ? row.home_team
          : row.value_bet === 'away' ? row.away_team
          : 'Draw'
      } (+${row.value_edge}% edge vs market)</b>`
    : null

  const isRisky = row.winner_confidence <= 40

  const ouLine = [
    `📈 Over/Under 2.5: <b>${row.over_under_prediction === 'over' ? 'Over ↑' : 'Under ↓'}</b>`,
    `   ${confidenceBar(Math.round(row.over_under_confidence))}`,
  ]

  const bttsLine = [
    `🔁 Both Teams Score: <b>${row.btts_prediction ? 'Yes ✅' : 'No ❌'}</b>`,
    `   ${confidenceBar(Math.round(row.btts_confidence))}`,
  ]

  return [
    `⚽ <b>${row.home_team} vs ${row.away_team}</b>`,
    `🏆 ${row.league_name}${time}`,
    sourceLine,
    ...(valueLine ? [valueLine] : []),
    ...(isRisky ? [`⚠️ <i>High-risk pick — odds are very close. Only stake what you can afford to lose.</i>`] : []),
    ``,
    `📊 <b>Win Probabilities</b>`,
    `🏠 ${homeLabel}`,
    `   ${homeBar}`,
    `🤝 ${drawLabel}`,
    `   ${drawBar}`,
    `✈️ ${awayLabel}`,
    `   ${awayBar}`,
    ``,
    ...ouLine,
    ``,
    ...bttsLine,
  ].join('\n')
}

const DIVIDER = '\n────────────────────────\n'

/**
 * Format a list of predictions into one or more Telegram HTML message strings.
 * Each chunk respects Telegram's 4096-character limit.
 * The disclaimer is appended to the final chunk only.
 */
export function formatPredictionChunks(rows: PredictionRow[], date: string): string[] {
  if (!rows.length) {
    return [`No predictions available for ${date}.\n\n${DISCLAIMER}`]
  }

  const header = `📅 <b>Predictions for ${date}</b>\n`
  const chunks: string[] = []
  let batch: PredictionRow[] = []

  for (let i = 0; i < rows.length; i++) {
    batch.push(rows[i])

    const isLastMatch = i === rows.length - 1
    const batchFull   = batch.length >= MAX_MATCHES_PER_MESSAGE

    if (batchFull || isLastMatch) {
      const body = batch.map(formatMatch).join(DIVIDER)
      const isLastChunk = isLastMatch
      const text = [
        chunks.length === 0 ? header : `📅 <b>Predictions for ${date} (cont.)</b>\n`,
        body,
        isLastChunk ? `\n\n${DISCLAIMER}` : '',
      ].join('\n')

      chunks.push(text)
      batch = []
    }
  }

  return chunks
}

/**
 * Format a list of upcoming fixtures (no predictions) for the /matches command.
 */
export function formatMatchListChunks(
  fixtures: Array<{ home: string; away: string; league: string; time: string }>,
  date: string
): string[] {
  if (!fixtures.length) {
    return [`No matches found for ${date}.\n\n${DISCLAIMER}`]
  }

  const header = `📅 <b>Upcoming Matches — ${date}</b>\n\n`
  const lines  = fixtures.map(
    (f, i) => `${i + 1}. ${f.home} vs ${f.away}\n   🏆 ${f.league} · ${f.time}`
  )

  const chunks: string[] = []
  let current = header

  for (const line of lines) {
    const next = current + line + '\n\n'
    if (next.length > 4000) {
      chunks.push(current)
      current = line + '\n\n'
    } else {
      current = next
    }
  }

  if (current.trim()) {
    current += DISCLAIMER
    chunks.push(current)
  }

  return chunks
}

/**
 * Format a list of completed fixtures (with scores) for the /results command.
 */
export function formatResultsChunks(fixtures: Fixture[], date: string): string[] {
  if (!fixtures.length) {
    return [`No completed matches found in the covered leagues for ${date}.`]
  }

  const header = `📅 <b>Results — ${date}</b>\n\n`
  const lines = fixtures.map(f => {
    const home      = f.teams.home.name
    const away      = f.teams.away.name
    const homeGoals = f.goals.home ?? 0
    const awayGoals = f.goals.away ?? 0
    const status    = f.fixture.status.short
    const suffix    = status === 'AET' ? ' <i>(AET)</i>' : status === 'PEN' ? ' <i>(PEN)</i>' : ''
    return `⚽ <b>${home} ${homeGoals} – ${awayGoals} ${away}</b>${suffix}\n   🏆 ${f.league.name}`
  })

  const chunks: string[] = []
  let current = header

  for (const line of lines) {
    const next = current + line + '\n\n'
    if (next.length > 4000) {
      chunks.push(current)
      current = line + '\n\n'
    } else {
      current = next
    }
  }

  if (current.trim()) chunks.push(current)

  return chunks
}
