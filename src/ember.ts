import { Client as DiscordBot, Message, MessageAttachment, MessageEmbed, TextChannel, User } from 'discord.js'
import { debug } from 'debug'
import { EventEmitter } from 'events'
import { getVideoOrDownload } from './video'
import crypto from 'crypto'
import { createUnknownErrorEmbed, RedditBotError } from './error'
import { GuildSettingsManager } from './guild_settings_manager'
// @ts-ignore
import packageConfig from '../package.json'

const logger = debug('reb:ember')

export interface RedditUrlMessageHandlerProps {
  channel: TextChannel
  sender: User
  submissionId: string
  guildId: string | undefined
}

const REDDIT_URL_REGEX =
  /^https?:\/\/(?:(www|old)\.)?reddit\.com\/(?:r\/(?<subredditName>[\w\d]+)\/)?comments\/(?<submissionId>[\w\d]+)/i

export class Ember extends EventEmitter {
  public prefix: string
  public minUsageInterval: number = 1500

  private processingChannels: any = {}
  private readonly bot: DiscordBot

  public guildSettingsManager: GuildSettingsManager

  constructor(token: string, prefix: string) {
    super()
    this.prefix = prefix
    this.bot = new DiscordBot()
    this.bot.once('ready', this.handleReady.bind(this))
    this.bot.on('message', this.handleMessage.bind(this))
    logger('connecting to Discord...')
    this.bot.login(token)
    this.guildSettingsManager = new GuildSettingsManager('./guild_settings.json')
  }

  public getBot(): DiscordBot {
    return this.bot
  }

  private handleReady() {
    logger('connected to discord')
    setInterval(this.updatePresence.bind(this), 4 * 60 * 60 * 1000)
    this.updatePresence()
  }

  private updatePresence() {
    logger('updating presence')
    this.bot.user!.setPresence({ status: 'online', activity: { type: 'LISTENING', name: this.prefix + 'help' } })
  }

  private handleMessage(message: Message) {
    if (message.channel.type !== 'text' || message.author.bot) return
    if (message.content.startsWith(this.prefix)) {
      this.checkForHelp(message)
      this.checkForPermissions(message)
      this.checkForSettings(message)
    } else if (message.content.startsWith('https://www.reddit.com/r/')) this.handleRedditUrlMessage(message)
  }

  private checkForSettings(message: Message) {
    let raw = message.content.substring(this.prefix.length).trim().toLowerCase()
    const allowed = Ember.stringIncludesTruthy(raw)
    if (raw.startsWith('setting')) this.sendSettings(message)
    else if (raw.startsWith('sum')) this.changePostAllowed(message, allowed)
    else if (raw.startsWith('sup')) this.changeSuppressAllowed(message, allowed)
    else if (raw.startsWith('com')) this.changeIncludeComments(message, allowed)
  }

  private changePostAllowed(message: Message, allowed: boolean) {
    this.guildSettingsManager.setPostMessageAllowed(<string>message.guild?.id.toString(), allowed)
    if (message.guild!.me!.permissions.has('EMBED_LINKS')) {
      message.channel.send(
        this.createSuccessEmbed('Summary Post Updated', this.guildSettingsManager.postAllowedString(allowed))
      )
    } else {
      message.channel.send(this.guildSettingsManager.postAllowedString(allowed))
    }
  }

  private changeIncludeComments(message: Message, allowed: boolean) {
    this.guildSettingsManager.setCommentsAllowed(<string>message.guild?.id.toString(), allowed)
    if (message.guild!.me!.permissions.has('EMBED_LINKS')) {
      message.channel.send(
        this.createSuccessEmbed('Summary Comments Updated', this.guildSettingsManager.includeCommentsString(allowed))
      )
    } else {
      message.channel.send(this.guildSettingsManager.includeCommentsString(allowed))
    }
  }

  private changeSuppressAllowed(message: Message, allowed: boolean) {
    if (!message.guild!.me!.permissions.has('MANAGE_MESSAGES')) {
      message.channel.send(
        this.createWarningEmbed(
          'Permission Missing',
          'To enable suppressing of Auto Embeds, Ember needs permission to ***manage messages***.'
        )
      )
    } else {
      this.guildSettingsManager.setSuppressAllowed(<string>message.guild?.id.toString(), allowed)
      if (message.guild!.me!.permissions.has('EMBED_LINKS')) {
        message.channel.send(
          this.createSuccessEmbed(
            'Auto Embed Removal Updated',
            this.guildSettingsManager.suppressAllowedString(allowed)
          )
        )
      } else {
        message.channel.send(this.guildSettingsManager.suppressAllowedString(allowed))
      }
    }
  }

