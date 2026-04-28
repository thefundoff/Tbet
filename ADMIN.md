# Tbet — Admin Command Reference

These commands are only available to the Telegram account whose ID is set in the `ADMIN_TELEGRAM_ID` environment variable on Vercel. They are invisible to regular users and do not appear in the bot's command menu.

---

## `/adminstats`

Shows a live snapshot of your users and revenue.

**Usage:**
```
/adminstats
```

**What it shows:**
- Total registered users vs active subscribers vs free users
- Breakdown of active plans (Daily / Weekly / Monthly) with user counts
- Revenue value of all currently active subscriptions
- Total referral credits outstanding across all users

> Revenue reflects the value of *active* subscriptions, not lifetime earnings (no payment history table exists).

---

## `/broadcast <message>`

Sends a message to every subscribed user at once. Supports HTML formatting.

**Usage:**
```
/broadcast Your plain text message here
```

```
/broadcast ⚠️ <b>Notice</b>

Predictions will be delayed until 1am tonight. No extra charge.
```

**HTML tags you can use:**
| Tag | Result |
|-----|--------|
| `<b>text</b>` | **bold** |
| `<i>text</i>` | *italic* |
| `<code>text</code>` | monospace |
| `<s>text</s>` | ~~strikethrough~~ |

The bot reports back how many messages were sent and how many failed (e.g. users who blocked the bot).

---

## `/gencode [daily|weekly|monthly] [count]`

Generates single-use promo codes that give free plan access. Useful for promotions, influencers, or compensating users manually.

**Usage:**
```
/gencode daily 1        — one free daily code  (₦500 value)
/gencode weekly 5       — five free weekly codes  (₦2,500 value each)
/gencode monthly 1      — one free monthly code  (₦8,000 value)
```

- Count can be 1–50 per command
- Each code looks like: `TBET-A3K9-M2X7`
- Users redeem codes with: `/redeem TBET-A3K9-M2X7`
- Each code is single-use — once redeemed it cannot be used again
- Codes stack on top of any existing active plan

---

## `/refreshpredictions`

Clears today's cached predictions from the database. Use this whenever you change prediction settings (match limits, confidence thresholds, etc.) mid-day and want users to immediately get fresh predictions instead of waiting up to 12 hours for the cache to expire.

**Usage:**
```
/refreshpredictions
```

**What it does:**
- Deletes all rows in the `predictions` table where `match_date = today`
- The next user to run `/predict` triggers a fresh build using the current configuration
- Safe to run at any time — it only affects today's cache, not historical data

---

## System Changes Log

### April 2026 Update
- **Matches coverage expanded:** `MAJOR_LEAGUE_IDS` now covers 50+ leagues across Europe, South America, North America, Africa, Asia, and the Middle East (was ~20 European-only leagues)
- **API plan upgraded to Pro:** `API_CALL_DELAY_MS` reduced from 6000ms → 200ms; `MAX_FIXTURES_PER_BUILD` raised from 3 → 20
- **Plan pick limits increased:**
  - Daily: 2 → 4 picks/day
  - Weekly: 4 → 7 picks/day
  - Monthly: 6 → 11 picks/day
- **League priority ordering added:** Fixtures are now sorted by `LEAGUE_PRIORITY` before processing, ensuring UEFA and European top flights (with the best API-Football data coverage) fill the build slots first
- **Over/Under & BTTS always shown:** Removed the `hasStatsData` gate in the formatter — the engine always produces valid O/U and BTTS values using fallback league averages, so suppressing them was incorrect
- **`/refreshpredictions` command added:** Admin command to bust the prediction cache mid-day

---

## Deployment Cheatsheet

Every time you make a code change, deploy with:
```
vercel --prod
```

To register updated bot commands with Telegram after adding new `/commands`:
```
vercel --prod
```
(The webhook handler calls `setMyCommands` on every cold start.)

---

## Environment Variables (Vercel)

| Variable | Purpose |
|----------|---------|
| `TELEGRAM_BOT_TOKEN` | Bot token from @BotFather |
| `ADMIN_TELEGRAM_ID` | Your personal Telegram user ID — grants access to admin commands |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key |
| `FLW_SECRET_KEY` | Flutterwave secret key (live) |
| `FLW_SECRET_HASH` | Flutterwave webhook verification hash |
| `VERCEL_URL` | Your Vercel deployment domain (e.g. `tbet.vercel.app`) |
| `TELEGRAM_CHANNEL_URL` | Your Telegram channel link shown to users |
| `ODDS_API_KEY` | The Odds API key for market odds |
| `RAPIDAPI_KEY` | RapidAPI key for API-Football |

> To find your Telegram user ID, message **@userinfobot** on Telegram.
