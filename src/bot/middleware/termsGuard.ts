import type { Context, NextFunction } from 'grammy'
import { getUserById } from '../../db/users'
import { showTerms } from '../callbacks/terms'

export async function termsGuardMiddleware(ctx: Context, next: NextFunction): Promise<void> {
  const userId = ctx.from?.id
  if (!userId) { await next(); return }

  // Always allow terms-related callbacks through so the user can complete agreement
  const callbackData = ctx.callbackQuery?.data ?? ''
  if (callbackData.startsWith('terms_')) { await next(); return }

  const user = await getUserById(userId)
  if (user?.agreed_to_terms) { await next(); return }

  // User has not agreed yet — show terms.
  // For /start commands, extract any referral payload from the raw message text
  // (ctx.match is not available in middleware, so we parse the text directly).
  const text       = ctx.message?.text ?? ''
  const startMatch = text.match(/^\/start(?:@\w+)?\s+(.+)$/)
  const refPayload = startMatch?.[1]?.trim()

  await showTerms(ctx, refPayload?.startsWith('ref_') ? refPayload : undefined)
  // Do NOT call next() — the interaction is blocked until terms are accepted
}
