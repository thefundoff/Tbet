import type { VercelRequest, VercelResponse } from '@vercel/node'
import { Bot } from 'grammy'
import { getSubscribedUsers } from '../../src/db/users'
import { formatPredictionChunks } from '../../src/prediction/formatter'
import { buildPredictions } from '../../src/bot/commands/predict'
import { logger } from '../../src/utils/logger'
import { TELEGRAM_SEND_DELAY_MS } from '../../src/utils/constants'

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = req.headers['authorization']
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    logger.warn('Cron: unauthorized request')
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  const today = new Date().toISOString().split('T')[0]
  logger.info('Cron: starting daily predictions broadcast', { date: today })

  let predictionsGenerated = 0
  let messagesSent = 0
  let errorCount = 0

  try {
    // Build (or read from cache) all predictions for today
    const predictions = await buildPredictions(today)
    predictionsGenerated = predictions.length
    logger.info('Cron: predictions ready', { count: predictionsGenerated })

    if (!predictionsGenerated) {
      logger.info('Cron: no predictions to send today')
      res.status(200).json({ ok: true, predictions: 0, sent: 0, date: today })
      return
    }

    const chunks = formatPredictionChunks(predictions, today)

    // Fetch all subscribed users
    const subscribers = await getSubscribedUsers()
    logger.info('Cron: broadcasting to subscribers', { count: subscribers.length })

    const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN!)

    for (const user of subscribers) {
      for (const chunk of chunks) {
        try {
          await bot.api.sendMessage(user.id, chunk, { parse_mode: 'HTML' })
          messagesSent++
          await sleep(TELEGRAM_SEND_DELAY_MS)
        } catch (err) {
          errorCount++
          // One failing user (blocked bot, deactivated account) must not halt the broadcast
          logger.warn('Cron: failed to send to user', {
            userId: user.id,
            error: String(err),
          })
        }
      }
    }

    logger.info('Cron: broadcast complete', { messagesSent, errorCount, date: today })
    res.status(200).json({
      ok: true,
      date: today,
      predictions: predictionsGenerated,
      subscribers: subscribers.length,
      messagesSent,
      errorCount,
    })
  } catch (err) {
    logger.error('Cron: fatal error', { error: String(err) })
    res.status(500).json({ error: 'Internal server error' })
  }
}
