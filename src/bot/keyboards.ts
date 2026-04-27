import { InlineKeyboard } from 'grammy'

export function buildMainMenuKeyboard(): InlineKeyboard {
  const kb = new InlineKeyboard()
    .text('⚽ Matches',       'cmd_matches')
    .text('🔮 Predictions',   'cmd_predict')
    .row()
    .text('📊 Results',       'cmd_results')
    .row()
    .text('💳 My Plan',       'my_plan')
    .text('💎 View Plans',    'plans')
    .row()
    .text('👥 Invite Friends', 'cmd_invite')
    .row()
    .text('📩 Support',       'show_support')

  const channelUrl = process.env.TELEGRAM_CHANNEL_URL
  if (channelUrl) {
    kb.url('📢 Join Channel', channelUrl)
  }

  return kb
}
