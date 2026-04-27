import type { TeamStats, H2HFixture, Standing } from '../football/types'
import type { PredictionInput, PredictionResult } from './types'
import { loadActiveWeights, type FactorWeights } from '../db/weights'
import { DEFAULT_WEIGHTS } from '../utils/constants'

// -------------------------------------------------------
// Module-level weight cache (warm lambda reuse ~5 min)
// -------------------------------------------------------

let _cachedWeights: FactorWeights | null = null
let _cacheLoadedAt = 0
const WEIGHT_CACHE_MS = 5 * 60 * 1000

async function getWeights(): Promise<FactorWeights> {
  if (_cachedWeights && Date.now() - _cacheLoadedAt < WEIGHT_CACHE_MS) return _cachedWeights
  _cachedWeights = (await loadActiveWeights()) ?? { ...DEFAULT_WEIGHTS, version: 0 }
  _cacheLoadedAt = Date.now()
  return _cachedWeights
}

// -------------------------------------------------------
// Helpers
// -------------------------------------------------------

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value))
}

function parseFormScore(form: string): number {
  if (!form) return 0.5
  const recent = form.slice(-5)
  let pts = 0
  for (const ch of recent) {
    if (ch === 'W') pts += 3
    else if (ch === 'D') pts += 1
  }
  return pts / (recent.length * 3)
}

function parseGoalsAvg(avg: string | undefined | null): number {
  const n = parseFloat(avg ?? '0')
  return isNaN(n) ? 0 : n
}

function bestAvg(
  venueSpecific: string | undefined | null,
  total: string | undefined | null,
  defaultVal: number
): number {
  const v = parseGoalsAvg(venueSpecific)
  if (v > 0) return v
  const t = parseGoalsAvg(total)
  if (t > 0) return t
  return defaultVal
}

// -------------------------------------------------------
// Scoring factors (each returns 0–1)
// -------------------------------------------------------

function factorForm(stats: TeamStats | null): number {
  if (!stats) return 0.5
  return parseFormScore(stats.form ?? '')
}

function factorGoalPerformance(stats: TeamStats | null, isHome: boolean): number {
  if (!stats) return 0.5
  const goalsFor     = parseGoalsAvg(isHome ? stats.goals.for.average.home     : stats.goals.for.average.away)
  const goalsAgainst = parseGoalsAvg(isHome ? stats.goals.against.average.home : stats.goals.against.average.away)
  const net = clamp(goalsFor - goalsAgainst, -3, 3)
  return (net + 3) / 6
}

function factorH2H(h2h: H2HFixture[], teamId: number): number {
  if (!h2h.length) return 0.5
  const last5 = h2h.slice(-5)
  let wins = 0, draws = 0
  for (const f of last5) {
    const homeId    = f.teams.home.id
    const awayId    = f.teams.away.id
    const homeGoals = f.goals.home ?? 0
    const awayGoals = f.goals.away ?? 0
    if (homeGoals === awayGoals) { draws++; continue }
    const winnerId = homeGoals > awayGoals ? homeId : awayId
    if (winnerId === teamId) wins++
  }
  return (wins * 3 + draws) / (last5.length * 3)
}

function factorStanding(standing: Standing | null, totalTeams = 20): number {
  if (!standing) return 0.5
  return 1 - (standing.rank - 1) / (totalTeams - 1)
}

function factorGoalsScored(stats: TeamStats | null): number {
  if (!stats) return 0.5
  const avg = parseGoalsAvg(stats.goals.for.average.total)
  return clamp(avg / 3)
}

// -------------------------------------------------------
// Individual factor scores (raw, before weights applied)
// -------------------------------------------------------

interface TeamFactorScores {
  form:      number
  goalPerf:  number
  h2h:       number
  standing:  number
  goalsAvg:  number
}

function scoreFactors(input: PredictionInput): { home: TeamFactorScores; away: TeamFactorScores } {
  const { homeStats, awayStats, h2h, homeStanding, awayStanding, fixture } = input
  const homeId = fixture.teams.home.id
  const awayId = fixture.teams.away.id

  return {
    home: {
      form:      factorForm(homeStats),
      goalPerf:  factorGoalPerformance(homeStats, true),
      h2h:       factorH2H(h2h, homeId),
      standing:  factorStanding(homeStanding ?? null),
      goalsAvg:  factorGoalsScored(homeStats),
    },
    away: {
      form:      factorForm(awayStats),
      goalPerf:  factorGoalPerformance(awayStats, false),
      h2h:       factorH2H(h2h, awayId),
      standing:  factorStanding(awayStanding ?? null),
      goalsAvg:  factorGoalsScored(awayStats),
    },
  }
}

// -------------------------------------------------------
// 1X2 prediction
// -------------------------------------------------------

function score1X2(
  factors: ReturnType<typeof scoreFactors>,
  weights: FactorWeights
): { homeScore: number; awayScore: number } {
  const homeScore =
    factors.home.form     * weights.form     +
    factors.home.goalPerf * weights.goalPerf +
    factors.home.h2h      * weights.h2h      +
    factors.home.standing * weights.standing +
    factors.home.goalsAvg * weights.goalsAvg

  const awayScore =
    factors.away.form     * weights.form     +
    factors.away.goalPerf * weights.goalPerf +
    factors.away.h2h      * weights.h2h      +
    factors.away.standing * weights.standing +
    factors.away.goalsAvg * weights.goalsAvg

  return { homeScore, awayScore }
}

