import type { Context } from 'grammy'
import { InlineKeyboard } from 'grammy'
import { upsertUser, agreeToTerms, getUserById, setReferredBy } from '../../db/users'
import { buildMainMenuKeyboard } from '../keyboards'

const TERMS_TEXT =
  `📋 <b>Terms &amp; Conditions</b>\n\n` +
  `Before using Tbet, please read and agree to the following:\n\n` +
  `<b>1. Entertainment only</b>\n` +
  `Predictions are for informational and entertainment purposes only. They do not constitute financial or betting advice.\n\n` +
  `<b>2. Age requirement</b>\n` +
  `You must be at least 18 years old (or the legal gambling age in your country) to use this service.\n\n` +
  `<b>3. No guarantees</b>\n` +
  `Past accuracy does not guarantee future results. Only bet what you can afford to lose.\n\n` +
  `<b>4. Responsible gambling</b>\n` +
  `If gambling is causing you problems, please seek help at <b>begambleaware.org</b> or your local support service.\n\n` +
  `<b>5. No liability</b>\n` +
  `Tbet accepts no responsibility for financial losses incurred while using this service.\n\n` +
  `<b>6. Payments</b>\n` +
  `All subscription payments are final. Refunds are issued only at our sole discretion.\n\n` +
  `By tapping <b>I Agree</b>, you confirm you have read and accepted these terms.`

export async function showTerms(ctx: Context, refPayload?: string): Promise<void> {
  // Encode the referral code into the accept button data so it survives the round-trip.
  // Telegram callback data limit is 64 bytes. "terms_accept:ref_1234567890" ≤ 30 chars.
  const acceptData = refPayload ? `terms_accept:${refPayload}` : 'terms_accept'

  const kb = new InlineKeyboard()
    .text('✅ I Agree', acceptData)
    .row()
    .text('❌ I Decline', 'terms_decline')

  await ctx.reply(TERMS_TEXT, { parse_mode: 'HTML', reply_markup: kb })
}

export async function handleTermsAccept(ctx: Context): Promise<void> {
  const userId = ctx.from?.id
  if (!userId) return

  // Ensure user row exists, then mark terms accepted
  if (ctx.from) await upsertUser(ctx.from)
  await agreeToTerms(userId)

  // Process referral if encoded in callback data: "terms_accept:ref_12345678"
  const data     = ctx.callbackQuery?.data ?? ''
  const refPart  = data.startsWith('terms_accept:') ? data.slice('terms_accept:'.length) : ''
  if (refPart.startsWith('ref_')) {
    const referrerId = parseInt(refPart.slice(4), 10)
    if (!isNaN(referrerId) && referrerId !== userId) {
      const self = await getUserById(userId)
      if (!self?.referred_by) await setReferredBy(userId, referrerId)
    }
  }

  const name = ctx.from?.first_name ?? 'there'

  await ctx.reply(
    `✅ <b>Terms accepted. Welcome, ${name}!</b>\n\n` +
    `I analyse real football matches and generate statistical predictions powered by market odds and AI modelling.\n\n` +
    `<b>What would you like to do?</b>`,
    { parse_mode: 'HTML', reply_markup: buildMainMenuKeyboard() }
  )
}

export async function handleTermsDecline(ctx: Context): Promise<void> {
  await ctx.reply(
    `❌ <b>You declined the Terms &amp; Conditions.</b>\n\n` +
    `You cannot use Tbet without accepting the terms.\n\n` +
    `If you change your mind, tap /start to review them again.`,
    { parse_mode: 'HTML' }
  )
}
