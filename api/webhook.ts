import type { VercelRequest, VercelResponse } from '@vercel/node'

import { createBot } from '../src/bot/index'
import { logger } from '../src/utils/logger'

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  // Only accept POST requests
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  try {
    const bot = createBot()
    // Parse the update from Telegram and process it
    const update = req.body
    await bot.handleUpdate(update)
    res.status(200).json({ ok: true })
  } catch (err) {
    // Always return 200 to Telegram even on errors — otherwise Telegram will retry
    // the same update repeatedly (retry storm)
    logger.error('Webhook handler error', { error: String(err) })
    res.status(200).json({ ok: true })
  }
}
