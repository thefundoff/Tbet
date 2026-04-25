/**
 * One-time script to register the Telegram webhook URL.
 * Run after first deployment: npx ts-node scripts/setupWebhook.ts
 *
 * Requires .env to be populated (or env vars to be set in your shell).
 */

// Load .env if present
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('dotenv').config()
} catch {
  // dotenv is optional — env vars may already be set in shell
}

async function main(): Promise<void> {
  const token   = process.env.TELEGRAM_BOT_TOKEN
  const secret  = process.env.TELEGRAM_WEBHOOK_SECRET
  const domain  = process.env.VERCEL_URL

  if (!token)  throw new Error('TELEGRAM_BOT_TOKEN is not set')
  if (!secret) throw new Error('TELEGRAM_WEBHOOK_SECRET is not set')
  if (!domain) throw new Error('VERCEL_URL is not set (e.g. tbet.vercel.app)')

  const webhookUrl = `https://${domain}/api/webhook`

  console.log(`Setting webhook to: ${webhookUrl}`)

  const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url:             webhookUrl,
      secret_token:    secret,
      allowed_updates: ['message', 'callback_query'],
    }),
  })

  const json = await res.json() as { ok: boolean; description?: string }
  console.log('Telegram response:', JSON.stringify(json, null, 2))

  if (!json.ok) {
    process.exit(1)
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
