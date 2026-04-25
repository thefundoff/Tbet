/**
 * Local development runner — starts the bot in grammy long-polling mode.
 * No public URL or webhook required.
 *
 * Usage:  npm run local
 */
import * as path from 'path'
import * as dotenv from 'dotenv'

dotenv.config({ path: path.resolve(__dirname, '../.env') })

import { createBot, BOT_COMMANDS } from '../src/bot/index'

const bot = createBot()

bot.api.setMyCommands(BOT_COMMANDS)
  .then(() => console.log('Commands registered with Telegram.'))
  .catch(err => console.warn('Could not register commands:', err))

bot.start({
  onStart: info =>
    console.log(
      `\n✅  @${info.username} is running in polling mode.\n` +
      `    Open Telegram and send /start to test.\n` +
      `    Press Ctrl+C to stop.\n`
    ),
}).catch(err => {
  console.error('Bot crashed:', err)
  process.exit(1)
})
