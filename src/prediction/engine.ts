import type { TeamStats, H2HFixture, Standing } from '../football/types'
import type { PredictionInput, PredictionResult } from './types'

// -------------------------------------------------------
// Helpers
// -------------------------------------------------------

/** Clamp a value between min and max */
function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value))
}

/** Parse a form string (e.g. "WWDLW") into a 0–1 score */
function parseFormScore(form: string): number {
  if (!form) return 0.5
  const recent = form.slice(-5)  // last 5 matches
  let pts = 0
  for (const ch of recent) {
    if (ch === 'W') pts += 3
    else if (ch === 'D') pts += 1
  }
  return pts / (recent.length * 3)  // normalised 0–1
}

/** Goals-per-game average from a string like "1.50" */
function parseGoalsAvg(avg: string | undefined | null): number {
  const n = parseFloat(avg ?? '0')
  return isNaN(n) ? 0 : n
}

/**
 * Returns the best available goals average:
 * 1. Venue-specific (home or away) — most accurate
 * 2. Overall total average — reliable fallback on free API tier
 * 3. Hard-coded league-typical default — last resort when API returns no data
 */
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

/** Factor A: Recent form (last 5) — weight 30% */
function factorForm(stats: TeamStats | null): number {
  if (!stats) return 0.5
  return parseFormScore(stats.form ?? '')
}

/** Factor B: Home/Away goal performance split — weight 25% */
function factorGoalPerformance(stats: TeamStats | null, isHome: boolean): number {
  if (!stats) return 0.5
  const goalsFor     = parseGoalsAvg(isHome ? stats.goals.for.average.home     : stats.goals.for.average.away)
  const goalsAgainst = parseGoalsAvg(isHome ? stats.goals.against.average.home : stats.goals.against.average.away)
  // Net goals per game, mapped to 0–1 (net -3 → 0, net 0 → 0.5, net +3 → 1)
  const net = clamp(goalsFor - goalsAgainst, -3, 3)
  return (net + 3) / 6
}

/** Factor C: Head-to-head record — weight 20% */
function factorH2H(h2h: H2HFixture[], teamId: number): number {
  if (!h2h.length) return 0.5
  const last5 = h2h.slice(-5)
  let wins = 0, draws = 0
  for (const f of last5) {
    const homeId   = f.teams.home.id
    const awayId   = f.teams.away.id
    const homeGoals = f.goals.home ?? 0
    const awayGoals = f.goals.away ?? 0
    if (homeGoals === awayGoals) { draws++; continue }
    const winnerId = homeGoals > awayGoals ? homeId : awayId
    if (winnerId === teamId) wins++
  }
  return (wins * 3 + draws) / (last5.length * 3)
}

/** Factor D: League standing position — weight 15% */
function factorStanding(standing: Standing | null, totalTeams = 20): number {
  if (!standing) return 0.5
  // rank 1 = best → score 1.0; rank N = worst → score 0
  return 1 - (standing.rank - 1) / (totalTeams - 1)
}

/** Factor E: Raw goals scored average — weight 10% */
function factorGoalsScored(stats: TeamStats | null): number {
  if (!stats) return 0.5
  const avg = parseGoalsAvg(stats.goals.for.average.total)
  // 0 goals → 0, 3+ goals → 1 (linear)
  return clamp(avg / 3)
}

// -------------------------------------------------------
// 1X2 prediction
// -------------------------------------------------------

function score1X2(input: PredictionInput): { homeScore: number; awayScore: number } {
  const { homeStats, awayStats, h2h, homeStanding, awayStanding, fixture } = input
  const homeId = fixture.teams.home.id
  const awayId = fixture.teams.away.id

  const homeScore =
    factorForm(homeStats)                            * 0.30 +
    factorGoalPerformance(homeStats, true)           * 0.25 +
    factorH2H(h2h, homeId)                          * 0.20 +
    factorStanding(homeStanding)                     * 0.15 +
    factorGoalsScored(homeStats)                     * 0.10

  const awayScore =
    factorForm(awayStats)                            * 0.30 +
    factorGoalPerformance(awayStats, false)          * 0.25 +
    factorH2H(h2h, awayId)                          * 0.20 +
    factorStanding(awayStanding)                     * 0.15 +
    factorGoalsScored(awayStats)                     * 0.10

  return { homeScore, awayScore }
}

// -------------------------------------------------------
// Over/Under 2.5 prediction
// -------------------------------------------------------

function predictOverUnder(
  homeStats: TeamStats | null,
  awayStats: TeamStats | null
): { prediction: 'over' | 'under'; confidence: number } {
  // Attack rates — venue-specific first, fall back to total, then league averages
  const homeScored   = bestAvg(homeStats?.goals.for.average.home,    homeStats?.goals.for.average.total,    1.4)
  const awayScored   = bestAvg(awayStats?.goals.for.average.away,    awayStats?.goals.for.average.total,    1.1)

  // Defence leakage — if a team concedes a lot, more goals are expected against them
  const homeConceded = bestAvg(homeStats?.goals.against.average.home, homeStats?.goals.against.average.total, 1.2)
  const awayConceded = bestAvg(awayStats?.goals.against.average.away,  awayStats?.goals.against.average.total, 1.3)

  // Expected goals for each side = average of their own attack and the opponent's defensive leakage
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

  // Both must show attacking intent AND defensive weakness
  const homeAttacks = clamp(homeScoringRate   / 2)   // 2 goals avg → 1.0
  const awayAttacks = clamp(awayScoringRate   / 2)
  const homeLeaks   = clamp(homeConcedingRate / 2)
  const awayLeaks   = clamp(awayConcedingRate / 2)

  // Home scores if they attack AND away leaks; away scores if they attack AND home leaks
  const homeScoreProb = (homeAttacks + awayLeaks)   / 2
  const awayScoreProb = (awayAttacks + homeLeaks)   / 2
  const bttsProb      = homeScoreProb * awayScoreProb

  const prediction = bttsProb >= 0.25   // geometric mean threshold
  const confidence = clamp(Math.round(bttsProb * 150))   // scale to 0–100

  return { prediction, confidence }
}

// -------------------------------------------------------
// Main export
// -------------------------------------------------------

export function generatePrediction(input: PredictionInput): PredictionResult {
  const { homeStats, awayStats, h2h } = input

  // 1X2
  const { homeScore, awayScore } = score1X2(input)
  const total = homeScore + awayScore || 1
  const strengthRatio = homeScore / total          // 0–1 (0.5 = evenly matched)
  const gap = Math.abs(strengthRatio - 0.5) * 2   // 0–1 (0 = even, 1 = total mismatch)

  // Draw probability: highest when teams are evenly matched, lowest when there's a big gap
  const drawProb  = clamp(0.28 - gap * 0.18, 0, 1)
  const homeProb  = strengthRatio * (1 - drawProb)
  const awayProb  = (1 - strengthRatio) * (1 - drawProb)

  const homeProbability = Math.round(homeProb * 100)
  const drawProbability = Math.round(drawProb * 100)
  const awayProbability = 100 - homeProbability - drawProbability  // ensures sum = 100

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
