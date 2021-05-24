import {config} from "dotenv";
import {MessageEmbed, TextChannel} from "discord.js";
import {debug} from "debug";
import {Ember, RedditUrlMessageHandlerProps} from "./ember";
import {
    fetchSubmission,
    getRandomDefaultUserIcon,
    getRedditUserIcon,
    getSubmission,
    getSubredditInfo,
    Submission,
} from "./reddit";
import cheerio from "cheerio";
import fetch from "node-fetch";
import {TopGGApi} from "./topgg";
import {getVideoOrDownload} from "./video";
import {createUnknownErrorEmbed, RedditBotError} from "./error";

config(); // must load environment vars before anything else

const logger = debug("rdb");

const bot = new Ember(process.env.DISCORD_TOKEN!, process.env.PREFIX ?? "r/");
const topgg = process.env.TOPGG_TOKEN ? new TopGGApi(process.env.TOPGG_TOKEN, bot.getBot()) : null;

const DEFAULT_EMBED_COLOR = "#2f3136"; // 55ff11
const TRUNCATE_TITLE_LENGTH = 200; // Max is 256
const TRUNCATE_DESCRIPTION_LENGTH = 1000;

bot.on("redditUrl", async (props: RedditUrlMessageHandlerProps) => {
    logger("redditurl", props.submissionId);
    try {
        let submission = await fetchSubmission(props.submissionId);
        await sendRedditSubmission(props.channel, submission);
    } catch (ex) {
        if (ex instanceof RedditBotError) {
            logger("bot error (%s): %s", ex.type, ex.message);
            await props.channel.send(ex.createEmbed());
        } else {
            logger("unknown error", ex);
            await props.channel.send(createUnknownErrorEmbed());
        }
    }
});

async function sendRedditSubmission(channel: TextChannel, submission: Submission, query?: string) {
    let nsfw = submission.over_18 || submission.title.toLowerCase().includes("nsf");
    let asSpoiler = submission.spoiler || nsfw;
    let urlToSubmission = encodeURI("https://www.reddit.com" + submission.permalink);
    let urlToAuthor = encodeURI("https://www.reddit.com/u/" + submission.author);
    let urlIsAttachment = urlToSubmission !== submission.url;
    let footerText = `On r/${submission.subreddit}`;
    footerText += `/${query}`;

    let userIcon = await getRedditUserIcon(submission.author);
    let subredditInfo = await getSubredditInfo(submission.subreddit);
    let attachment = urlIsAttachment ? await getUnpackedUrl(submission.url) : null;
    let details = await getSubmission(submission.id);

    let descriptionBuilder = "";
    descriptionBuilder += numberToEmojiNumber(submission.score, true) + "\n";
    descriptionBuilder += truncateString(submission.selftext, TRUNCATE_DESCRIPTION_LENGTH);

    let embed = new MessageEmbed()
        .setTitle(truncateString(submission.title, TRUNCATE_TITLE_LENGTH))
        .setURL(urlToSubmission)
        .setColor(subredditInfo?.color ?? DEFAULT_EMBED_COLOR)
        .setTimestamp(submission.created * 1000)
        .setDescription(descriptionBuilder)
        .setAuthor(submission.author, userIcon ?? getRandomDefaultUserIcon(), urlToAuthor)
        .setFooter(footerText, subredditInfo?.icon ?? undefined);
    let firstSentMessage = channel.send(embed);

    // Contains tasks that will edit the sent embed
    let embedTasks = [];
    if (userIcon === null) embedTasks.push(getRedditUserIcon(submission.author).then((e) => (userIcon = e)));
    if (subredditInfo === null) embedTasks.push(getSubredditInfo(submission.subreddit).then((e) => (subredditInfo = e)));
    if (details === null) embedTasks.push(getSubmission(submission.id).then((e) => (details = e)));

    let otherTasks = [];
    if (urlIsAttachment && attachment === null) otherTasks.push(getUnpackedUrl(submission.url).then((e) => (attachment = e)));

    if (embedTasks.length > 0) {
        await Promise.all(embedTasks as any);

        embed.setDescription(descriptionBuilder);
        embed.setAuthor(submission.author, userIcon ?? getRandomDefaultUserIcon());
        embed.setColor(subredditInfo?.color ?? DEFAULT_EMBED_COLOR);
        embed.setFooter(footerText, subredditInfo?.icon ?? undefined);

        await (await firstSentMessage).edit(embed);
    }

    if (otherTasks.length > 0) await Promise.all(otherTasks);

    if (attachment) {
        if (submission.is_video || isVideoUrl(attachment)) {
            await bot.sendVideoAttachment(channel, attachment, asSpoiler);
        } else if (isImageUrl(attachment)) {
            await bot.sendImageAttachment(channel, attachment, asSpoiler);
        } else {
            await bot.sendUrlAttachment(channel, attachment, asSpoiler);
        }
    }
}