  private sendSettings(message: Message) {
    if (message.guild!.me!.permissions.has('EMBED_LINKS')) {
      if (message.guild !== null)
        message.channel.send(this.guildSettingsManager.generateMessageEmbedFromGuildId(message.guild))
    } else {
      message.channel.send(this.guildSettingsManager.generateStringFromGuildId(<string>message.guild?.id.toString()))
    }
  }

  private checkForPermissions(message: Message) {
    let raw = message.content.substring(this.prefix.length).trim().toLowerCase()
    if (raw.startsWith('perm')) this.sendPermissionsMessage(message, true)
  }

  private sendPermissionsMessage(message: Message, reportCorrect: boolean = false) {
    let permissions = message.guild!.me!.permissions
    if (
      !permissions.has('ATTACH_FILES') ||
      !permissions.has('EMBED_LINKS') ||
      !permissions.has('SEND_MESSAGES') ||
      !permissions.has('ADD_REACTIONS') ||
      !permissions.has('MANAGE_MESSAGES')
    ) {
      logger('insufficient permissions for channel (%d)', message.channel.id)
      if (permissions.has('EMBED_LINKS')) {
        message.channel.send(
          this.createErrorEmbed(
            'No Discord permissions',
            'You disabled my powers! Please allow me to ' +
              (!permissions.has('SEND_MESSAGES') ? '**send messages**, ' : '') +
              (!permissions.has('EMBED_LINKS') ? '**embed links**, ' : '') +
              (!permissions.has('MANAGE_MESSAGES') ? '**manage messages**, ' : '') +
              (!permissions.has('ADD_REACTIONS') ? '**add reactions**, ' : '') +
              (!permissions.has('ATTACH_FILES') ? '**attach files**.' : '.')
          )
        )
      } else {
        message.channel.send(
          'You disabled my powers! Please allow me to `' +
            (!permissions.has('SEND_MESSAGES') ? '**send messages**, ' : '') +
            (!permissions.has('EMBED_LINKS') ? '**embed links**, ' : '') +
            (!permissions.has('MANAGE_MESSAGES') ? '**manage messages**, ' : '') +
            (!permissions.has('ADD_REACTIONS') ? '**add reactions**, ' : '') +
            (!permissions.has('ATTACH_FILES') ? '**attach files**.' : '.')
        )
      }
    } else if (reportCorrect) {
      if (permissions.has('EMBED_LINKS')) {
        message.channel.send(
          this.createSuccessEmbed('Permissions Correct', 'You have given the bot all the correct permissions!')
        )
      } else {
        message.channel.send('Permissions have been set up correctly!')
      }
    }
  }

  private checkForHelp(message: Message) {
    this.sendPermissionsMessage(message, false)
    let raw = message.content.substring(this.prefix.length).trim().toLowerCase()
    if (!raw || raw === 'help' || raw === 'h' || raw === '?') message.channel.send(Ember.createHelpEmbed())
  }

  private static createHelpEmbed() {
    return new MessageEmbed()
      .setTitle('Ember Help')
      .setColor('#DD2D04')
      .setDescription(
        `
        ***General Commands***:
        > To see this help command, send \`r/help\`.
        > To check whether Ember's permissions are correct, send \`r/permissions\`.
        > To check your Server Specific settings are, send \`r/settings\`.
            
        ***Post Summary***
        > Use \`r/summary on\` or \`r/summary off\` to toggle whether Ember sends a summary of reddit posts.
        > If you have summary enabled, use \`r/comments on\` or \`r/comments off\` to toggle whether comments are added to the post summary.
        > *Note: Toggling summary will also toggle suppression but **not** vice versa.* 
        
        ***Auto Embed Suppression***
        > Discord sometimes adds an Automatic Embedded Summary to reddit post links. You can choose to keep or suppress them.
        > Use \`r/suppress on\` or \`r/suppress off\` to toggle whether Ember removes the auto embeds.
        > *Note: This will require the \`Manage Messages\` permission.* 

        ***You can paste a reddit url and I will embed the content of the post into channel!***
                     
        This bot has been made possible from CodeStix's existing Reddit bot.
        ❤️Thanks for using this bot! If you like it, you should consider [voting for this bot](https://top.gg/bot/847140331450531872) and/or [voting for their bot](https://top.gg/bot/711524405163065385).
            
        [My code lives here!](https://github.com/hatesh/Reddit-Ember)
        `
      )
      .setFooter(`Version: ${packageConfig.version} `, 'https://avatars.githubusercontent.com/u/43727025')
      .setTimestamp(new Date())
  }