// -------------------------------------------------------
// Over/Under 2.5 prediction
// -------------------------------------------------------

function predictOverUnder(
  homeStats: TeamStats | null,
  awayStats: TeamStats | null
): { prediction: 'over' | 'under'; confidence: number } {
  const homeScored   = bestAvg(homeStats?.goals.for.average.home,    homeStats?.goals.for.average.total,    1.4)
  const awayScored   = bestAvg(awayStats?.goals.for.average.away,    awayStats?.goals.for.average.total,    1.1)
  const homeConceded = bestAvg(homeStats?.goals.against.average.home, homeStats?.goals.against.average.total, 1.2)
  const awayConceded = bestAvg(awayStats?.goals.against.average.away,  awayStats?.goals.against.average.total, 1.3)

  const homeExpected = (homeScored + awayConceded) / 2
  const awayExpected = (awayScored + homeConceded) / 2
  const expectedGoals = homeExpected + awayExpected

  const distance   = Math.abs(expectedGoals - 2.5)
  const confidence = clamp(50 + (distance / 1.5) * 50)

  return {
    prediction: expectedGoals >= 2.5 ? 'over' : 'under',
    confidence: Math.round(confidence),
  }
}

// -------------------------------------------------------
// BTTS prediction
// -------------------------------------------------------

function predictBTTS(
  homeStats: TeamStats | null,
  awayStats: TeamStats | null
): { prediction: boolean; confidence: number } {
  const homeScoringRate   = bestAvg(homeStats?.goals.for.average.home,    homeStats?.goals.for.average.total,    1.4)
  const awayScoringRate   = bestAvg(awayStats?.goals.for.average.away,    awayStats?.goals.for.average.total,    1.1)
  const homeConcedingRate = bestAvg(homeStats?.goals.against.average.home, homeStats?.goals.against.average.total, 1.2)
  const awayConcedingRate = bestAvg(awayStats?.goals.against.average.away,  awayStats?.goals.against.average.total, 1.3)

  const homeAttacks = clamp(homeScoringRate   / 2)
  const awayAttacks = clamp(awayScoringRate   / 2)
  const homeLeaks   = clamp(homeConcedingRate / 2)
  const awayLeaks   = clamp(awayConcedingRate / 2)

  const homeScoreProb = (homeAttacks + awayLeaks)   / 2
  const awayScoreProb = (awayAttacks + homeLeaks)   / 2
  const bttsProb      = homeScoreProb * awayScoreProb

  const prediction = bttsProb >= 0.25
  const confidence = clamp(Math.round(bttsProb * 150))

  return { prediction, confidence }
}

// -------------------------------------------------------
// Main export
// -------------------------------------------------------

export async function generatePrediction(input: PredictionInput): Promise<PredictionResult> {
  const { homeStats, awayStats, h2h } = input

  const weights = await getWeights()
  const factors = scoreFactors(input)

  // 1X2
  const { homeScore, awayScore } = score1X2(factors, weights)
  const total = homeScore + awayScore || 1
  const strengthRatio = homeScore / total
  const gap = Math.abs(strengthRatio - 0.5) * 2

  const drawProb  = clamp(0.28 - gap * 0.18, 0, 1)
  const homeProb  = strengthRatio * (1 - drawProb)
  const awayProb  = (1 - strengthRatio) * (1 - drawProb)

  const homeProbability = Math.round(homeProb * 100)
  const drawProbability = Math.round(drawProb * 100)
  const awayProbability = 100 - homeProbability - drawProbability

  let predictedWinner: 'home' | 'draw' | 'away'
  let winnerConfidence: number

  if (drawProbability >= homeProbability && drawProbability >= awayProbability) {
    predictedWinner  = 'draw'
    winnerConfidence = drawProbability
  } else if (homeProbability >= awayProbability) {
    predictedWinner  = 'home'
    winnerConfidence = homeProbability
  } else {
    predictedWinner  = 'away'
    winnerConfidence = awayProbability
  }

  // Over/Under
  const { prediction: ouPrediction, confidence: ouConfidence } = predictOverUnder(homeStats, awayStats)

  // BTTS
  const { prediction: bttsPrediction, confidence: bttsConfidence } = predictBTTS(homeStats, awayStats)

  const algorithmInputs = {
    homeScore: +homeScore.toFixed(4),
    awayScore: +awayScore.toFixed(4),
    gap:       +gap.toFixed(2),
    h2hCount:  h2h.length,
    homeForm:  homeStats?.form ?? null,
    awayForm:  awayStats?.form ?? null,
    factors,
    weightsVersion: weights.version,
  }

  return {
    predictedWinner,
    winnerConfidence,
    homeProbability,
    drawProbability,
    awayProbability,
    predictionSource: 'statistical' as const,
    overUnderPrediction: ouPrediction,
    overUnderConfidence: ouConfidence,
    bttsPrediction,
    bttsConfidence,
    algorithmInputs,
  }
}
