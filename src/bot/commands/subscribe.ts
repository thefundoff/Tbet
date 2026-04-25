import type { Context } from 'grammy'
import { showPlansOverview } from '../callbacks/plans'

export async function handleSubscribe(ctx: Context): Promise<void> {
  await showPlansOverview(ctx)
}
