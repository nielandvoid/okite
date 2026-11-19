# Okite: Privacy Policy

Last updated: 2026-11-19

Okite is a Discord moderation bot. Server admins add it to their own server, configure it there, and decide who can use it. This page describes what Okite stores, why, for how long, and how to have it removed.

## What Okite stores

Okite only reads what Discord sends to bots in servers it has been added to. It does not read direct messages and it does not use presence data.

**Server settings** (per server): log channel IDs, command prefix, auto-purge, autocorrect and rule-required options, time zone, custom rules and command aliases, and which channels are locked.

**Infractions** (per server): the user ID of the person, the user ID of the moderator, the rule cited and its text at the time, the reason, the action type (manual entry, mute, kick, softban or ban), duration and expiry, status, timestamps, the text of the message a moderator cited (if one was cited), and links to any evidence a moderator chose to archive in the server's own log channel.

**Message index** (7 days): message ID, channel ID, author ID, whether it had attachments, and the time sent. It contains no message text. It exists so a ban transcript can be built from a user's recent messages.

**Message cache** (72 hours): the text of recent messages, the author, and attachment details, excluding messages from bots. It exists so edit and delete logs still show what was said after a restart. Entries older than 72 hours are removed automatically.

**Pending ban prompts**: when a moderator bans a user, the IDs of that user's recent messages and the infraction number are kept until a moderator answers the save-or-delete prompt, or until it times out.

**Server structure snapshot**: a copy of the server's channel and role list, refreshed every few minutes, used to report what changed while the bot was offline.

**Operational state**: the time the bot was last online and, per server, the highest infraction number used.

## Logs and transcripts

Okite posts logs (rule citations, purges, bans, message edits and deletes with their text, joins and leaves, role and nickname changes, voice activity) to the log channels that each server's admins choose. Ban transcripts and any archived attachments are posted there too. That content then lives in Discord, under that server's control and permissions, not in Okite's database.

## What Okite does not do

Okite does not sell, rent or share data, does not use it for advertising or analytics, and does not use it for anything except moderation in the server it was collected in. Data from one server is never shown in another.

## Where data is processed

Okite runs on a hosting provider (Render). Infractions and message data are stored in Supabase, and server settings in MongoDB Atlas. Discord delivers the messages and events. Access to the stored data is limited to the person who operates Okite.

## How long data is kept

- Message index: 7 days. Message cache: 72 hours.
- Infractions, including the text of any message cited in them: until a moderator deletes them (`/infraction delete`), or until the server's data is deleted.
- Server settings: until the server's data is deleted.
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

