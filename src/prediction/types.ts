import type { Fixture, TeamStats, H2HFixture, Standing } from '../football/types'

export interface PredictionInput {
  fixture: Fixture
  homeStats: TeamStats | null
  awayStats: TeamStats | null
  h2h: H2HFixture[]
  homeStanding: Standing | null
  awayStanding: Standing | null
}

export interface PredictionResult {
  predictedWinner: 'home' | 'draw' | 'away'
  winnerConfidence: number          // 0 – 100
  homeProbability: number           // % chance home team wins
  drawProbability: number           // % chance of draw
  awayProbability: number           // % chance away team wins
  predictionSource: 'market' | 'statistical'
  overUnderPrediction: 'over' | 'under'
  overUnderConfidence: number
  bttsPrediction: boolean
  bttsConfidence: number
  algorithmInputs: Record<string, unknown>
}
