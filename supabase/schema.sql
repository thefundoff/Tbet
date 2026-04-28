-- ============================================================
-- Run this once in your Supabase project's SQL editor
-- ============================================================

-- ============================================================
-- Table: users
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id              BIGINT PRIMARY KEY,        -- Telegram user_id (not serial)
  username        TEXT,
  first_name      TEXT,
  last_name       TEXT,
  is_subscribed   BOOLEAN NOT NULL DEFAULT FALSE,
  subscribed_at   TIMESTAMPTZ,
  unsubscribed_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_is_subscribed
  ON users(is_subscribed)
  WHERE is_subscribed = TRUE;

-- ============================================================
-- Table: predictions (per-fixture cache)
-- ============================================================
CREATE TABLE IF NOT EXISTS predictions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fixture_id            INTEGER NOT NULL,
  match_date            DATE NOT NULL,
  home_team             TEXT NOT NULL,
  away_team             TEXT NOT NULL,
  league_name           TEXT NOT NULL,
  league_id             INTEGER NOT NULL,
  match_time            TEXT,                            -- 'HH:MM UTC'

  -- 1X2
  predicted_winner      TEXT NOT NULL,                  -- 'home' | 'draw' | 'away'
  winner_confidence     NUMERIC(5,2) NOT NULL,          -- 0.00 – 100.00
  home_probability      NUMERIC(5,2),
  draw_probability      NUMERIC(5,2),
  away_probability      NUMERIC(5,2),
  prediction_source     TEXT,                           -- 'market' | 'statistical'
  stat_home_probability NUMERIC(5,2),
  stat_draw_probability NUMERIC(5,2),
  stat_away_probability NUMERIC(5,2),
  value_bet             TEXT,                           -- 'home' | 'draw' | 'away' | null
  value_edge            INTEGER,

  -- Resolution
  actual_winner         TEXT,                           -- 'home' | 'draw' | 'away' | null
  was_correct           BOOLEAN,
  resolved_at           TIMESTAMPTZ,

  -- Over/Under 2.5
  over_under_prediction TEXT NOT NULL,                  -- 'over' | 'under'
  over_under_confidence NUMERIC(5,2) NOT NULL,

  -- BTTS
  btts_prediction       BOOLEAN NOT NULL,
  btts_confidence       NUMERIC(5,2) NOT NULL,

  -- Raw inputs stored for debugging / replay
  algorithm_inputs      JSONB,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_prediction_fixture UNIQUE (fixture_id, match_date)
);

CREATE INDEX IF NOT EXISTS idx_predictions_match_date ON predictions(match_date);
CREATE INDEX IF NOT EXISTS idx_predictions_league_id  ON predictions(league_id);

-- ============================================================
-- auto-update updated_at on any row change
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER trg_predictions_updated_at
  BEFORE UPDATE ON predictions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
