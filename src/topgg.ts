import { debug } from 'debug'
import { Client as DiscordBot } from 'discord.js'
import DBL from 'dblapi.js'

const logger = debug('rdb:topgg')

export class TopGGApi {
  private connection: DBL

  constructor(token: string, bot: DiscordBot) {
    this.connection = new DBL(token, bot)
    this.connection.on('posted', TopGGApi.handlePosted)
    this.connection.on('error', TopGGApi.handleError)
  }

  private static handlePosted() {
    logger('server count posted')
  }

  private static handleError(err: any) {
    logger('error:', err)
  }
}
