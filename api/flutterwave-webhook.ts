import type { VercelRequest, VercelResponse } from '@vercel/node'
import { Bot } from 'grammy'
import { getUserById, setUserPlan, setSubscription } from '../src/db/users'
import { PLANS, getActivePlanTier } from '../src/utils/plans'
import type { PlanTier } from '../src/utils/plans'
import { logger } from '../src/utils/logger'

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  // Flutterwave sends the secret hash you configure in their dashboard
  const secretHash = process.env.FLW_SECRET_HASH
  const incoming   = req.headers['verif-hash']
  if (!secretHash || incoming !== secretHash) {
    logger.warn('Flutterwave webhook: invalid or missing verif-hash')
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  const event = req.body?.event
  const data  = req.body?.data

  // Only process successful charge events
  if (event !== 'charge.completed' || data?.status !== 'successful') {
    res.status(200).json({ received: true })
    return
  }

  const transactionId: number = data.id
  const txRef: string         = data.tx_ref ?? ''

  // tx_ref format: tbet-{userId}-{tier}-{timestamp}
  const parts = txRef.split('-')
  if (parts.length < 4 || parts[0] !== 'tbet') {
    logger.warn('Flutterwave webhook: unrecognised tx_ref', { txRef })
    res.status(200).json({ received: true })
    return
  }

  const userId = parseInt(parts[1], 10)
  const tier   = parts[2] as Exclude<PlanTier, 'free'>

  if (isNaN(userId) || !['daily', 'weekly', 'monthly'].includes(tier)) {
    logger.warn('Flutterwave webhook: invalid userId or tier in tx_ref', { txRef })
    res.status(200).json({ received: true })
    return
  }

  // Re-verify the transaction directly with Flutterwave to prevent spoofed webhooks
  try {
    const verifyRes  = await fetch(`https://api.flutterwave.com/v3/transactions/${transactionId}/verify`, {
      headers: { Authorization: `Bearer ${process.env.FLW_SECRET_KEY}` },
    })
    const verifyJson = await verifyRes.json() as { status: string; data?: { status: string; tx_ref: string } }

    if (
      verifyJson.status !== 'success' ||
      verifyJson.data?.status !== 'successful' ||
      verifyJson.data?.tx_ref !== txRef
    ) {
      logger.warn('Flutterwave webhook: transaction verification failed', { transactionId, txRef })
      res.status(200).json({ received: true })
      return
    }
  } catch (err) {
    logger.error('Flutterwave webhook: verification request failed', { transactionId, error: String(err) })
    res.status(200).json({ received: true })
    return
  }

  // Activate plan — stack on top of any existing active plan
  try {
    const plan = PLANS[tier]
    const user = await getUserById(userId)

    const existingTier = getActivePlanTier(user?.plan, user?.plan_expires_at)
    const baseDate     = existingTier !== 'free' && user?.plan_expires_at
      ? new Date(user.plan_expires_at)
      : new Date()

    const expiresAt = new Date(baseDate)
    expiresAt.setDate(expiresAt.getDate() + plan.durationDays)

    await setUserPlan(userId, tier, expiresAt.toISOString())
    await setSubscription(userId, true)

    logger.info('Flutterwave webhook: plan activated', { userId, tier, expiresAt: expiresAt.toISOString() })

    // Notify the user in Telegram
    const expLabel = expiresAt.toLocaleDateString('en-GB', {
      weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
    })

    const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN!)
    await bot.api.sendMessage(
      userId,
      `🎉 <b>Payment Confirmed!</b>\n\n` +
      `${plan.emoji} <b>${plan.name} Plan</b> is now active.\n\n` +
      `📦 Picks per day:  <b>${plan.matchLimit}</b>\n` +
      `📅 Valid until:    <b>${expLabel}</b>\n\n` +
      `Tap /predict to get today's picks.`,
      { parse_mode: 'HTML' }
    )
  } catch (err) {
    logger.error('Flutterwave webhook: plan activation failed', { userId, tier, error: String(err) })
  }

  res.status(200).json({ received: true })
}
