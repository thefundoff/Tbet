import type { Context } from 'grammy'
import { InlineKeyboard } from 'grammy'

export async function handleStart(ctx: Context): Promise<void> {
  const name = ctx.from?.first_name ?? 'there'

  const keyboard = new InlineKeyboard()
    .text('⚽ Matches',     'cmd_matches')
    .text('🔮 Predictions', 'cmd_predict')
    .row()
    .text('📊 Results',     'cmd_results')
    .text('📈 Stats',       'cmd_stats')
    .row()
    .text('💳 My Plan',     'my_plan')
    .text('💎 View Plans',  'plans')

  await ctx.reply(
    `👋 <b>Welcome, ${name}!</b>\n\n` +
    `I analyse real football matches and generate statistical predictions powered by market odds and AI modelling.\n\n` +
    `<b>What would you like to do?</b>`,
    { parse_mode: 'HTML', reply_markup: keyboard }
  )
}
