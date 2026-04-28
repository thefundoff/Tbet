import { Bot, InlineKeyboard } from 'grammy'
import { userSyncMiddleware } from './middleware/userSync'
import { termsGuardMiddleware } from './middleware/termsGuard'
import { handleTermsAccept, handleTermsDecline } from './callbacks/terms'
import { handleStart }       from './commands/start'
import { handleMatches }     from './commands/matches'
import { handlePredict, handleRefreshPredictions } from './commands/predict'
import { handleSubscribe }   from './commands/subscribe'
import { handleUnsubscribe } from './commands/unsubscribe'
import { handleResults }     from './commands/results'
import { handleStats }       from './commands/stats'
import { handlePlanCallback } from './callbacks/plans'
import { handleRedeem }       from './commands/redeem'
import { handleGencode }      from './commands/gencode'
import { handleSlip }         from './commands/slip'
import { handleInvite }       from './commands/invite'
import { handleSupport }      from './commands/support'
import { handleBroadcast }    from './commands/broadcast'
import { handleAdminStats }   from './commands/adminstats'

export const BOT_COMMANDS = [
  { command: 'start',       description: 'Welcome message and main menu' },
  { command: 'matches',     description: "Today's upcoming matches" },
  { command: 'results',     description: "Yesterday's results (or /results YYYY-MM-DD)" },
  { command: 'predict',     description: 'Predictions for today\'s matches' },
  { command: 'stats',       description: 'Prediction accuracy report' },
  { command: 'plans',       description: 'View and manage your subscription plan' },
  { command: 'slip',        description: 'Clean betting slip for today\'s picks' },
  { command: 'redeem',      description: 'Redeem a promo code — /redeem YOUR-CODE' },
  { command: 'subscribe',   description: 'View subscription plans' },
  { command: 'unsubscribe', description: 'Stop daily prediction notifications' },
  { command: 'invite',      description: 'Get your referral link — earn ₦200 per friend who subscribes' },
  { command: 'support',     description: 'Send a complaint or suggestion to our team' },
]

let botInstance: Bot | null = null

export function createBot(): Bot {
  if (botInstance) return botInstance

  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN environment variable is not set')

  const bot = new Bot(token)

  bot.use(userSyncMiddleware)
  bot.use(termsGuardMiddleware)

  // ── Slash commands ───────────────────────────────────────────────────────────
  bot.command('start',       handleStart)
  bot.command('matches',     handleMatches)
  bot.command('results',     handleResults)
  bot.command('predict',     handlePredict)
  bot.command('stats',       handleStats)
  bot.command('plans',       handleSubscribe)
  bot.command('slip',        handleSlip)
  bot.command('redeem',      handleRedeem)
  bot.command('subscribe',   handleSubscribe)
  bot.command('unsubscribe', handleUnsubscribe)
  bot.command('invite',      handleInvite)
  bot.command('support',     handleSupport)
  bot.command('broadcast',          handleBroadcast)          // admin only — not in BOT_COMMANDS
  bot.command('refreshpredictions', handleRefreshPredictions) // admin only — not in BOT_COMMANDS
  bot.command('adminstats',  handleAdminStats) // admin only — not in BOT_COMMANDS
  bot.command('gencode',     handleGencode)   // admin only — not in BOT_COMMANDS

  // ── Inline keyboard callbacks ─────────────────────────────────────────────────

  // Terms callbacks are handled before the general router (middleware already allowed them through)
  bot.callbackQuery(/^terms_/, async ctx => {
    await ctx.answerCallbackQuery()
    if (ctx.callbackQuery.data === 'terms_decline') {
      return handleTermsDecline(ctx)
    }
    return handleTermsAccept(ctx)  // handles both "terms_accept" and "terms_accept:ref_..."
  })

  bot.callbackQuery(/.*/, async ctx => {
    await ctx.answerCallbackQuery()
    await handlePlanCallback(ctx, ctx.callbackQuery.data)
  })

  // ── Fallback for plain text messages ─────────────────────────────────────────
  bot.on('message', async ctx => {
    const kb = new InlineKeyboard()
      .text('🏠 Main Menu', 'cmd_start')
      .text('💎 View Plans', 'plans')

    await ctx.reply(
      'Use the buttons or type /start to open the main menu.',
      { reply_markup: kb }
    )
  })

  botInstance = bot
  return bot
}
