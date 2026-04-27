export const DISCLAIMER =
  `⚠️ <i>These predictions are for entertainment purposes only and do not constitute financial or betting advice. Always gamble responsibly.</i>`

export const MAX_MATCHES_PER_MESSAGE = 8
export const PREDICTION_CACHE_HOURS = 12
export const API_CALL_DELAY_MS = 6000   // API-Football free tier: 10 req/min = 1 per 6s
export const TELEGRAM_SEND_DELAY_MS = 60 // ~16 msg/sec — well under Telegram's 30/sec global cap
export const MIN_PREDICTION_CONFIDENCE  = 45  // only surface predictions where we're ≥45% confident
export const SAFE_CONFIDENCE_THRESHOLD  = 65  // minimum confidence for the "safe games" filter
export const SAFE_GAME_COUNT            = 3   // maximum picks shown when safe games filter is active