  private rateLimit(channelId: string): boolean {
    if (this.processingChannels[channelId]) return false
    this.processingChannels[channelId] = true
    setTimeout(() => delete this.processingChannels[channelId], this.minUsageInterval)
    return true
  }

  private handleRedditUrlMessage(message: Message) {
    if (!this.rateLimit(message.channel.id)) {
      logger("cancelled input '%s', rate limit", message.content)
      return
    }

    var results = REDDIT_URL_REGEX.exec(message.content)
    if (!results || !results.groups || !results.groups.submissionId) {
      message.reply('Invalid Reddit url.')
      return
    }

    let props: RedditUrlMessageHandlerProps = {
      channel: message.channel as TextChannel,
      sender: message.author,
      submissionId: results.groups.submissionId,
      guildId: message.guild?.id,
    }

    super.emit('redditUrl', props)

    // Remove default embed
    if (this.guildSettingsManager.getServerSettings(<string>message.guild?.id).suppress_web_embed) {
      if (message.guild!.me!.permissions.has('MANAGE_MESSAGES')) {
        setTimeout(() => message.suppressEmbeds(true), 100)
      } else {
        this.guildSettingsManager.setSuppressAllowed(<string>message.guild?.id, false)
      }
    }
  }

  private getUrlName(url: string) {
    return crypto.createHash('sha1').update(url, 'utf8').digest('hex')
  }

  public async sendImageAttachment(channel: TextChannel, url: string, spoiler: boolean) {
    try {
      let urlName = this.getUrlName(url)
      let name = spoiler ? `SPOILER_${urlName}.png` : `image-${urlName}.png`
      await channel.send('', new MessageAttachment(url, name))
    } catch (ex) {
      logger('could not send as image, sending url instead:', ex)
      await channel.send(`⚠️ Could not upload to Discord, take a link instead: ${url}`)
    }
  }

  public async sendVideoAttachment(channel: TextChannel, url: string, spoiler: boolean) {
    try {
      let videoFile = await getVideoOrDownload(url)
      let urlName = this.getUrlName(url)
      let name = spoiler ? `SPOILER_${urlName}.mp4` : `video-${urlName}.mp4`
      await channel.send('', new MessageAttachment(videoFile, name))
    } catch (ex) {
      if (ex instanceof RedditBotError) {
        await channel.send(ex.createEmbed())
      } else {
        await channel.send(createUnknownErrorEmbed('Could not download video'))
      }
    }
  }

  public async sendUrlAttachment(channel: TextChannel, text: string, spoiler: boolean) {
    if (spoiler) {
      await channel.send(`||${text}||`)
    } else {
      await channel.send(text)
    }
  }

  public createSuccessEmbed(title: string, message: string): MessageEmbed {
    return new MessageEmbed().setTitle(`✔ ${title}`).setDescription(message).setColor('#4CAF50')
  }

  public createErrorEmbed(title: string, message: string): MessageEmbed {
    return new MessageEmbed().setTitle(`❌ ${title}`).setDescription(message).setColor('#FF4301')
  }

  public createWarningEmbed(title: string, message: string): MessageEmbed {
    return new MessageEmbed().setTitle(`⚠️ ${title}`).setDescription(message).setColor('#FFC107')
  }

  private static stringIncludesTruthy(msg: string): boolean {
    return (msg.includes('on') || msg.includes('1') || msg.includes('true')) && !this.stringIncludesFalsy(msg)
  }

  private static stringIncludesFalsy(msg: string): boolean {
    return msg.includes('off') || msg.includes('0') || msg.includes('false')
  }
}
