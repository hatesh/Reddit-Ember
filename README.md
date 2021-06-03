# Reddit Ember

*Reddit Ember is a lightweight discord bot for embedding the content of a reddit post into a channel as unobtrusively as possible.*

*It started out as a stripped down fork of [codestix's reddit bot](https://github.com/CodeStix/reddit-discord-bot), available on [top.gg](https://top.gg/bot/711524405163065385).*

## Server Settings

One of the key differences between Ember and Reddit Bot is the options to customise the integration on a server basis. 

There are a few options available for customisation, including:

| Setting                     | Description                                                  | Values   | Default |
| --------------------------- | ------------------------------------------------------------ | -------- | ------- |
| Post Summary                | Ember can create a message that describes the post from the linked shared, in a well formatted. | On / Off | Off     |
| Summary Comments            | Ember can optionally include the top two comments from the post into the summary post. | On / Off | Off     |
| Automatic Embed Suppression | Ember can delete the small embed that is sometimes added the the users message including the reddit link. This is best used when combined with the `Post Summary` Setting. | On / Off | Off     |

## Commands 

*By Default, the prefix for commands is `r/`*

| Command     | Description                                                  | Parameter(s)  | Example(s)                  |
| ----------- | ------------------------------------------------------------ | ------------- | --------------------------- |
| Help        | Shows the list of available commands in a discord message.   |               | `r/help`                    |
| Permissions | Displays whether any permissions are missing on the bot for optimal functionality |               | `r/permissions` `r/perm`    |
| Settings    | Displays the current settings for the discord server         |               | `r/settings`                |
| Summary     | Specify whether Ember should show a post description         | `on` or `off` | `r/summary on` `r/sum off`  |
| Comments    | Specify whether Ember should include comments into the post description | `on` or `off` | `r/comments on` `r/com off` |
| Suppress    | Specify whether Ember should remove auto embeds on user messages | `on` or `off` | `r/comments on` `r/com off` |

