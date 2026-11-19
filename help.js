module.exports = {
    ban: {
        summary: 'ban a user and keep a transcript of their last 7 days',
        syntax: 'ban <user> [duration] [--urgent] [--rule <id>] [reason]',
        desc: 'bans a user.\ntheir last 7-days\' messages aren\'t deleted instantaneously. a transcript (.txt) of them is posted to the citation-logs, then the staff is asked whether to archive the attachments (option validity: 24h), and the messages are deleted after that. specify [duration] for tempban. reply to a message to skip the <user>. `--urgent` is for potentially illegal / heavily problematic content: the last 7 days are purged instantaneously and nothing is saved.',
        perm: 'Ban Members'
    },
    kick: {
        summary: 'kick a user and record an infraction',
        syntax: 'kick <user> [--rule <id>] [reason]',
        desc: 'kicks a user.\nthe user is removed from the server and an infraction is recorded. their messages are kept, and they can rejoin with a new invite. cite a rule with [--rule <id>], or give a [reason].',
        perm: 'Kick Members'
    },
    softban: {
        summary: 'ban and unban at once to clear a user\'s recent messages',
        syntax: 'softban <user> [--rule <id>] [reason]',
        desc: 'softbans a user.\nthe user is banned and unbanned in one step, so they can rejoin. their last 7-days\' messages are handled the same way as `ban`: transcript to the citation-logs, staff decides on the attachments (option validity: 24h), then deletion. recorded as a softban. a ban lifted by hand within a minute is recorded as one too.',
        perm: 'Ban Members'
    },
    mute: {
        summary: 'time a user out',
        syntax: 'mute <user> [duration] [--rule <id>] [reason]',
        desc: 'mutes a user.\ndiscord\'s timeout is applied for [duration], or until lifted when none is given. a timeout can\'t exceed 28 days, so it is re-applied until the duration ends. aliases: `m`, `timeout`.',
        perm: 'Timeout Members'
    },
    unmute: {
        summary: 'lift a user\'s timeout',
        syntax: 'unmute <user>',
        desc: 'unmutes a user.\nthe timeout is removed and the open mute infraction is closed, so it stops being renewed. alias: `untimeout`.',
        perm: 'Timeout Members'
    },
    purge: {
        summary: 'delete the latest messages in this channel',
        syntax: 'purge <count> [user ...]',
        desc: 'deletes recent messages.\nthe latest <count> messages are removed (max 1000), optionally only those from up to 10 users. as a reply, `purge` deletes from the replied message through the command itself. messages under 14 days old go in bulk, older ones one by one (slower). ranges over 200 need confirmation, and the purge is logged before anything is deleted.',
        perm: 'Manage Messages'
    },
    cite: {
        summary: 'cite a rule against a message',
        syntax: 'cite <rule id>\ncite custom <reason>',
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
        syntax: 'infraction view <id>\ninfraction user <user>\ninfraction moderator <user>\ninfraction recent\ninfraction add <user> [rule|custom] [duration] [reason]\ninfraction edit <id> <reason>\ninfraction void <id> <reason>\ninfraction restore <id>\ninfraction delete <id>',
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
        summary: 'show or change the two auto-purges',
        syntax: 'autopurge\nautopurge commands on|off\nautopurge parent on|off',
        desc: 'auto-deletes after use.\ntwo per-server switches. `commands` deletes the command and its reply once it has run, except for commands that only show information. `parent` deletes the cited message once it has been logged.',
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
    timezone: {
        summary: 'set the time zone the bot uses for this server',
        syntax: 'timezone\ntimezone <zone>\ntimezone reset',
        desc: 'sets the server time zone.\ntimes written into text, like the purge preview, are shown in it. discord timestamps follow each reader\'s own zone. <zone> is an offset like `UTC+5:30` or `-4`, or a name like `Asia/Kolkata`. `reset` goes back to the default. alias: `tz`.',
        perm: 'Manage Channels'
    },
    rule: {
        summary: 'manage this server\'s rules',
        syntax: 'rule list\nrule remove <id>',
        desc: 'lists or removes rules.\nrules are stored per server, and every infraction keeps a snapshot of the rule text from when it was recorded. use `/rule add` to add one.',
        perm: 'Manage Channels'
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
