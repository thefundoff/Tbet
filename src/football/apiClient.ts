import { logger } from '../utils/logger'
import type { ApiResponse, Fixture, TeamStats, H2HFixture, Standing } from './types'

const BASE_URL = 'https://v3.football.api-sports.io'

function getHeaders(): Record<string, string> {
  const key = process.env.RAPIDAPI_KEY
  if (!key) throw new Error('RAPIDAPI_KEY environment variable is not set')
  return {
    'x-apisports-key': key,
  }
}

async function apiFetch<T>(path: string): Promise<T[]> {
  const url = `${BASE_URL}${path}`
  logger.info('API-Football request', { url })

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15_000)

  let res: Response
  try {
    res = await fetch(url, { headers: getHeaders(), signal: controller.signal })
  } catch (err) {
    clearTimeout(timeout)
    const message = err instanceof Error && err.name === 'AbortError'
      ? `API-Football request timed out: ${url}`
      : `API-Football fetch failed: ${String(err)}`
    logger.error(message)
    throw new Error(message)
  }
  clearTimeout(timeout)

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    logger.error('API-Football HTTP error', { status: res.status, url, body })
    throw new Error(`API-Football responded ${res.status} for ${url}`)
  }

  const json = (await res.json()) as ApiResponse<T>

  // errors can be an array OR an object (e.g. rate-limit exceeded returns an object)
  const hasErrors = Array.isArray(json.errors)
    ? json.errors.length > 0
    : typeof json.errors === 'object' && Object.keys(json.errors).length > 0

  if (hasErrors) {
    logger.error('API-Football returned errors', { errors: json.errors, url })
    throw new Error(`API-Football errors: ${JSON.stringify(json.errors)}`)
  }

  return json.response ?? []
}

/**
 * Fetch all fixtures for a given date (YYYY-MM-DD).
 */
export async function getFixturesByDate(date: string): Promise<Fixture[]> {
  return apiFetch<Fixture>(`/fixtures?date=${date}&timezone=UTC`)
}

/**
 * Fetch team statistics for a given team/league/season.
 * Falls back to the previous season if no data is found for the requested one.
 * Returns null when no data is found.
 */
export async function getTeamStatistics(
  teamId: number,
  leagueId: number,
  season: number
): Promise<TeamStats | null> {
  try {
    const results = await apiFetch<TeamStats>(
      `/teams/statistics?team=${teamId}&league=${leagueId}&season=${season}`
    )
    return results[0] ?? null
  } catch {
    // Try one season earlier as a last resort
    if (season > 2022) {
      try {
        const results = await apiFetch<TeamStats>(
          `/teams/statistics?team=${teamId}&league=${leagueId}&season=${season - 1}`
        )
        return results[0] ?? null
      } catch {
        return null
      }
    }
    return null
  }
}

/**
 * Fetch last N head-to-head fixtures between two teams.
 * The free plan blocks the `last` query parameter — fetch all and slice locally.
 */
export async function getHeadToHead(
  homeTeamId: number,
  awayTeamId: number,
  last = 5
): Promise<H2HFixture[]> {
  try {
    const results = await apiFetch<H2HFixture>(
      `/fixtures/headtohead?h2h=${homeTeamId}-${awayTeamId}`
    )
    return results.slice(-last)
  } catch {
    return []
  }
}

/**
 * Fetch standings for a league+season.
 * Falls back to the previous season when the free plan blocks the requested one.
 */
export async function getStandings(
  leagueId: number,
  season: number
): Promise<Standing[]> {
  type StandingsWrapper = { league: { standings: Standing[][] } }

  async function fetch_standings(s: number): Promise<Standing[]> {
    const results = await apiFetch<StandingsWrapper>(`/standings?league=${leagueId}&season=${s}`)
    const wrapper = results[0]
    if (!wrapper?.league?.standings?.length) return []
    return wrapper.league.standings.flat()
  }

  try {
    return await fetch_standings(season)
  } catch {
    if (season > 2022) {
      try { return await fetch_standings(season - 1) } catch { return [] }
    }
    return []
  }
}

/**
 * Helper: find a team's standing entry from a flat list.
 */
export function findTeamStanding(standings: Standing[], teamId: number): Standing | null {
  return standings.find(s => s.team.id === teamId) ?? null
}
