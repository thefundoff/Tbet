import { getSupabaseClient } from './client'
import { logger } from '../utils/logger'
import type { Fixture } from '../football/types'

export interface PredictionRow {
  id: string
  fixture_id: number
  match_date: string
  home_team: string
  away_team: string
  league_name: string
  league_id: number
  match_time: string | null
  predicted_winner: 'home' | 'draw' | 'away'
  winner_confidence: number
  home_probability: number
  draw_probability: number
  away_probability: number
  prediction_source: 'market' | 'statistical'
  stat_home_probability: number
  stat_draw_probability: number
  stat_away_probability: number
  value_bet: 'home' | 'draw' | 'away' | null
  value_edge: number | null
  over_under_prediction: 'over' | 'under'
  over_under_confidence: number
  btts_prediction: boolean
  btts_confidence: number
  algorithm_inputs: Record<string, unknown> | null
  actual_winner: 'home' | 'draw' | 'away' | null
  was_correct: boolean | null
  resolved_at: string | null
  created_at: string
  updated_at: string
}

export type PredictionInsert = Omit<PredictionRow, 'id' | 'created_at' | 'updated_at'>

export async function getPredictionsByDate(date: string): Promise<PredictionRow[]> {
  const db = getSupabaseClient()
  const { data, error } = await db
    .from('predictions')
    .select('*')
    .eq('match_date', date)
    .order('league_name', { ascending: true })

  if (error) {
    logger.error('getPredictionsByDate failed', { date, error: error.message })
    return []
  }
  return (data ?? []) as PredictionRow[]
}

export async function upsertPrediction(prediction: PredictionInsert): Promise<void> {
  const db = getSupabaseClient()
  const { error } = await db.from('predictions').upsert(prediction, {
    onConflict: 'fixture_id,match_date',
    ignoreDuplicates: false,
  })
  if (error) {
    logger.error('upsertPrediction failed', {
      fixtureId: prediction.fixture_id,
      error: error.message,
    })
    throw error
  }
}

export async function getPredictionByFixtureId(
  fixtureId: number,
  date: string
): Promise<PredictionRow | null> {
  const db = getSupabaseClient()
  const { data, error } = await db
    .from('predictions')
    .select('*')
    .eq('fixture_id', fixtureId)
    .eq('match_date', date)
    .maybeSingle()

  if (error) {
    logger.error('getPredictionByFixtureId failed', { fixtureId, error: error.message })
    return null
  }
  return data as PredictionRow | null
}

/**
 * Resolve predictions for a date using actual completed fixture results.
 * Returns the number of predictions resolved.
 */
export async function resolvePredictions(
  date: string,
  completedFixtures: Fixture[]
): Promise<number> {
  const db = getSupabaseClient()

  const { data, error } = await db
    .from('predictions')
    .select('id, fixture_id, predicted_winner')
    .eq('match_date', date)
    .is('was_correct', null)

  if (error) {
    logger.error('resolvePredictions: fetch failed', { date, error: error.message })
    return 0
  }

  const unresolved = (data ?? []) as Pick<PredictionRow, 'id' | 'fixture_id' | 'predicted_winner'>[]
  let resolved = 0

  for (const pred of unresolved) {
    const fixture = completedFixtures.find(f => f.fixture.id === pred.fixture_id)
    if (!fixture) continue

    const homeGoals = fixture.goals.home ?? 0
    const awayGoals = fixture.goals.away ?? 0
    const actualWinner: 'home' | 'draw' | 'away' =
      homeGoals > awayGoals ? 'home' : homeGoals < awayGoals ? 'away' : 'draw'

    const { error: updateError } = await db
      .from('predictions')
      .update({
        actual_winner: actualWinner,
        was_correct:   actualWinner === pred.predicted_winner,
        resolved_at:   new Date().toISOString(),
      })
      .eq('id', pred.id)

    if (updateError) {
      logger.warn('resolvePredictions: update failed', { id: pred.id, error: updateError.message })
    } else {
      resolved++
    }
  }

  if (resolved > 0) {
    logger.info('Predictions resolved', { date, resolved })
    // Dynamic import avoids circular dependency: predictions ← learner ← weights ← client
    import('../prediction/learner').then(({ maybeRunLearning }) =>
      maybeRunLearning(resolved).catch(err =>
        logger.warn('maybeRunLearning failed silently', { error: String(err) })
      )
    ).catch(() => { /* ignore import errors */ })
  }
  return resolved
}

export interface AccuracyStats {
  total: number
  correct: number
  byOutcome: Record<'home' | 'draw' | 'away', { total: number; correct: number }>
  bySource:  Record<'market' | 'statistical', { total: number; correct: number }>
  last30:    { total: number; correct: number }
}

export async function getAccuracyStats(): Promise<AccuracyStats> {
  const db = getSupabaseClient()
  const { data, error } = await db
    .from('predictions')
    .select('predicted_winner, was_correct, prediction_source, resolved_at')
    .not('was_correct', 'is', null)

  if (error) {
    logger.error('getAccuracyStats failed', { error: error.message })
    throw error
  }

  const rows = (data ?? []) as Pick<
    PredictionRow,
    'predicted_winner' | 'was_correct' | 'prediction_source' | 'resolved_at'
  >[]

  const byOutcome: AccuracyStats['byOutcome'] = {
    home: { total: 0, correct: 0 },
    draw: { total: 0, correct: 0 },
    away: { total: 0, correct: 0 },
  }
  const bySource: AccuracyStats['bySource'] = {
    market:      { total: 0, correct: 0 },
    statistical: { total: 0, correct: 0 },
  }

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 30)
  let last30Total = 0, last30Correct = 0

  for (const row of rows) {
    byOutcome[row.predicted_winner].total++
    if (row.was_correct) byOutcome[row.predicted_winner].correct++

    bySource[row.prediction_source].total++
    if (row.was_correct) bySource[row.prediction_source].correct++

    if (row.resolved_at && new Date(row.resolved_at) >= cutoff) {
      last30Total++
      if (row.was_correct) last30Correct++
    }
  }

  return {
    total:   rows.length,
    correct: rows.filter(r => r.was_correct).length,
    byOutcome,
    bySource,
    last30: { total: last30Total, correct: last30Correct },
  }
}
