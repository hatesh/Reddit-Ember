import { Client as DiscordBot, Message, MessageAttachment, MessageEmbed, TextChannel, User } from 'discord.js'
import { debug } from 'debug'
import { EventEmitter } from 'events'
import { getVideoOrDownload } from './video'
import crypto from 'crypto'
import { createUnknownErrorEmbed, RedditBotError } from './error'

const logger = debug('rdb:bot')

export interface SubredditMessageHandlerProps {
  channel: TextChannel
  sender: User
  subreddit: string
  query: string
}

export interface RedditUrlMessageHandlerProps {
  channel: TextChannel
  sender: User
  submissionId: string
}

const REDDIT_URL_REGEX =
  /^https?:\/\/(?:www\.)?reddit\.com\/(?:r\/(?<subredditName>[\w\d]+)\/)?comments\/(?<submissionId>[\w\d]+)/i

export class Ember extends EventEmitter {
  public prefix: string
  public minUsageInterval: number = 1500

  private processingChannels: any = {}
  private readonly bot: DiscordBot

  constructor(token: string, prefix: string) {
    super()
    this.prefix = prefix
    this.bot = new DiscordBot()
    this.bot.once('ready', this.handleReady.bind(this))
    this.bot.on('message', this.handleMessage.bind(this))
    logger('connecting to Discord...')
    this.bot.login(token)
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
    this.bot.user!.setPresence({ status: 'online', activity: { type: 'LISTENING', name: this.prefix + ' help' } })
  }

  private handleMessage(message: Message) {
    if (message.channel.type !== 'text' || message.author.bot) return
    if (message.content.startsWith(this.prefix)) this.checkForHelp(message)
    else if (message.content.startsWith('https://www.reddit.com/r/')) this.handleRedditUrlMessage(message)
  }

  private checkForHelp(message: Message) {
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
            'You disabled my powers! Please allow me to **send messages**, **manage messages**, **embed links**, **add reactions** and **attach files**.'
          )
        )
      } else {
        message.channel.send(
          'You disabled my powers! Please allow me to **send messages**, **manage messages**, **embed links**, **add reactions** and **attach files**.'
        )
      }
    }
    let raw = message.content.substring(this.prefix.length).trim().toLowerCase()
    if (!raw || raw === 'help' || raw === 'h' || raw === '?') message.channel.send(Ember.createHelpEmbed())
  }

  private static createHelpEmbed() {
    return new MessageEmbed().setTitle('Reddit Bot Help').setColor('#FF4301').setDescription(`
            **You can paste a reddit url and I will embed the content of the post into channel!**

            This bot has been made possible from CodeStix's Reddit bot.
            ❤️ Thanks for using this bot! If you like it, you should consider 
            [voting for this bot](https://top.gg/bot/847140331450531872) and/or 
            [voting for their bot](https://top.gg/bot/711524405163065385).
        `)
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
    }

    super.emit('redditUrl', props)

    // Remove default embed
    setTimeout(() => message.suppressEmbeds(true), 100)
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

  public createErrorEmbed(title: string, message: string): MessageEmbed {
    return new MessageEmbed().setTitle(`❌ ${title}`).setDescription(message).setColor('#FF4301')
  }

  public createWarningEmbed(title: string, message: string): MessageEmbed {
    return new MessageEmbed().setTitle(`⚠️ ${title}`).setDescription(message).setColor('#FF4301')
  }
}
