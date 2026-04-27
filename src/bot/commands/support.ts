import type { Context } from 'grammy'
import { InlineKeyboard } from 'grammy'
import { logger } from '../../utils/logger'

export async function handleSupport(ctx: Context): Promise<void> {
  const userId  = ctx.from?.id
  const message = typeof ctx.match === 'string' ? ctx.match.trim() : ''

  if (!message) {
    // No message — show the support info panel
    const channelUrl = process.env.TELEGRAM_CHANNEL_URL
    const kb = new InlineKeyboard()
    if (channelUrl) {
      kb.url('📢 Join Our Channel', channelUrl).row()
    }
    kb.text('🏠 Main Menu', 'cmd_start')

    await ctx.reply(
      `📩 <b>Support</b>\n\n` +
      `To send a complaint or suggestion, type:\n\n` +
      `<code>/support your message here</code>\n\n` +
      `<b>Example:</b>\n` +
      `<code>/support The Arsenal vs Chelsea prediction was wrong</code>\n\n` +
      `We review all messages and will respond as soon as possible.`,
      { parse_mode: 'HTML', reply_markup: kb }
    )
    return
  }

  // Forward message to admin
  const adminId = process.env.ADMIN_TELEGRAM_ID
  if (!adminId) {
    await ctx.reply('⚠️ Support is temporarily unavailable. Please try again later.')
    return
  }

  try {
    const username = ctx.from?.username ? `@${ctx.from.username}` : 'N/A'
    const fullName = [ctx.from?.first_name, ctx.from?.last_name].filter(Boolean).join(' ') || 'Unknown'

    await ctx.api.sendMessage(
      adminId,
      `📩 <b>Support Message</b>\n\n` +
      `From:     <b>${fullName}</b>\n` +
      `Username: ${username}\n` +
      `User ID:  <code>${userId}</code>\n\n` +
      `<b>Message:</b>\n${message}`,
      { parse_mode: 'HTML' }
    )

    await ctx.reply(
      `✅ <b>Message sent!</b>\n\nYour message has been delivered to our team. We'll get back to you soon.`,
      { parse_mode: 'HTML', reply_markup: new InlineKeyboard().text('🏠 Main Menu', 'cmd_start') }
    )
  } catch (err) {
    logger.error('handleSupport: failed to forward to admin', { userId, error: String(err) })
    await ctx.reply('⚠️ Could not deliver your message right now. Please try again later.')
  }
}
