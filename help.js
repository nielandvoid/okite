module.exports = {
    ban: {
        summary: 'ban a user and keep a transcript of their last 7 days',
        syntax: 'ban <user> [duration] [--urgent] [--silent] [--rule <id>] [reason] [--mn <note>]',
        desc: 'bans a user.\nwith ban cleanup on (the default, see `bancleanup`) a transcript (.txt and .md) of their messages from every channel is posted to the log channel, their attachments are archived there, and the messages are deleted from chat. specify [duration] for tempban. reply to a message to skip the <user>. `--urgent` is for potentially illegal / heavily problematic content: the ban lands first, their newest messages are deleted at once and the rest of the window right after, and nothing is saved or logged.',
        perm: 'Ban Members'
    },
    kick: {
        summary: 'kick a user and record an infraction',
        syntax: 'kick <user> [--silent] [--rule <id>] [reason] [--mn <note>]',
        desc: 'kicks a user.\nthe user is removed from the server and an infraction is recorded. their messages are kept, and they can rejoin with a new invite. cite a rule with [--rule <id>], or give a [reason].',
        perm: 'Kick Members'
    },
    softban: {
        summary: 'ban and unban at once to clear a user\'s recent messages',
        syntax: 'softban <user> [--silent] [--rule <id>] [reason] [--mn <note>]',
        desc: 'softbans a user.\nthe user is banned and unbanned in one step, so they can rejoin. their last 7-days\' messages are handled the same way as `ban`: transcript to the citation-logs, staff decides on the attachments (option validity: 24h), then deletion. recorded as a softban. a ban lifted by hand within a minute is recorded as one too.',
        perm: 'Ban Members'
    },
    mute: {
        summary: 'time a user out',
        syntax: 'mute <user> [duration] [--silent] [--rule <id>] [reason] [--mn <note>]',
        desc: 'mutes a user.\ndiscord\'s timeout is applied for [duration], or until lifted when none is given. a timeout can\'t exceed 28 days, so it is re-applied until the duration ends. aliases: `m`, `timeout`.',
        perm: 'Timeout Members'
    },
    unban: {
        summary: 'lift a ban',
        syntax: 'unban <user> [reason]',
        desc: 'unbans a user by mention or id, and closes their open ban infraction so a timed ban stops counting. refuses when they aren\'t banned. alias: `pardon`.',
        perm: 'Ban Members'
    },
    setnick: {
        summary: 'change a member\'s nickname',
        syntax: 'setnick <user> <nickname>',
        desc: 'sets a member\'s server nickname. with no nickname it changes nothing. `reset` clears it. the user can be a mention, an id, or a name okite will confirm. reply to their message to skip <user>. alias: `nick`.',
        perm: 'Manage Nicknames'
    },
    modmail: {
        summary: 'remote tickets: members talk to the mods through okite\'s DMs',
        syntax: 'modmail\nmodmail setup #channel [server] [noping]\nmodmail off\nmodmail greeting <text|reset>\nmodmail closing <text|reset>\nmodmail block|unblock @user\nmodmail open @user <message>',
        desc: 'a member DMs okite (or uses `/modmail open` there), picks the server, and a remote-ticket opens. their first message only brings up that prompt. after that, everything they send goes to a ticket thread in the modmail channel, where a card shows who they are, and their infractions.\nin the thread, the member\'s messages and your replies build up in one card per round. `reply` answers them as the server (`modreply` signs it with your name), and plain messages stay between mods. the member sees nothing while they type. each reply sends them one card with what they wrote and your answer, and a second reply before they write again replaces that card.\nmembers end a ticket by typing `close` or with `/modmail close`, and pick which server they are talking to with `/modmail switch`. you end it with `close`. closing locks the thread and logs a transcript. alias: `mm`.',
        perm: 'Manage Messages (setup: Manage Channels)'
    },
    reply: {
        summary: 'answer a modmail ticket',
        syntax: 'reply <message>\nmodreply <message>',
        desc: 'sends your message to the user of the modmail ticket you are in, with any files attached, as the server with its name and icon. `modreply` sends it with your name and picture instead. aliases: `r`, `mr`.',
        perm: 'Manage Messages'
    },
    close: {
        summary: 'close a modmail ticket',
        syntax: 'close [reason] [--silent]',
        desc: 'closes the modmail ticket you are in. the user gets the reason by DM unless you add `--silent`. the thread is locked and a transcript goes to the log.',
        perm: 'Manage Messages'
    },
    slowmode: {
        summary: 'set or revert a channel\'s slowmode',
        syntax: 'slowmode <time> [#channel]\nslowmode revert [#channel]',
        desc: 'sets slowmode to a time like `5s`, `10s`, `2m`, `1h` (up to 6 hours), or `off`. `revert` goes back to the slowmode the channel had before the last change, or to none if okite has no record of one. the previous value is kept in memory until okite restarts. [#channel] defaults to the current one. alias: `slow`.',
        perm: 'Manage Channels'
    },
    sendmessage: {
        summary: 'send a message as okite in a channel',
        syntax: 'sendmessage #channel [message]',
        desc: 'sends a message as the bot. you need to be able to send messages in that channel yourself. mentions in it do not ping. every use is written to the moderation log. alias: `say`.\nto relay pictures, videos or other files, attach them to your own message (up to 10 with the prefix form, 3 with `/sendmessage`); okite uploads them again in the channel with your text, and the text is optional when there is a file. you need to be able to attach files there yourself, and the total has to fit the server\'s upload limit.',
        perm: 'Manage Messages'
    },
    unmute: {
        summary: 'lift a user\'s timeout',
        syntax: 'unmute <user> [--silent] [reason] [--mn <note>]',
        desc: 'unmutes a user.\nthe timeout is removed and the open mute infraction is closed, so it stops being renewed. alias: `untimeout`.',
        perm: 'Timeout Members'
    },
    purge: {
        summary: 'delete the latest messages in this channel',
        syntax: 'purge <count> [user ...]',
        desc: 'deletes recent messages.\nthe latest <count> messages are removed (max 1000), optionally only those from up to 10 users, given as mentions, ids or names (a name asks you to confirm who you meant). as a reply, `purge` deletes from the replied message through the command itself. messages under 14 days old go in bulk, older ones one by one (slower). ranges over 200 need confirmation, and the purge is logged before anything is deleted.',
        perm: 'Manage Messages'
    },
    'obliterate': {
        summary: 'delete everything a user has sent, in every channel',
        syntax: 'obliterate <user>',
        desc: 'deletes every message from one user that okite can reach: all channels, threads and voice chats, all the way back.\nit asks you to confirm first, writes to the log channel before anything is deleted, and posts a transcript when it ends. messages under 14 days old go in bulk, older ones one at a time, so a large server can take hours. you can stop it from the progress message. only one runs per server at a time. works as a prefix command too: `!obliterate @user`, or as a reply to one of their messages. there the confirm and progress messages are visible in the channel, not private.',
        perm: 'Manage Messages'
    },
    cite: {
        summary: 'cite a rule against a message',
        syntax: 'cite <rule id> [--silent] [--mn <note>]\ncite custom <reason> [--silent] [--mn <note>]',
        desc: 'cites a rule against a message.\nused as a reply. the message, its attachments and the specified rule are logged to the citation-logs, an infraction is recorded for the author, then the message is deleted (unless `autopurge parent` is off). nothing is deleted before the log write succeeds.',
        perm: 'Manage Messages'
    },
    lock: {
        summary: 'stop members sending messages in a channel',
        syntax: 'lock [#channel]',
        desc: 'locks a channel.\nsend messages (and in threads) is denied for @everyone and every role with an explicit allow there, and the changed roles are recorded. [#channel] defaults to the current one.',
        perm: 'Manage Channels'
    },
    unlock: {
        summary: 'let members send messages in a channel again',
        syntax: 'unlock [#channel]',
        desc: 'unlocks a channel.\nsend messages is restored for the roles `lock` recorded. [#channel] defaults to the current one.',
        perm: 'Manage Channels'
    },
    infraction: {
        summary: 'view and manage recorded infractions',
        syntax: 'infraction view <id>\ninfraction user <user>\ninfraction moderator <user>\ninfraction recent\ninfraction add <user> [rule|custom] [duration] [--silent] [reason] [--mn <note>]\ninfraction edit <id> <reason>\ninfraction void <id> <reason> [--silent] [--mn <note>]\ninfraction restore <id>\ninfraction delete <id> [--silent] [--mn <note>]',
        desc: 'views and manages infractions.\neach server numbers its own, from #1. `user` lists what was done to a member, `moderator` lists what a moderator issued, `recent` lists the latest in the server. `void` keeps an infraction on record but stops it counting, `restore` undoes that. `delete` removes one for good after a confirmation, and writes it to the citation-logs first; its number is not reused. aliases: `infractions`, `inf`, `history`.',
        perm: 'Manage Messages'
    },
    alias: {
        summary: 'make your own commands that run other commands',
        syntax: 'alias add <name> <command...>\nalias remove <name>\nalias list',
        desc: 'makes your own commands.\na command word is defined that expands to another command before it runs, e.g. `alias add warn infraction add`. `$1` to `$9` are the words typed after it, `$*` is all of them. placeholders written as <user> or <duration> take the next word typed, and <reason...> takes the rest.',
        perm: 'Manage Channels'
    },
    setlog: {
        summary: 'choose where each kind of log is sent',
        syntax: 'setlog <#channel> [general|citation|purge|moderation|messages|members|voice|server]\nsetlog reset [type]',
        desc: 'routes a log type to a channel.\nunset types fall back to `general`, and `general` is the default when [type] is omitted. `reset` clears one. the channel must be a text channel that can be written to.',
        perm: 'Manage Channels'
    },
    logchannels: {
        summary: 'show which channel each log type goes to',
        syntax: 'logchannels',
        desc: 'shows the log channels.\nevery log type is listed with the channel it resolves to, including the `general` fallback.',
        perm: 'Manage Channels'
    },
    prefix: {
        summary: 'show or change the prefix for prefix commands',
        syntax: 'prefix\nprefix set <prefix>\nprefix reset',
        desc: 'shows or changes the prefix.\n`prefix set <prefix>` takes 1 to 5 characters, `prefix reset` goes back to the default. per server.',
        perm: 'Manage Channels'
    },
    autopurge: {
        summary: 'show or change the auto-purges',
        syntax: 'autopurge\nautopurge commands on|off\nautopurge parent on|off\nautopurge result on|off',
        desc: 'auto-deletes after use.\nthree per-server switches. `commands` deletes the command and its reply once it has run, except for commands that only show information. `parent` deletes the cited message once it has been logged. `result` deletes only the bot\'s "purged N messages." reply, about 5 seconds after a `!purge`, and works on its own.',
        perm: 'Manage Channels'
    },
    autocorrect: {
        summary: 'run mistyped commands when they can only mean one thing',
        syntax: 'autocorrect\nautocorrect on|off',
        desc: 'fixes mistyped commands.\nwhen on, a mistyped command word runs if exactly one command fits, and the correction is shown. only command and subcommand words are corrected, never users, ids, rules or reasons.',
        perm: 'Manage Channels'
    },
    requirerule: {
        summary: 'require a rule for every moderation action',
        syntax: 'requirerule\nrequirerule on|off',
        desc: 'makes a rule compulsory.\nwhen on, `ban`, `kick`, `softban`, `mute` and `infraction add` need a rule id, or `custom` with a reason. when off (the default), the rule is optional and none is recorded as custom. per server.',
        perm: 'Manage Channels'
    },
    userdms: {
        summary: 'DM users when a moderator acts on them',
        syntax: 'userdms\nuserdms on|off\nuserdms <ban|kick|mute|unmute|warn|cite|void> on|off\nuserdms moderator on|off',
        desc: 'notifications to the member, on by default (turn them off with `userdms off`). when on, okite DMs a member when they are banned, softbanned, kicked, muted, unmuted or warned, when their mute ends, when one of their messages is cited, or when an infraction against them is voided or deleted, with the server, what happened, the reason, the rule, how long, and the infraction number.\nthe slash form is `/userdms enabled:true`, `/userdms action:ban send:false` and `/userdms show_moderator:true`. the moderator\'s name is hidden unless you turn it on. add `--silent` (or `-s`) to a command, or `silent:true` on the slash form, to skip the DM for that one action. add `--mn <note>` or `--modnote <note>` (it takes the rest of the line, so put it last) or `modnote` on the slash form to put a note from the moderator in the DM; it also shows in that action\'s log. the DM goes out before a ban or kick, so it can still be delivered. if their DMs are closed, the moderator is told. alias: `dms`.',
        perm: 'Manage Channels'
    },
    watchdog: {
        summary: 'catch compromised accounts spamming the same message',
        syntax: 'watchdog\nwatchdog on|off\nwatchdog channels <2-10>\nwatchdog seconds <5-300>\nwatchdog mute <duration>',
        desc: 'on by default. when someone who is not staff posts the same message, with a link, a file, or 20+ characters, in 3 channels within 30 seconds, okite times them out for a day, deletes the copies, records an infraction, DMs them to secure their account, and logs it, pinging the mod role (see `modrole`).\nchange how many channels, how many seconds and how long the timeout is with the options. the usual case is a hijacked account posting a scam image everywhere.',
        perm: 'Manage Channels'
    },
    honeypot: {
        summary: 'set a trap channel that bots post in and people do not',
        syntax: 'honeypot\nhoneypot #channel [softban|ban|mute]\nhoneypot invite on|off\nhoneypot off',
        desc: 'anyone who is not staff and posts in the honeypot channel is softbanned by default (banned and unbanned, which removes their messages from the last day), or banned, or muted for a day. the message is deleted, an infraction is recorded and it is logged. name the channel something nobody should type in, and tell members not to.\nwith `invite on` (off by default), a softban DM includes a one-use invite that lasts 7 days, since the account was most likely compromised.',
        perm: 'Manage Channels'
    },
    appeals: {
        summary: 'let members appeal bans, mutes, kicks and warnings from their DM',
        syntax: 'appeals\nappeals setup #channel\nappeals off\nappeals add <question> | <hint>\nappeals remove <number>\nappeals block @user\nappeals unblock @user',
        desc: 'when on, the DM for a ban, mute, kick or warning gets an Appeal button. it opens a form titled like "r/Server - Appeal Ban" with the server\'s questions (up to 7, each up to 45 characters with an optional hint; `{action}` in a question becomes banned, muted, kicked or warned). with no questions of its own, each action gets two default questions worded for it. the answers are posted in the appeal channel with the infraction and Accept / Deny / Deny + Block buttons for anyone with Ban Members. accept lifts the ban or mute, voids the infraction and DMs them; deny DMs them with an optional note, and they can appeal that action again after 7 days; deny and block also stops them appealing at all (undo with `appeals unblock`). appeals need the action\'s DM on (`userdms`), and a --silent action has no appeal button. alias: `appeal`.',
        perm: 'Manage Channels'
    },
    modrole: {
        summary: 'pick the role pinged on urgent alerts',
        syntax: 'modrole\nmodrole @role\nmodrole off',
        desc: 'sets a role that okite pings on alerts that need someone now: a compromised account caught by the watchdog, and the save-attachments prompts after a ban.',
        perm: 'Manage Channels'
    },
    bancleanup: {
        summary: 'clear a banned user\'s messages once their transcript is built',
        syntax: 'bancleanup\nbancleanup on|off [days]',
        desc: '**on by default.** when on, `ban` and `softban` build a transcript and archive the attachments in the log channel from the last [days] days (7 by default, up to 30) of the user\'s messages in every channel, then delete those messages from chat right away. the log channel gets a card with **archive** and **erase** buttons, for anything that should not have been saved. when off, their messages stay up until staff answer the save prompt. `ban --urgent` is unchanged and deletes without saving anything.',
        perm: 'Manage Channels'
    },
    messagelogs: {
        summary: 'turn message edit / delete logs and ban transcripts on or off',
        syntax: 'messagelogs\nmessagelogs on|off',
        desc: 'turns message logging on for this server. it is **off by default**.\nwhen on, okite keeps a 72 hour copy of messages so edits and deletes can be logged with their text, and indexes message ids for ban transcripts. when off, nothing is stored, edits and deletes are not logged, and a ban has no transcript. per server.',
        perm: 'Manage Channels'
    },
    timezone: {
        summary: 'set the time zone the bot uses for this server',
        syntax: 'timezone\ntimezone <zone>\ntimezone reset',
        desc: 'sets the server time zone.\ntimes written into text, like the purge preview, are shown in it. discord timestamps follow each reader\'s own zone. <zone> is an offset like `UTC+5:30` or `-4`, or a name like `Asia/Kolkata`. `reset` goes back to the default. alias: `tz`.',
        perm: 'Manage Channels'
    },
    perms: {
        summary: 'set or clear a role\'s permissions across a category',
        syntax: '/perms set <category> <role>\n/perms clear <category> <role>',
        desc: '`set` opens a card where you pick where (the whole category, the category only, or some of its channels) and which permissions to allow or deny. permissions you leave out stay as they are. `clear` removes the role\'s permissions from the category and every channel in it, after you confirm. slash only, since it needs menus.',
        perm: 'Administrator'
    },
    rule: {
        summary: 'manage this server\'s rules',
        syntax: 'rule list\nrule remove <id>',
        desc: 'lists or removes rules.\nrules are stored per server, and every infraction keeps a snapshot of the rule text from when it was recorded. use `/rule add` to add one.',
        perm: 'Manage Channels'
    },
    'security-audit': {
        summary: 'audit the server\'s roles, channels and settings',
        syntax: 'security-audit',
        desc: 'audits the server for risky configuration and sends the result only to you, with the full report attached.\nflags roles that hold escalated permissions (split by whether they sit below or above okite), Administrator roles, roles that can hand out an Administrator role, other bots with Administrator, and @everyone permissions. also checks staff and log channels visible to everyone, overrides that delegate management, channels that open up a private category, the verification level, explicit media filter, 2FA, invites, webhooks and the widget. aliases: `audit`, `securityaudit`.',
        perm: 'Manage Server'
    },
    ping: {
        summary: 'show latency to discord and the database, and uptime',
        syntax: 'ping',
        desc: 'shows latency and uptime.\nwebsocket heartbeat, discord api round trip, database latency (supabase and mongodb), and time since the last start.',
        perm: 'Manage Messages'
    },
    help: {
        summary: 'list every command, or explain one',
        syntax: 'help [command]',
        desc: 'lists the commands.\nevery command is listed by group, or with [command], its syntax, description and required permission.',
        perm: 'Manage Messages'
    }
};
