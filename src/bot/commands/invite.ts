import type { Context } from 'grammy'
import { InlineKeyboard } from 'grammy'
import { getUserById, getReferralStats } from '../../db/users'

export async function handleInvite(ctx: Context): Promise<void> {
  const userId = ctx.from?.id
  if (!userId) { await ctx.reply('⚠️ Could not identify your account.'); return }

  const [user, stats] = await Promise.all([
    getUserById(userId),
    getReferralStats(userId),
  ])

  const botUsername = ctx.me.username
  const inviteLink  = `https://t.me/${botUsername}?start=ref_${userId}`
  const shareUrl    =
    `https://t.me/share/url?url=${encodeURIComponent(inviteLink)}` +
    `&text=${encodeURIComponent('Join me on Tbet! Get ₦200 off your first football prediction plan 🎁')}`
  const credit = user?.referral_credit ?? 0

  const text =
    `👥 <b>Invite Friends — Earn Rewards</b>\n\n` +
    `Share your unique link. When a friend subscribes for the first time:\n` +
    `  🎁 <b>They get:</b> ₦200 off their first plan\n` +
    `  💰 <b>You earn:</b> ₦200 credit towards your next plan\n\n` +
    `🔗 <b>Your invite link:</b>\n` +
    `<code>${inviteLink}</code>\n\n` +
    `📊 <b>Your stats:</b>\n` +
    `  Friends joined:   <b>${stats.joined}</b>\n` +
    `  Paid referrals:   <b>${stats.paid}</b>\n` +
    `  Available credit: <b>₦${credit.toLocaleString()}</b>\n\n` +
    `<i>Credit is applied automatically to your next subscription payment.</i>`

  const kb = new InlineKeyboard()
    .url('📤 Share Invite Link', shareUrl)
    .row()
    .text('🏠 Main Menu', 'cmd_start')

  await ctx.reply(text, { parse_mode: 'HTML', reply_markup: kb })
}
