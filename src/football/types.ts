// -------------------------------------------------------
// API-Football v3 response shapes (only fields we use)
// -------------------------------------------------------

export interface FixtureStatus {
  long: string
  short: string
  elapsed: number | null
}

export interface FixtureVenue {
  id: number | null
  name: string | null
  city: string | null
}

export interface FixtureInfo {
  id: number
  date: string        // ISO 8601
  timestamp: number
  status: FixtureStatus
  venue: FixtureVenue
}

export interface Team {
  id: number
  name: string
  logo: string
}

export interface LeagueInfo {
  id: number
  name: string
  country: string
  logo: string
  season: number
  round: string
}

export interface Goals {
  home: number | null
  away: number | null
}

export interface Fixture {
  fixture: FixtureInfo
  league: LeagueInfo
  teams: {
    home: Team & { winner: boolean | null }
    away: Team & { winner: boolean | null }
  }
  goals: Goals
}

// -------------------------------------------------------
// Team statistics
// -------------------------------------------------------

export interface GoalsStat {
  total: {
    home: number
    away: number
    total: number
  }
  average: {
    home: string    // e.g. "1.5"
    away: string
    total: string
  }
}

export interface FormStat {
  played: { home: number; away: number; total: number }
  wins:   { home: number; away: number; total: number }
  draws:  { home: number; away: number; total: number }
  loses:  { home: number; away: number; total: number }
}

export interface TeamStats {
  team: Team
  league: { id: number; name: string; season: number }
  form: string           // e.g. "WWDLW"
  fixtures: FormStat
  goals: {
    for:     GoalsStat
    against: GoalsStat
  }
}

// -------------------------------------------------------
// Head-to-head
// -------------------------------------------------------

export interface H2HFixture extends Fixture {}

// -------------------------------------------------------
// Standings
// -------------------------------------------------------

export interface StandingEntry {
  rank: number
  team: Team
  points: number
  goalsDiff: number
  group: string
  form: string
  description: string | null
  all: FormStat
  home: FormStat
  away: FormStat
}

export type Standing = StandingEntry

// -------------------------------------------------------
// API wrapper response shape
// -------------------------------------------------------

export interface ApiResponse<T> {
  results: number
  response: T[]
  errors: Record<string, string> | string[]
}
