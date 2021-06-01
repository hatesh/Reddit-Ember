import JSONdb from 'simple-json-db'
import { Snowflake } from 'discord.js'

export interface GuildSettings {
  post_message: boolean
}

class DefaultGuildSettings implements GuildSettings {
  post_message = true
}

export class GuildSettingsManager {
  db: JSONdb

  constructor(settings_file: string) {
    this.db = new JSONdb(settings_file)
  }

  public getServerSettings(guild_id: string | undefined): GuildSettings {
    if (guild_id) {
      if (!this.db.has(guild_id)) this.db.set(guild_id, new DefaultGuildSettings())
      return <GuildSettings>this.db.get(guild_id)
    }
    return new DefaultGuildSettings()
  }

  public setPostMessageAllowed(guild_id: string, allowed: boolean = true) {
    if (!this.db.has(guild_id)) this.db.set(guild_id, new DefaultGuildSettings())
    let s: GuildSettings | any = this.db.get(guild_id)
    s.post_message = true
    this.db.set(guild_id, s)
  }
}
