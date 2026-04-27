import { getSupabaseClient } from './client'
import { logger } from '../utils/logger'

export interface FactorWeights {
  form:      number
  goalPerf:  number
  h2h:       number
  standing:  number
  goalsAvg:  number
  version:   number
}

export async function loadActiveWeights(): Promise<FactorWeights | null> {
  const { data, error } = await getSupabaseClient()
    .from('prediction_weights')
    .select('weights, version')
    .eq('is_active', true)
    .maybeSingle()

  if (error) {
    logger.warn('loadActiveWeights failed', { error: error.message })
    return null
  }
  if (!data) return null

  return { ...(data.weights as Omit<FactorWeights, 'version'>), version: data.version }
}

export async function saveWeights(
  weights:          Omit<FactorWeights, 'version'>,
  version:          number,
  sampleSize:       number,
  accuracy:         number,
  baselineAccuracy: number,
): Promise<void> {
  const sum = Object.values(weights).reduce((a, b) => a + b, 0)
  if (Math.abs(sum - 1.0) > 0.001) {
    logger.error('Learning: weights do not sum to 1.0, aborting save', { sum, weights })
    return
  }

  const db = getSupabaseClient()
  await db.from('prediction_weights').update({ is_active: false }).eq('is_active', true)
  const { error } = await db.from('prediction_weights').insert({
    version,
    is_active:         true,
    weights,
    sample_size:       sampleSize,
    accuracy,
    baseline_accuracy: baselineAccuracy,
  })

  if (error) {
    logger.error('Learning: saveWeights insert failed', { error: error.message })
    return
  }

  logger.info('Learning: new weights saved', { version, accuracy, baselineAccuracy, weights })
}
