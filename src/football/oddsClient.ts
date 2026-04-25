import { logger } from '../utils/logger'

const BASE_URL = 'https://api.the-odds-api.com/v4'

export interface MatchOdds {
  homeTeam: string
  awayTeam: string
  homeProbability: number
  drawProbability: number
  awayProbability: number
  bookmakerCount: number
}

interface OddsOutcome { name: string; price: number }
interface OddsBookmaker {
  key: string
  title: string
  markets: Array<{ key: string; outcomes: OddsOutcome[] }>
}
interface OddsEvent {
  id: string
  sport_key: string
  home_team: string
  away_team: string
  commence_time: string
  bookmakers: OddsBookmaker[]
}

// Normalize team name for fuzzy matching (remove accents, common suffixes, punctuation)
export function normalizeTeam(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\b(fc|cf|sc|ac|as|rc|ss|ud|sd|cd|rcd|afc|bfc)\b/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function teamsMatch(a: string, b: string): boolean {
  const na = normalizeTeam(a)
  const nb = normalizeTeam(b)
  if (na === nb) return true
  if (na.includes(nb) || nb.includes(na)) return true
  // word overlap: enough shared words = same team
  const aWords = new Set(na.split(' ').filter(w => w.length > 2))
  const bWords = nb.split(' ').filter(w => w.length > 2)
  const overlap = bWords.filter(w => aWords.has(w))
  return overlap.length > 0 && overlap.length >= Math.min(aWords.size, bWords.length)
}

async function fetchSportOdds(sportKey: string): Promise<OddsEvent[]> {
  const key = process.env.ODDS_API_KEY
  if (!key) throw new Error('ODDS_API_KEY environment variable is not set')

  const url = `${BASE_URL}/sports/${sportKey}/odds?apiKey=${key}&regions=eu&markets=h2h&oddsFormat=decimal`
  logger.info('Odds API request', { sport: sportKey })

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15_000)

  let res: Response
  try {
    res = await fetch(url, { signal: controller.signal })
  } catch (err) {
    clearTimeout(timeout)
    throw new Error(`Odds API fetch failed: ${String(err)}`)
  }
  clearTimeout(timeout)

  // 422 = sport exists but no active odds right now — not an error
  if (res.status === 422 || res.status === 404) return []

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    logger.warn('Odds API HTTP error', { status: res.status, sport: sportKey, body })
    return []
  }

  const remaining = res.headers.get('x-requests-remaining')
  if (remaining) logger.info('Odds API quota remaining', { remaining })

  return (await res.json()) as OddsEvent[]
}

/**
 * Fetch odds for multiple sport keys and return a map of normalized team pairs → MatchOdds.
 * Probabilities are consensus averages across all available bookmakers.
 */
export async function fetchOddsMap(sportKeys: string[]): Promise<Map<string, MatchOdds>> {
  const oddsMap = new Map<string, MatchOdds>()

  for (const sportKey of sportKeys) {
    try {
      const events = await fetchSportOdds(sportKey)

      for (const event of events) {
        let totalHome = 0, totalDraw = 0, totalAway = 0, count = 0

        for (const bm of event.bookmakers) {
          const h2h = bm.markets.find(m => m.key === 'h2h')
          if (!h2h) continue

          const homeO = h2h.outcomes.find(o => teamsMatch(event.home_team, o.name))
          const awayO = h2h.outcomes.find(o => teamsMatch(event.away_team, o.name))
          const drawO = h2h.outcomes.find(o => o.name === 'Draw')
          if (!homeO || !awayO || !drawO) continue

          // Implied probability = 1 / decimal_odds, then normalize to remove overround
          const rawHome = 1 / homeO.price
          const rawDraw = 1 / drawO.price
          const rawAway = 1 / awayO.price
          const sum = rawHome + rawDraw + rawAway

          totalHome += rawHome / sum
          totalDraw += rawDraw / sum
          totalAway += rawAway / sum
          count++
        }

        if (count === 0) continue

        const homeProb = Math.round((totalHome / count) * 100)
        const drawProb = Math.round((totalDraw / count) * 100)
        const awayProb = 100 - homeProb - drawProb

        const mapKey = `${normalizeTeam(event.home_team)}|${normalizeTeam(event.away_team)}`
        oddsMap.set(mapKey, {
          homeTeam:        event.home_team,
          awayTeam:        event.away_team,
          homeProbability: homeProb,
          drawProbability: drawProb,
          awayProbability: awayProb,
          bookmakerCount:  count,
        })
      }
    } catch (err) {
      logger.warn('Odds API: skipping sport', { sportKey, error: String(err) })
    }
  }

  logger.info('Odds map built', { matches: oddsMap.size, sportsQueried: sportKeys.length })
  return oddsMap
}

/**
 * Look up market odds for a specific fixture by team names.
 * Returns null if no odds are available for this match.
 */
export function lookupOdds(
  homeTeam: string,
  awayTeam: string,
  oddsMap: Map<string, MatchOdds>
): MatchOdds | null {
  for (const odds of oddsMap.values()) {
    if (teamsMatch(homeTeam, odds.homeTeam) && teamsMatch(awayTeam, odds.awayTeam)) {
      return odds
    }
  }
  return null
}
