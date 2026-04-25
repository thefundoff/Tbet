import type { Context, NextFunction } from 'grammy'
import { upsertUser } from '../../db/users'

/**
 * Middleware that upserts the Telegram user into Supabase on every interaction.
 * Runs silently — errors are swallowed so they never break the user experience.
 */
export async function userSyncMiddleware(ctx: Context, next: NextFunction): Promise<void> {
  if (ctx.from) {
    upsertUser(ctx.from).catch(() => { /* non-critical — fire and forget */ })
  }
  await next()
}
