import JSONdb from 'simple-json-db'
import { Guild, MessageEmbed } from 'discord.js'

export interface GuildSettings {
  post_message: boolean
  include_comments: boolean
  suppress_web_embed: boolean
}

class DefaultGuildSettings implements GuildSettings {
  post_message = false
  include_comments = false
  suppress_web_embed = false
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
    let settings: GuildSettings | any = this.getServerSettings(guild_id)
    settings.post_message = allowed
    settings.suppress_web_embed = allowed // recommended
    this.db.set(guild_id, settings)
  }

  public setCommentsAllowed(guild_id: string, allowed: boolean = true) {
    let settings: GuildSettings | any = this.getServerSettings(guild_id)
    settings.include_comments = allowed
    this.db.set(guild_id, settings)
  }

  public setSuppressAllowed(guild_id: string, allowed: boolean = true) {
    let settings: GuildSettings | any = this.getServerSettings(guild_id)
    settings.suppress_web_embed = allowed
    this.db.set(guild_id, settings)
  }

  public generateStringFromGuildId(guild_id: string): string {
    return this.generateStringFromSettings(this.getServerSettings(guild_id))
  }

  public generateStringFromSettings(settings: GuildSettings): string {
    return (
      this.postAllowedString(settings.post_message) +
      '\n' +
      (settings.post_message ? this.includeCommentsString(settings.post_message) + '\n' : '') +
      this.suppressAllowedString(settings.suppress_web_embed) +
      '\n'
    )
  }

  public generateMessageEmbedFromGuildId(guild: Guild): MessageEmbed {
    return new MessageEmbed()
      .setTitle(`${guild.name}'s Ember Settings`)
      .setDescription(this.generateStringFromGuildId(guild.id))
      .setColor('#2196F3')
      .setTimestamp(new Date())
      .setFooter('See `r/help` for more information.')
  }

  public postAllowedString(allowed: boolean): string {
    return `Ember will ${allowed ? 'send' : 'not send'} post information replies.`
  }

  public includeCommentsString(allowed: boolean): string {
    return `Ember will ${allowed ? 'show' : 'not show'} comments in the post description.`
  }

  public suppressAllowedString(allowed: boolean): string {
    return `Ember will ${allowed ? 'clean' : 'leave'} the discord auto embeds in the users message.`
  }
}
