import type { Context } from 'grammy'
import { getSubscribedUsers } from '../../db/users'
import { logger } from '../../utils/logger'

const SEND_DELAY_MS = 50  // stay well under Telegram's 30 msg/sec global cap

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

export async function handleBroadcast(ctx: Context): Promise<void> {
  const userId  = ctx.from?.id
  const adminId = parseInt(process.env.ADMIN_TELEGRAM_ID ?? '0', 10)

  // Silently ignore anyone who is not the admin
  if (!userId || userId !== adminId) return

  const message = typeof ctx.match === 'string' ? ctx.match.trim() : ''
  if (!message) {
    await ctx.reply('Usage: /broadcast <message>\n\nHTML formatting is supported.')
    return
  }

  const users = await getSubscribedUsers()
  if (!users.length) {
    await ctx.reply('No subscribed users found.')
    return
  }

  await ctx.reply(`📡 Sending to <b>${users.length}</b> user${users.length !== 1 ? 's' : ''}…`, { parse_mode: 'HTML' })

  let sent = 0, failed = 0
  for (const user of users) {
    try {
      await ctx.api.sendMessage(user.id, message, { parse_mode: 'HTML' })
      sent++
    } catch (err) {
      failed++
      logger.warn('broadcast: failed to send', { targetId: user.id, error: String(err) })
    }
    await sleep(SEND_DELAY_MS)
  }

  await ctx.reply(
    `✅ <b>Broadcast complete.</b>\n\nSent: <b>${sent}</b>  ·  Failed: <b>${failed}</b>`,
    { parse_mode: 'HTML' }
  )
}
