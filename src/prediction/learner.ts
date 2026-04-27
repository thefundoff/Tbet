import { getSupabaseClient } from '../db/client'
import { loadActiveWeights, saveWeights, type FactorWeights } from '../db/weights'
import { logger } from '../utils/logger'
import {
  DEFAULT_WEIGHTS,
  LEARNING_TRIGGER_BATCH,
  MIN_LEARNING_SAMPLE,
  WEIGHT_MIN,
  WEIGHT_MAX,
  LEARNING_RATE,
  LEARNING_MIN_IMPROVEMENT,
} from '../utils/constants'

type FactorKey = 'form' | 'goalPerf' | 'h2h' | 'standing' | 'goalsAvg'
const FACTORS: FactorKey[] = ['form', 'goalPerf', 'h2h', 'standing', 'goalsAvg']

interface LearningRow {
  actual_winner: string
  factors: {
    home: Record<FactorKey, number>
    away: Record<FactorKey, number>
  }
}

// -------------------------------------------------------
// Core learning algorithm: Pearson correlation reweighting
// -------------------------------------------------------

function computeNewWeights(
  rows: LearningRow[],
  currentWeights: Omit<FactorWeights, 'version'>
): Omit<FactorWeights, 'version'> | null {
  // Only directional outcomes (home/away wins) can train 1X2 directional weights
  const decisive = rows.filter(r => r.actual_winner === 'home' || r.actual_winner === 'away')
  if (decisive.length < 20) return null

  const actuals   = decisive.map(r => r.actual_winner === 'home' ? 1 : -1)
  const meanActual = actuals.reduce((a, b) => a + b, 0) / actuals.length

  const correlations: Record<FactorKey, number> = {} as Record<FactorKey, number>

  for (const f of FACTORS) {
    const diffs   = decisive.map(r => r.factors.home[f] - r.factors.away[f])
    const meanDiff = diffs.reduce((a, b) => a + b, 0) / diffs.length

    let cov = 0, varDiff = 0, varActual = 0
    for (let i = 0; i < decisive.length; i++) {
      const da = diffs[i] - meanDiff
      const ac = actuals[i] - meanActual
      cov      += da * ac
      varDiff  += da * da
      varActual += ac * ac
    }
    const denom = Math.sqrt(varDiff * varActual)
    correlations[f] = denom < 1e-9 ? 0 : cov / denom
  }

  // Shift from [-1,+1] to [0,2], then normalize
  const shifted  = FACTORS.map(f => Math.max(0, correlations[f] + 1))
  const shiftSum = shifted.reduce((a, b) => a + b, 0)
  const normalized = shifted.map(s => shiftSum > 0 ? s / shiftSum : 1 / FACTORS.length)

  // Clip to [WEIGHT_MIN, WEIGHT_MAX] and re-normalize
  const clipped  = normalized.map(w => Math.min(WEIGHT_MAX, Math.max(WEIGHT_MIN, w)))
  const clipSum  = clipped.reduce((a, b) => a + b, 0)
  const clippedNorm = clipped.map(w => w / clipSum)

  // Blend with current weights to avoid catastrophic jumps
  const blended  = FACTORS.map((f, i) => LEARNING_RATE * clippedNorm[i] + (1 - LEARNING_RATE) * currentWeights[f])
  const blendSum = blended.reduce((a, b) => a + b, 0)
  const final    = blended.map(w => w / blendSum)

  return Object.fromEntries(FACTORS.map((f, i) => [f, final[i]])) as Omit<FactorWeights, 'version'>
}

// -------------------------------------------------------
// Accuracy simulation
// -------------------------------------------------------

function computeAccuracy(
  rows: LearningRow[],
  weights: Omit<FactorWeights, 'version'>
): number {
  if (!rows.length) return 0
  let correct = 0
  for (const row of rows) {
    const homeScore = FACTORS.reduce((s, f) => s + row.factors.home[f] * weights[f], 0)
    const awayScore = FACTORS.reduce((s, f) => s + row.factors.away[f] * weights[f], 0)
    const predicted = homeScore > awayScore ? 'home' : homeScore < awayScore ? 'away' : 'draw'
    if (predicted === row.actual_winner) correct++
  }
  return correct / rows.length
}

// -------------------------------------------------------
// Learning cycle
// -------------------------------------------------------

async function runLearningCycle(): Promise<void> {
  const db = getSupabaseClient()

  const currentWeights = await loadActiveWeights()
  const active = currentWeights ?? { ...DEFAULT_WEIGHTS, version: 0 }

  // Fetch resolved statistical predictions that have factor data
  const { data, error } = await db
    .from('predictions')
    .select('actual_winner, algorithm_inputs')
    .eq('prediction_source', 'statistical')
    .not('was_correct', 'is', null)
    .not('algorithm_inputs', 'is', null)

  if (error) {
    logger.warn('Learning: failed to fetch training rows', { error: error.message })
    return
  }

  // Filter to rows that have the factors sub-object (stored since this feature shipped)
  const rows: LearningRow[] = (data ?? [])
    .filter(r => r.algorithm_inputs?.factors)
    .map(r => ({
      actual_winner: r.actual_winner as string,
      factors:       r.algorithm_inputs.factors as LearningRow['factors'],
    }))

  if (rows.length < MIN_LEARNING_SAMPLE) {
    logger.info('Learning: not enough factor-annotated rows yet', { count: rows.length, needed: MIN_LEARNING_SAMPLE })
    return
  }

  const newWeights = computeNewWeights(rows, active)
  if (!newWeights) {
    logger.info('Learning: not enough decisive outcomes to compute weights')
    return
  }

  const baselineAccuracy = computeAccuracy(rows, active)
  const newAccuracy      = computeAccuracy(rows, newWeights)

  logger.info('Learning: accuracy comparison', {
    baseline:  +baselineAccuracy.toFixed(4),
    candidate: +newAccuracy.toFixed(4),
    newWeights,
  })

  if (newAccuracy < baselineAccuracy + LEARNING_MIN_IMPROVEMENT) {
    logger.info('Learning: new weights do not meet improvement threshold, keeping current')
    return
  }

  const nextVersion = (active.version ?? 0) + 1
  await saveWeights(newWeights, nextVersion, rows.length, newAccuracy, baselineAccuracy)
}

// -------------------------------------------------------
// Auto-trigger (called fire-and-forget from resolvePredictions)
// -------------------------------------------------------

export async function maybeRunLearning(newlyResolved: number): Promise<void> {
  if (newlyResolved < LEARNING_TRIGGER_BATCH) return

  const db = getSupabaseClient()
  const { count, error } = await db
    .from('predictions')
    .select('id', { count: 'exact', head: true })
    .eq('prediction_source', 'statistical')
    .not('was_correct', 'is', null)
    .not('algorithm_inputs', 'is', null)

  if (error) {
    logger.warn('Learning: count query failed', { error: error.message })
    return
  }

  if ((count ?? 0) < MIN_LEARNING_SAMPLE) {
    logger.info('Learning: total resolved count below minimum', { count, needed: MIN_LEARNING_SAMPLE })
    return
  }

  logger.info('Learning: trigger conditions met, running cycle', { newlyResolved, total: count })
  await runLearningCycle()
}