async function preloadSubmission(submission: Submission) {
    let urlToSubmission = encodeURI("https://www.reddit.com" + submission.permalink);
    let urlIsAttachment = urlToSubmission !== submission.url;

    async function preloadAttachment(url: string | null) {
        if (!url) return;
        if (isVideoUrl(url)) {
            await getVideoOrDownload(url);
        }
    }

    let tasks = [];
    tasks.push(getRedditUserIcon(submission.author));
    tasks.push(getSubredditInfo(submission.subreddit));
    tasks.push(getSubmission(submission.id, false, 3));
    if (urlIsAttachment) tasks.push(getUnpackedUrl(submission.url).then(preloadAttachment));

    try {
        await Promise.all(tasks as any);
    } catch (ex) {
        logger("error while preloading", ex);
    }
}

async function getUnpackedUrl(url: string): Promise<string | null> {
    return await unpackUrl(url);
}

/**
 * Convert a redirecting, bit.ly, imgur... url to the direct url.
 * @param {string} url The url to unpack/resolve.
 */
async function unpackUrl(url: string): Promise<string> {
    if (url.startsWith("http://bit.ly") || url.startsWith("https://bit.ly")) {
        try {
            let res = await fetch(url, { redirect: "follow", method: "HEAD" });
            url = res.url;
        } catch (ex) {
            logger("unpackUrl: could not get redirected url", ex.message);
        }
    }

    if (url.startsWith("https://www.reddit.com/gallery/") || url.startsWith("https://reddit.com/gallery/")) {
        let res = await (await fetch(url, { redirect: "follow" })).buffer();
        let ch = cheerio.load(res);
        let elem = ch("figure img");
        if (elem) url = elem.attr("src") ?? url;
    }

    if (url.startsWith("https://imgur.com/gallery/")) {
        url = "https://imgur.com/a/" + url.substring("https://imgur.com/gallery/".length);
    }

    if (
        url.startsWith("https://postimg.cc/") ||
        url.startsWith("https://www.flickr.com/") ||
        url.startsWith("https://imgur.com/") ||
        url.startsWith("https://gfycat.com/")
    ) {
        try {
            // <meta property="og:video" content="https://i.imgur.com/Xob3epw.mp4"/>
            // <meta property="og:image" content="https://i.imgur.com/I42mS3H.jpg?fb" />
            let res = await (await fetch(url, { redirect: "follow" })).buffer();
            let ch = cheerio.load(res);

            var elem = ch("head meta[property='og:video']");
            if (elem) {
                url = elem.attr("content") ?? url;
            } else {
                elem = ch("head meta[property='og:image']");
                if (elem) url = elem.attr("content") ?? url;
            }

            logger("unpackUrl: extracted imgur/postimg url", url);
        } catch (ex) {
            logger("unpackUrl: could not extract imgur/postimg image", ex);
        }
    }
    return url;
}

function isImageUrl(url: string): boolean {
    // Remove query string
    let i = url.indexOf("?");
    if (i > 0) {
        url = url.substring(0, i);
    }
    return (
        url.endsWith(".gif") ||
        url.endsWith(".png") ||
        url.endsWith(".jpg") ||
        url.startsWith("https://i.redd.it/") ||
        url.startsWith("https://i.postimg.cc/")
    );
}

function isVideoUrl(url: string): boolean {
    // Remove query string
    let i = url.indexOf("?");
    if (i > 0) {
        url = url.substring(0, i);
    }
    return (
        url.endsWith(".gif") ||
        url.endsWith(".gifv") ||
        url.endsWith(".mp4") ||
        url.startsWith("https://v.redd.it/") ||
        url.startsWith("http://clips.twitch.tv/") ||
        url.startsWith("https://clips.twitch.tv/") ||
        url.startsWith("https://twitter.com/") ||
        url.startsWith("https://gfycat.com/")
    );
}

function numberToEmojiNumber(num: number, small: boolean = false) {
    var out = "";
    if (small) {
        if (num === 0) {
            out = "🔹";
        } else if (num < 0) {
            out = "🔻";
        } else {
            out = "🔺";
        }
        out += num;
    } else {
        if (num === 0) {
            out = "⏺️ ";
        } else if (num < 0) {
            out = "⬇️ ";
            num = -num;
        } else {
            out = "⬆️ ";
        }
        const str = num + "";
        for (var i = 0; i < str.length; i++) {
            //if ((str.length - i) % 3 == 0) out += ".";
            out += String.fromCodePoint(str.codePointAt(i)!) + "\u20E3";
        }
    }
    return out;
}

function truncateString(str: string, maxLength: number) {
    const TRUNCATOR = "...";
    if (str.length > maxLength - TRUNCATOR.length) return str.substring(0, maxLength - TRUNCATOR.length) + TRUNCATOR;
    else return str;
}
``
