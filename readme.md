# okite
context-menu rule citation & range purge utility for r/BTechtards Discord

built with node and discord.js.

## features
- `lookup` message context menu command (cites server rules directly on target messages)
- custom modal input support for manual staff notices
- clean multiline blockquote formatting (`>>>`) with zero line gaps
- `mark / purge range` context menu command (stateless 2-click range purging)
- `/ban user [reason] [urgent]`: bans within seconds but keeps the user's messages. okite then logs a full transcript (embed + `.txt`) of their last 7 days and asks staff whether to archive their attachments in the log channel; it deletes the messages itself once staff answer (or after `BAN_PROMPT_HOURS`, default 24). `urgent` deletes their last 7 days immediately and saves nothing, for illegal content (report it to Discord and your national hotline). bans made outside `/ban` still get a transcript of whatever is left. with no log channel set there is nowhere to put a transcript, so the ban reply asks whether to **leave** their messages or **purge** them without one (purge only removes what okite has indexed, and nothing is deleted until a moderator chooses)
- `reply` context menu command (posts a staff reply as the bot, logged to the audit channel)
- `/setlog channel [type]` sets where each kind of log goes: `general` (fallback for everything), `citation`, `purge`, `moderation` (bans, kicks, locks, staff replies), `messages` (edits and deletes), `members` (joins, leaves, role / nickname / timeout changes), `voice`, `server` (channel / role changes, rules). any type left unset uses the general channel. `/setlog reset:true type:<type>` clears one. `/logchannels` shows what is set
- `/rule add|remove|list` to manage per-server rules (requires MongoDB)
- `/lock` and `/unlock` to lock a channel and restore the previous permissions exactly
- numbered infractions (requires Supabase): every rule citation is recorded as `infraction #N` (per server) with the cited text and re-hosted evidence
- `/infraction view|user|moderator|recent|add|edit|void|restore|delete` (`add` needs a rule or `custom`; a rule's text is stored with the infraction and the reason is kept alongside, defaulting to "not specified"; rule ids and infraction numbers autocomplete) to track history per user and per moderator. voided infractions stay on record but aren't counted

`/purge count [user1] [user2] [user3]` deletes the latest messages (up to 1000) in the current channel, with the same transcript-first logging and 200-message confirmation as the other purges. there is no cooldown beyond Discord's own rate limits. the right-click `mark / purge range` menu is still there for ranges.

## prefix commands
most commands also work with a prefix (default `!`, change it per server with `/prefix set` or `!prefix set <prefix>` (`reset` goes back to the default, no argument shows the current one); the default comes from `PREFIX` in `.env`; without MongoDB the prefix is stored in `config.json` and applies to every server): `!ban @user [--urgent] [reason]`, `!infraction view|user|moderator|recent|add|edit|void|restore`, `!lock`, `!unlock`, `!setlog`, `!rule list|remove`, and `!cite <rule id>` / `!cite custom <reason>` sent as a reply to the message you want to cite. `!help` lists them. like Sapphire, you can act by replying to a message: `!ban [reason]`, `!infraction user`, `!infraction moderator` and `!infraction add <reason>` use the replied-to author when you leave out the user, `!purge <count> [user ...]` deletes the latest messages (up to 1000, optionally only from up to 10 users, e.g. `!purge 200 @a @b`, scanning at most 3000 back), and `!purge` as a reply deletes everything from that message through your command. both use the same transcript-first logging and 200-message confirmation as the range purge. permissions are the same as the slash commands. there is no private reply for a normal message, so by default prefix commands and the bot's replies stay in the channel. **autocorrect** (opt-in, `/autocorrect enabled:true` or `!autocorrect on`): a mistyped prefix command word runs anyway when exactly one command or subcommand fits (`!infracton view 5`, `!purg 5`, `!infraction mod @x`), with a note saying what it was corrected to; if it could mean several, okite asks which. only command words are ever corrected, never users, rules, ids or reasons. common aliases (`!infractions`, `!inf`, `!history @user`, `!rule rm r1`) always work, even with autocorrect off. there are two independent **auto-purges** (`/autopurge target:<commands|parent> enabled:<bool>` or `!autopurge commands|parent on|off`, `!autopurge` shows both): **commands** (off by default) deletes your prefix command and the bot's reply the moment it has run, and **parent** (on by default) deletes the message being cited or infractioned once it has been logged, for `lookup`, `!cite` and `!infraction add` sent as a reply. deletions show up in the message delete log.  context-menu actions (mark / purge range, reply) and `/rule add` stay slash / right-click only.

- `/requirerule [enabled]` (or `!requirerule on|off`): opt-in per server. when on, `ban`, `kick`, `softban`, `mute` and `infraction add` need a rule id, or `custom` with a reason, and are refused without one. when off (the default) the rule is optional and none is recorded as custom. no option shows the current state.
- looks: logs, infraction cards and history, help and the ban prompt use Discord's container layout (colour bar, separators, quoted code blocks, buttons), with okite's icon and `okite_visual.png` as the help banner. set `CONTAINERS=off` in `.env` to go back to classic embeds everywhere.
- purge logs: a plain-text preview of the purged messages (whole messages, up to `PURGE_PREVIEW_CHARS`, default 2600, at most 3000, then `… and N more in the transcript`) and the full transcript attached as `.txt` and `.md`, all in one message. the time before each preview line is monospace so names line up; it uses the server's time zone, set with `/timezone UTC+5:30` (or `!timezone`, `-4`, or a name like `Asia/Kolkata`; `reset` clears it). `LOG_TIMEZONE` in `.env` is the default for servers that have not set one, and UTC when neither is set. the zone is used for times written into text (the purge preview); Discord timestamps, like the dates in infraction history, follow each reader's own time zone. without MongoDB the setting is one value for the whole bot.

## ban, kick, softban, mute
- `/ban user [duration] [rule] [reason] [urgent]` (`!ban @user [duration] [--urgent] [--rule r4] [reason]`): with a duration the ban lifts itself when it expires; without one it is permanent. the user's messages are kept for the transcript-and-decide flow described above.
- `/kick user [rule] [reason]`, `/softban user [rule] [reason]` (bans then unbans straight away to clear their messages, through the same transcript flow), `/mute user [duration] [rule] [reason]`, `/unmute user`. prefix: `!kick`, `!softban`, `!mute @user 1h reason`, `!unmute`.
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
every start, okite works out what it missed while it was offline and logs it, each entry marked "(while offline)":
- **moderation events:** bans, unbans, kicks, timeouts and role changes made by people in Discord, replayed from the audit log with who did them and why. a ban made by hand is also recorded as an infraction (and offered the usual transcript), unless okite had already recorded it just before stopping.
- **channels and roles:** created, deleted or renamed, compared against a snapshot taken every 5 minutes (and on a clean shutdown), plus the change in member count.
- **messages:** the stored copies of the last 24 hours are compared with the channels as they are now. gone messages are logged with their author and text (a transcript file if more than 5 in a channel), edited messages with before and after, and messages sent during the gap are remembered for later.
- a summary embed in the general log channel says how long okite was down and what was found, with notes on anything it could not check.
- how it knows when it went down: a heartbeat written every 15 seconds (and on a clean shutdown) to the database and `data/state.json`. run `db/catch_up.sql` for the database part. quick restarts under 30 seconds are skipped.
- limits: joins and leaves are not recorded by Discord, and a message sent and deleted entirely while okite was offline was never seen, so neither can be recovered. an event in the last 15 seconds before a crash may be logged twice. a message missing from a channel is reported as deleted, but it could also have been removed another way. each server is limited to 300 Discord requests per catch-up.
- settings (in `.env`): `CATCHUP=off` turns it off, `CATCHUP_MIN_GAP_SECONDS` (default 30), `CATCHUP_MAX_REQUESTS` (default 300).

## ping
`/ping` (anyone) or `!ping` (staff) shows the websocket heartbeat from Discord, how long a reply takes to reach Discord, how long a database query takes (Supabase and MongoDB, whichever are set up), and how long okite has been running. a high api or database number is where slow commands come from.

## aliases
make your own prefix commands that run another command: `!alias add warn infraction add` makes `!warn @user r4 spamming` do exactly what `!infraction add @user r4 spamming` does, and `!alias add unwarn infraction void` makes `!unwarn 12 reason` void infraction 12. `!alias list` shows them, `!alias remove <name>` deletes one (the same three exist as `/alias`, needing Manage Channels).
- your arguments are added to the end. to place them yourself use `$1` to `$9` (the nth argument) and `$*` (everything after the highest `$n` used, or every argument when none is used): `!alias add shush mute $1 1h $*` makes `!shush @user being rude` run `!mute @user 1h being rude`.
- an alias can't reuse the name of a command, must start with one of okite's commands, and can't point at another alias or at `alias`. a server can have 50.
- an alias runs with the permissions of the command it points at, so it can't be used to get around them. with autocorrect on, a mistyped alias name is fixed too.
- aliases are prefix commands only; slash commands can't be added on the fly. with MongoDB they are saved per server, otherwise in `config.json` for the whole bot.

## logging
everything goes to the log channel as embeds (purge transcripts are attached as full `.txt` files):
- mod actions: rule citations, purges, staff replies, `/setlog`, `/rule` changes, `/lock` / `/unlock`, `/infraction` lookups and edits
- events: message delete / edit / bulk delete, joins, leaves, kicks, bans, unbans, role / nickname / timeout changes, channel + role create / delete, voice join / leave / move

the event logs need the **Server Members** and **Message Content** privileged intents enabled in the developer portal. the bot also needs **View Audit Log** to name who performed a deletion, kick, ban etc.

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
