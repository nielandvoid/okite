# Okite: Privacy Policy

Last updated: 2026-11-28

Okite is a Discord moderation bot. Server admins add it to their own server, configure it there, and decide who can use it. This page describes what Okite stores, why, for how long, and how to have it removed.

## What Okite stores

Message logging is **off by default** and is turned on per server by an admin with `/messagelogs`. While it is off, the message index and the message cache described below are not collected for that server, edits and deletes are not logged, and a ban makes no transcript. Everything else below (settings, infractions and the rest) is stored regardless.

Okite only reads what Discord sends to bots in servers it has been added to. It does not use presence data. It reads direct messages sent to it only to pass them on as modmail (below), and the direct messages it sends are the user notifications, appeal results, modmail replies and join gate notices described below.

**Server settings** (per server): log channel IDs, command prefix, auto-purge, autocorrect and rule-required options, time zone, custom rules and command aliases, and which channels are locked.

**Infractions** (per server): the user ID of the person, the user ID of the moderator, the rule cited and its text at the time, the reason, the action type (manual entry, mute, kick, softban or ban), duration and expiry, status, timestamps, the text of the message a moderator cited (if one was cited), and links to any evidence a moderator chose to archive in the server's own log channel.

**Message index** (7 days): message ID, channel ID, author ID, whether it had attachments, and the time sent. It contains no message text. It exists so a ban transcript can be built from a user's recent messages. With ban cleanup on (the default), a ban or softban also reads that user's recent channel history, up to the days the server set (7 by default), builds a transcript in the server's log channel and deletes those messages. This reading is not stored. To find those messages okite uses Discord's own message search for that user in the server, and `/obliterate` uses it for all of the user's messages. The results are used to build the transcript and delete the messages, and are not stored.

**Message cache** (72 hours): the text of recent messages, the author, and attachment details, excluding messages from bots. It exists so edit and delete logs still show what was said after a restart. Entries older than 72 hours are removed automatically.

**User notifications** (on by default, per server): an admin can turn them off with `/userdms enabled:false`. While they are on, okite sends a direct message to a member when a moderator bans, softbans, kicks, mutes, unmutes or warns them, when their mute ends, when a moderator cites one of their messages, or when an infraction against them is voided or deleted. It contains the server name, what happened, the reason and rule the moderator gave, the duration, the infraction number and, only if the server chose to, the moderator's name. A moderator can skip it for any one action with `--silent`. Okite does not keep a copy of the message and does not read replies. If the member's direct messages are closed, nothing is sent.

**Ban appeals** (only in servers that turn them on): the answers a banned member types into the appeal form, their user ID, the infraction number, the status (pending, accepted or denied), who decided and when, and the optional note sent with a denial. They are kept so the mods can decide later and so a denied member waits 7 days before appealing again.

**Modmail** (only in servers that turn it on): when you open a ticket from your DMs with Okite and choose a server, your messages, with any files, are re-posted in a private ticket thread in that server, where its moderators read and answer them. Okite stores the ticket itself: your user ID, the server, the thread, who opened, claimed and closed it, the close reason, message counts and times. While a ticket is open it also keeps the text of the current exchange (your latest messages and the mods' replies to them) so it can show you both together; that is replaced as the conversation moves on and cleared when the ticket closes. When a ticket is closed, a transcript of the thread is posted to the server's log channel. A DM sent before you open a ticket is not passed on or kept.

**Mod notes**: notes moderators write about a user with `/note`, with the user ID, the author's user ID and the time. Only that server's moderators can see them. The user is not told.

**Temporary roles**: when a moderator gives a role for a set time, the user ID, role ID, who gave it and when it ends, until okite removes the role.

**Join gate and lockdown** (only in servers that turn them on): the minimum account age and action, a list of user IDs let through anyway, and during a lockdown the permissions each channel had before, so they can be put back.

**Watchdog**: to spot one account posting the same thing in several channels, okite keeps the last few seconds of each member's messages in memory only (a fingerprint of the text and file sizes, the channel and the message ID). Nothing of this is written to the database, and it is gone within the server's window (30 seconds by default) or on restart.

**Pending ban prompts**: when a moderator bans a user, the IDs of that user's recent messages and the infraction number are kept until a moderator answers the save-or-delete prompt, or until it times out.

**Server structure snapshot**: a copy of the server's channel and role list, refreshed every few minutes, used to report what changed while the bot was offline.

**Operational state**: the time the bot was last online and, per server, the highest infraction number used.

## Logs and transcripts

Okite posts logs (rule citations, purges, bans, message edits and deletes with their text, joins and leaves, role, nickname and avatar changes, voice activity) to the log channels that each server's admins choose. Ban transcripts and any archived attachments are posted there too. That content then lives in Discord, under that server's control and permissions, not in Okite's database.

## What Okite does not do

Okite does not sell, rent or share data, does not use it for advertising or analytics, and does not use it for anything except moderation in the server it was collected in. Data from one server is never shown in another.

## Where data is processed

Okite runs on a hosting provider (Render). Infractions and message data are stored in Supabase, and server settings in MongoDB Atlas. Discord delivers the messages and events. Access to the stored data is limited to the person who operates Okite.

## How long data is kept

- Message index: 7 days. Message cache: 72 hours. Both only while an admin has message logs turned on for that server.
- Infractions, including the text of any message cited in them: until a moderator deletes them (`/infraction delete`), or until the server's data is deleted.
- Server settings, appeals, modmail tickets and mod notes: until the server's data is deleted. Mod notes can also be removed by moderators with `/note remove`.
- Temporary roles: until the role is removed.
- When Okite is removed from a server, that server's stored data (settings, infractions, message index and cache, pending prompts, snapshots, counters) is deleted after 90 days. Adding Okite back within those 90 days keeps the data. Deletion runs automatically.

## Your choices and requests

- **Server admins** can remove the bot at any time, and moderators can delete individual infractions.
- **Server admins** who don't want to wait 90 days can ask for their server's data to be deleted at once, using the contact below. Send the server ID from an account that manages that server. The request is carried out by hand, and covers everything listed above for that server.
- **Anyone** who wants to know what is stored about their user ID, or wants it removed, can ask using the contact below. A request for deletion will be handled for the server data it applies to.
- Users who want logs of their messages removed should also contact the server's moderators, since logs are stored in that server's channels.

## Children

Okite is for Discord servers and follows Discord's rules on minimum age. It does not knowingly collect data from anyone under that age.

## Changes

If this policy changes, the date at the top will too, be changed. Material changes will be announced where the bot's updates are posted.

## Contact

Discord: nielandvoid / 1515614953422192640
Email: [hey@nielandvoid.com](mailto:hey@nielandvoid.com)

