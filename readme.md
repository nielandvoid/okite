# Okite 掟
![visual](okite_visual.png)
server-wide moderation stack / toolkit for discord

built with node and discord.js.

## features
- `lookup` message context menu command (cites server rules directly on target messages)
- custom modal input support for manual staff notices
- clean multiline blockquote formatting (`>>>`) with zero line gaps
- `mark / purge range` context menu command (stateless 2-click range purging)
- `/ban user [reason] [urgent]`: bans immediately. with `/bancleanup` on (the default) okite posts a transcript and archives the attachments in the log channel, then deletes their messages from every channel; with it off the messages stay until staff answer the save prompt. `urgent` is for illegal content (report it to Discord and your national hotline): the ban lands first, then their newest messages are deleted at once and the rest of the window right after, in parallel, and nothing is saved, logged or kept in the message index or cache. bans made outside `/ban` still get a transcript of whatever is left. with no log channel set there is nowhere to put a transcript, so the ban reply asks whether to **leave** their messages or **purge** them without one
- `reply` context menu command (posts a staff reply as the bot, logged to the audit channel)
- `/setlog channel [type]` sets where each kind of log goes: `general` (fallback for everything), `citation`, `purge`, `moderation` (bans, kicks, locks, staff replies), `messages` (edits and deletes), `members` (joins, leaves, role / nickname / timeout changes), `voice`, `server` (channel / role changes, rules). any type left unset uses the general channel. `/setlog reset:true type:<type>` clears one. `/logchannels` shows what is set
- `/rule add|remove|list` to manage per-server rules (requires MongoDB)
- `/lock` and `/unlock` to lock a channel and restore the previous permissions exactly
- numbered infractions (requires Supabase): every rule citation is recorded as `infraction #N` (per server) with the cited text and re-hosted evidence
- `/infraction view|user|moderator|recent|add|edit|void|restore|delete` (`add` needs a rule or `custom`; a rule's text is stored with the infraction and the reason is kept alongside, defaulting to "not specified"; rule ids and infraction numbers autocomplete) to track history per user and per moderator. voided infractions stay on record but aren't counted

`/purge count [user1] [user2] [user3]` deletes the latest messages (up to 1000) in the current channel, with the same transcript-first logging and 200-message confirmation as the other purges. there is no cooldown beyond Discord's own rate limits. the right-click `mark / purge range` menu is still there for ranges.

## prefix commands
most commands also work with a prefix (default `!`, change it per server with `/prefix set` or `!prefix set <prefix>` (`reset` goes back to the default, no argument shows the current one); the default comes from `PREFIX` in `.env`; without MongoDB the prefix is stored in `config.json` and applies to every server): `!ban @user [--urgent] [reason]`, `!infraction view|user|moderator|recent|add|edit|void|restore`, `!lock`, `!unlock`, `!setlog`, `!rule list|remove`, and `!cite <rule id>` / `!cite custom <reason>` sent as a reply to the message you want to cite. `!help` lists them. like Sapphire, you can act by replying to a message: `!ban [reason]`, `!infraction user`, `!infraction moderator` and `!infraction add <reason>` use the replied-to author when you leave out the user, `!purge <count> [user ...]` deletes the latest messages (up to 1000, optionally only from up to 10 users, e.g. `!purge 200 @a @b`, scanning at most 3000 back), and `!purge` as a reply deletes everything from that message through your command. both use the same transcript-first logging and 200-message confirmation as the range purge. permissions are the same as the slash commands. there is no private reply for a normal message, so by default prefix commands and the bot's replies stay in the channel. **autocorrect** (opt-in, `/autocorrect enabled:true` or `!autocorrect on`): a mistyped prefix command word runs anyway when exactly one command or subcommand fits (`!infracton view 5`, `!purg 5`, `!infraction mod @x`), with a note saying what it was corrected to; if it could mean several, okite asks which. only command words are ever corrected, never users, rules, ids or reasons. common aliases (`!infractions`, `!inf`, `!history @user`, `!rule rm r1`) always work, even with autocorrect off. there are three independent **auto-purges** (`/autopurge target:<commands|parent|result> enabled:<bool>` or `!autopurge commands|parent|result on|off`, `!autopurge` shows them): **commands** (off by default) deletes your prefix command and the bot's reply the moment it has run, and **result** (off by default) deletes only the bot's "purged N messages." reply about 5 seconds after a `!purge`, and **parent** (on by default) deletes the message being cited or infractioned once it has been logged, for `lookup`, `!cite` and `!infraction add` sent as a reply. deletions show up in the message delete log.  context-menu actions (mark / purge range, reply) and `/rule add` stay slash / right-click only.

- `/requirerule [enabled]` (or `!requirerule on|off`): opt-in per server. when on, `ban`, `kick`, `softban`, `mute` and `infraction add` need a rule id, or `custom` with a reason, and are refused without one. when off (the default) the rule is optional and none is recorded as custom. no option shows the current state.
- prefix commands that take a user also accept a plain name: `!ban nielandvoid`, `!mute niel 1h`, `!unban niel`. okite matches it against usernames, display names and nicknames (and banned users for `!unban`), then asks "are you perhaps referring to X?" with no ping. when several people fit about equally well (up to 5) it lists them with their ids and asks which one: the same moderator answers `1` to `5` or `n` in chat, or with the buttons. a single suggestion is answered `y` / `n`. answers are taken for 60 seconds. nothing runs without a yes. it only applies when the command is not a reply to a message.
- `/setnick user [nickname]` (`!setnick <user> <nickname>`, Manage Nicknames): changes a member's nickname, `reset` clears it, and with no nickname it says "no nick / display-name passed. nothing changed." and changes nothing. the user can be a plain name (see above).
- `/slowmode set <time> [channel]` and `/slowmode revert [channel]` (`!slowmode 5s`, `!slowmode revert`, Manage Channels): sets slowmode to a time like `5s`, `10s`, `2m`, up to 6h, or `off`. `revert` goes back to the slowmode from before the last change, or to none when okite has no record (the previous value lives in memory until a restart).
- `/sendmessage channel message` (`!sendmessage #channel message`, Manage Messages): okite sends the message. you need to be able to send in that channel yourself, mentions in it do not ping, and each use is written to the moderation log.
- `/bancleanup [enabled] [days]` (or `!bancleanup on|off 7`): **on by default** (Manage Channels). when on, `ban` and `softban` read the last [days] days (7 by default, up to 30) of the user's messages in every channel the bot can read, post a transcript and archive the attachments in the log channel, then delete those messages from chat right away. the log channel gets a card with archive / erase buttons, so staff can drop an archive that should not have been saved. it works without `/messagelogs`. when off, their messages stay up until staff answer the save prompt. `ban --urgent` still deletes immediately and saves nothing.
- `/messagelogs [enabled]` (or `!messagelogs on|off`): **off by default**, opt-in per server (Manage Channels). when on, okite keeps a 72 hour copy of messages so edits and deletes are logged with their text, and indexes message ids so a ban can build a transcript. when off, none of that is stored or logged, and a ban makes no transcript. servers that used okite before this setting existed need to turn it on once. no option shows the state.
- looks: logs, infraction cards and history, help and the ban prompt use Discord's container layout (colour bar, separators, quoted code blocks, buttons), with okite's icon and `okite_visual.png` as the help banner. set `CONTAINERS=off` in `.env` to go back to classic embeds everywhere.
- purge logs: a plain-text preview of the purged messages (whole messages, up to `PURGE_PREVIEW_CHARS`, default 2600, at most 3000, then `… and N more in the transcript`) and the full transcript attached as `.txt` and `.md`, all in one message. the time before each preview line is monospace so names line up; it uses the server's time zone, set with `/timezone UTC+5:30` (or `!timezone`, `-4`, or a name like `Asia/Kolkata`; `reset` clears it). `LOG_TIMEZONE` in `.env` is the default for servers that have not set one, and UTC when neither is set. the zone is used for times written into text (the purge preview); Discord timestamps, like the dates in infraction history, follow each reader's own time zone. without MongoDB the setting is one value for the whole bot.

## ban, kick, softban, mute
- `/ban user [duration] [rule] [reason] [urgent]` (`!ban @user [duration] [--urgent] [--rule r4] [reason]`): with a duration the ban lifts itself when it expires; without one it is permanent. their messages are handled by ban cleanup as described above.
- `/kick user [rule] [reason]`, `/softban user [rule] [reason]` (bans then unbans straight away to clear their messages, through the same transcript flow), `/mute user [duration] [rule] [reason]`, `/unmute user`, `/unban user [reason]` (a mention or an id; refuses when they aren't banned). prefix: `!kick`, `!softban`, `!mute @user 1h reason`, `!unmute`, `!unban`. `ban` and `softban` refuse a user who is already banned.
- durations: `30m`, `12h`, `7d`, `2w`, `1d12h`, or `permanent` (the default). `/infraction add` takes one too: `!infraction add @user r4 7d reason` or `... r4 reason 7d`.
- mutes use Discord timeouts, which stop at 28 days, so okite renews longer and permanent mutes automatically, puts the mute back if the user leaves and rejoins, and ends it when you `/unmute` or remove the timeout by hand. expired bans and mutes are lifted by a check that runs every minute, even after a restart.
- every one of these is recorded as an infraction (kick, softban, mute and ban types) and shows up in `/infraction user`. kick needs **Kick Members**, mute and unmute need **Timeout Members**, ban and softban need **Ban Members**.
- timed bans and mutes need the extra columns in `db/infractions_duration.sql`. without them everything still works, but nothing expires by itself.

## restarts and backups
okite keeps its working memory in a second place so a crash or restart doesn't lose things:
- **message cache:** the last 72 hours of messages (text, author, attachment details; bots excluded) are written to the `message_cache` table in small batches (run `db/message_cache.sql`). when a message is deleted or edited and discord.js no longer remembers it (it was sent before a restart, or long ago), the delete and edit logs fill in the author and text from this copy. rows older than 72 hours are pruned automatically.
- **disk spool:** anything still waiting to be written (a few seconds of messages, or more if the database is down) is saved to `data/spool.json` on exit, and on `SIGINT` / `SIGTERM` after one last flush. the next start reads it back and writes it to the database. a hard kill or power loss can lose the last few seconds.
- **purge marks:** the first click of `mark / purge range` is saved to `data/state.json` and restored (marks older than 6 hours are dropped).
- settings, infractions, timed bans and mutes, and the pending ban prompts already live in the database, so they survive restarts as before. set `OKITE_DATA_DIR` to keep `data/` somewhere else.
- not recoverable: things that happen while okite is offline (deletes, edits, joins) can't be logged afterwards.

## catch-up after downtime
when okite starts it checks what it missed while it was offline and logs it, each entry marked "(while offline)".
- bans, unbans, kicks, timeouts and role changes made in Discord are read back from the audit log, with who did them and why. a ban made by hand is also recorded as an infraction and gets the usual transcript, unless okite had already recorded it just before stopping.
- channels and roles that were created, deleted or renamed are found by comparing against a snapshot taken every 5 minutes (and on a clean shutdown). the change in member count is noted too.
- messages from the last 24 hours that are gone from their channels are logged with author and text, as a transcript file if there are more than 5 in one channel. edited ones are logged with before and after, and messages sent during the gap are stored so they can be logged later.
- a summary in the general log channel says how long okite was down, what it found and what it couldn't check.

okite knows when it went down from a heartbeat written every 15 seconds (and on a clean shutdown) to the database and `data/state.json`. run `db/catch_up.sql` for the database part. restarts under 30 seconds are skipped.

some things can't be recovered. Discord doesn't record joins and leaves, and a message sent and deleted while okite was off was never seen. an event in the 15 seconds before a crash may show up twice, and a message missing from a channel is reported as deleted even if something else removed it. each server is limited to 300 Discord requests per catch-up.

in `.env`, `CATCHUP=off` turns it off, `CATCHUP_MIN_GAP_SECONDS` (default 30) sets the shortest downtime worth checking, and `CATCHUP_MAX_REQUESTS` (default 300) caps the requests.

## ping
`/ping` (anyone) or `!ping` (staff) shows the websocket heartbeat from Discord, how long a reply takes to reach Discord, how long a database query takes (Supabase and MongoDB, whichever are set up), and how long okite has been running. a high api or database number is where slow commands come from.

## aliases
an alias is a prefix command you define that runs another command. `!alias add warn infraction add` makes `!warn @user r4 spamming` do what `!infraction add @user r4 spamming` does, and `!alias add unwarn infraction void` makes `!unwarn 12 reason` void infraction 12. `!alias list` shows them and `!alias remove <name>` deletes one. `/alias` does the same and needs Manage Channels.
- whatever you type after the alias is added to the end of the command. to put it somewhere else use `$1` to `$9` for single arguments and `$*` for everything after the highest `$n` you used (or every argument if you used none): `!alias add shush mute $1 1h $*` makes `!shush @user being rude` run `!mute @user 1h being rude`.
- an alias can't be named like an existing command, has to start with one of okite's commands, and can't point at another alias or at `alias`. a server can have 50.
- it runs with the permissions of the command behind it, so it gives no extra access. with autocorrect on, a mistyped alias name is corrected too.
- aliases only exist as prefix commands. with MongoDB they are saved per server, otherwise in `config.json` for the whole bot.

## logging
everything is logged to the log channel as embeds, and purge transcripts are attached as full `.txt` and `.md` files. it covers
- mod actions: rule citations, purges, staff replies, `/setlog` and `/rule` changes, `/lock` and `/unlock`, `/infraction` lookups and edits
- events: message deletes, edits and bulk deletes, joins and leaves, kicks, bans and unbans, role, nickname and timeout changes, channel and role creation and deletion, voice joins, leaves and moves

message edit and delete logs need `/messagelogs`. ban transcripts are built by `/bancleanup` (on by default) or when `/messagelogs` is on. the event logs need the **Server Members** and **Message Content** privileged intents turned on in the developer portal, and the bot needs **View Audit Log** to say who deleted something or kicked or banned someone.

## reduced mode
the Server Members and Message Content intents are privileged: Discord can lock them for an app until it passes review. if Discord refuses them (`Used disallowed intents`), okite logs `reduced mode` and logs in again without them instead of staying offline. slash commands and context menus keep working (`/ban`, `/kick`, `/mute`, `/infraction`, `/rule`, `/lock`, `lookup`, mark / purge range, reply). prefix commands (`!ban`, `!purge` ...), message text in the logs and join / leave / role / nickname logs are off until the intents are approved.

## prerequisites
* **node.js** (v18.x or higher recommended)
* a discord bot token & client id

## self-host
1. clone the repo
2. configure `.env`:
   ```env
   DISCORD_TOKEN=your_bot_token_here
   CLIENT_ID=your_client_id_here
   # optional
   MONGODB_URI=...          # per-server rules, log channel, lock state
   SUPABASE_URL=...         # infractions (run db/infractions.sql, or db/infractions_migration_cases.sql plus db/infractions_reason.sql on an existing table, plus db/infractions_duration.sql, db/ban_snapshots.sql for `/ban`, db/message_cache.sql for restart-proof delete logs, and db/catch_up.sql for the catch-up after downtime)
   SUPABASE_SERVICE_KEY=...   # run db/infractions.sql (or db/infractions_migration_cases.sql on an existing table)
   ```
3. install dependencies & deploy commands:
   ```bash
   npm i
   node deploy.js
   ```
4. start the bot:
   ```bash
   node index.js
   ```

## server setup
1. invite the bot to your server with `bot` and `applications.commands` scopes
2. set your log channel:
   `/setlog channel:#okite-logs` (general), optionally `/setlog channel:#citations type:citation` and `/setlog channel:#purges type:purge` — unset types fall back to the general channel
3. right-click any message ➔ **Apps** ➔ **lookup** or **mark / purge range**

## rules configuration
`rules.json` holds the default rules, used by any server that has not set its own with `/rule add`. it follows the structure of a code of conduct: rules 1 to 9 with numbered sub-rules (`r1_1` is rule 1.1), and each entry is what a moderator picks when citing:
```json
{
    "id": "r1_3",
    "group": "Civil Discourse",
    "label": "Rule 1.3: Courtesy",
    "desc": "Treat people with respect; report instead of retaliating.",
    "text": ">>> **Rule #1.3: Courtesy**\n- Be polite and treat others with dignity.\n- ..."
}
```
- `label` and `desc` show in the menu (100 characters each at most), `text` is the notice posted in the channel (2000 at most). a menu holds 24 rules plus `custom`.
- list lines in `text` start with `- `; they show as bullets in the notice, in `/rule list` and on infraction cards.
- `group` is optional: two or more rules in a row with the same group (`r1_1`, `r1_2` ...) are listed in `/rule list` under one heading, `r1 / Civil Discourse`.

## license
mit

[privacy](privacy.md)
