import { debug } from 'debug'
import fetch from 'node-fetch'
import { RedditBotError } from './error'

const logger = debug('rdb:reddit')

const API_BASE = 'https://api.reddit.com'

export type RedditFetchErrorType = 'not-found' | 'private' | 'banned' | 'unknown'

// Do not rename these fields! They come directly from the reddit API
export interface Submission {
  id: string
  stickied: boolean
  author: string
  selftext: string
  created: number
  title: string
  url: string
  subreddit: string
  over_18: boolean
  spoiler: boolean
  permalink: string
  score: number
  is_video: boolean
}

export interface RedditUser {
  name: string
  icon_img: string
}

export interface Subreddit {
  name: string
  icon_img: string
  key_color: string
  primary_color: string
}

export interface Listing<T> {
  after: string
  before: string
  limit: number
  count: number
  show: string
  children: {
    kind: string
    data: T
  }[]
}

export function getRandomDefaultUserIcon() {
  // https://www.reddit.com/user/timawesomeness/comments/813jpq/default_reddit_profile_pictures/
  const randomTextureId = (Math.floor(Math.random() * 20) + 1).toString().padStart(2, '0')
  const possibleColors = [
    'A5A4A4',
    '545452',
    'A06A42',
    'C18D42',
    'FF4500',
    'FF8717',
    'FFB000',
    'FFD635',
    'DDBD37',
    'D4E815',
    '94E044',
    '46A508',
    '46D160',
    '0DD3BB',
    '25B79F',
    '008985',
    '24A0ED',
    '0079D3',
    '7193FF',
    '4856A3',
    '7E53C1',
    'FF66AC',
    'DB0064',
    'EA0027',
    'FF585B',
  ]
  const randomColor = possibleColors[Math.floor(Math.random() * possibleColors.length)]
  return `https://www.redditstatic.com/avatars/avatar_default_${randomTextureId}_${randomColor}.png`
}

const AFTER_FETCH_REPLACE: any = {
  '&amp;': '&',
  '&quot;': "'",
  '&lt;': '<',
  '&gt;': '>',
}
const AFTER_FETCH_REGEX = new RegExp(Object.keys(AFTER_FETCH_REPLACE).join('|'), 'gi')

function parseListing<TListing>(res: any): Listing<TListing> {
  let listing: Listing<TListing> = res.data
  if (!listing) throw new Error(`No listing was returned`)
  if (!listing.children) throw new Error(`Invalid listing was returned`)
  return listing
}

function parseArrayListing(res: any): Listing<any>[] {
  if (!Array.isArray(res)) throw new Error('Invalid array listing response.')
  if (res.length === 0 || !res[0].data) throw new Error('Empty array listing response.')
  return res.map(e => e.data)
}

async function fetchJson(url: string): Promise<any> {
  let res = await fetch(url)
  let text = await res.text()
  // Replace html entities
  let obj = JSON.parse(text.replace(AFTER_FETCH_REGEX, m => AFTER_FETCH_REPLACE[m.toLowerCase()]))
  if (res.ok) {
    return obj
  } else if (res.status === 404) {
    throw RedditBotError.fromReddit404ErrorData(obj)
  } else if (res.status === 403) {
    throw new RedditBotError('private-subreddit')
  } else {
    throw new RedditBotError('unknown-fetch')
  }
}

export async function fetchUser(userName: string): Promise<RedditUser> {
  if (!userName || userName === '[deleted]') throw new Error(`empty name '${userName}' was given to fetchUser`)

  let url = `${API_BASE}/user/${userName}/about`
  let res = await fetchJson(url)

  if (!res.data || typeof res.data.name !== 'string') throw new Error('Invalid user response')
  return res.data as RedditUser
}

export async function getSubredditInfo(
  subredditName: string,
  cacheOnly: boolean = false
): Promise<{ color: string; icon: string } | null> {
  try {
    let subreddit = await fetchSubreddit(subredditName)
    let color = subreddit.primary_color || subreddit.key_color || '#11ff11'
    return {
      color: color,
      icon: subreddit.icon_img,
    }
  } catch (ex) {
    logger("could not get subreddit icon for '%s':", subredditName, ex)
    return null
  }
}

export async function fetchSubreddit(subredditName: string): Promise<Subreddit> {
  let url = `${API_BASE}/r/${subredditName}/about`
  let res = await fetchJson(url)

  if (!res.data || typeof res.data.name !== 'string') throw new Error('Invalid subreddit response')
  return res.data as Subreddit
}

export async function getRedditUserIcon(userName: string): Promise<string | null> {
  try {
    let user = await fetchUser(userName)
    return user.icon_img
  } catch (ex) {
    logger("could not get user icon for '%s':", userName, ex)
    return null
  }
}

export async function fetchSubmission(submissionId: string, maxDepth: number = 2): Promise<Submission> {
  let url = `${API_BASE}/comments/${submissionId}?depth=${maxDepth}&limit=${maxDepth}`
  let listings = parseArrayListing(await fetchJson(url))
  return (listings[0] as Listing<Submission>).children[0].data
}

export async function getSubmission(submissionId: string, maxDepth: number = 2): Promise<Submission | null> {
  return await fetchSubmission(submissionId, maxDepth)
}
