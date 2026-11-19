# preview
screenshots / illustration of okite operating in a discord server

## message content intent

### edit log
okite logs an edit in the staff log channel with the author, the channel, and the text before and after. needs the message content intent.

![message edit log](assets/message-edit-log.png)

### delete log
okite logs a deletion with the author, the channel, who deleted it, the message id, when it was sent, and the deleted text (the second entry in the screenshot). needs the message content intent.

![member left and message deleted log](assets/leave-and-delete-log.png)

### delete log with an attachment
when the deleted message had a file, okite lists it and re-posts a preview behind a spoiler. needs the message content intent.

![message delete log with an attachment](assets/delete-log-attachment.png)

### delete log, image only
a deleted message with no text, only an image: okite shows `(no text)`, lists the file, and re-posts the image behind a spoiler. needs the message content intent.

![message delete log, image only](assets/delete-log-image-only.png)

### rule citation and prefix command
a moderator replies to a message with the prefix command `!cite r4_1`. okite posts the staff notice for that rule, records infraction #6, and logs the moderator, the cited user, the cited message, the channel and the rule. needs the message content intent.

![rule citation log](assets/rule-citation-log.png)

### purge log and transcript
a moderator runs the prefix command `!purge 3`. okite logs the moderator, the channel, how many messages and authors, a text preview of what was purged, and attaches the full transcript as `.txt` and `.md` files, all before anything is lost. needs the message content intent.

![purge log with transcript files](assets/purge-log.png)

another purge, this time filtered by users (the second entry in the screenshot): okite scanned the last 1000 messages, deleted the 28 that matched, and logged a preview of them.

![purge log filtered by user](assets/setlog-and-purge-log.png)

### ban and transcript flow
`/ban` bans within seconds but keeps the user's messages. okite replies that the transcript is being built, and the log shows the ban with the mode "messages kept until staff decide": a transcript of the user's last 7 days goes to the log channel first, staff choose whether to archive attachments, and only then are the messages deleted. needs the message content intent.

![ban reply](assets/ban-reply.png)

![member banned log](assets/ban-log.png)

then the transcript lands in the log channel (the first entry below): the user, how many messages were recovered, and the full transcript as `.txt` and `.md` files. the second entry is the softban's snapshot, which found no indexed messages for that user.

![ban transcript](assets/ban-transcript.png)

## server members intent

### leave log
okite logs a member leaving with their id, when they joined, and the roles they had (the first entry in the screenshot). needs the server members intent.

![member left and message deleted log](assets/leave-and-delete-log.png)

another leave, with a join above it (the second entry in the screenshot).

![member left log](assets/member-left-log.png)

### join log
okite logs a member joining with their id, account age and the member count (the first entry in the screenshot). needs the server members intent.

![member joined and roles updated log](assets/join-and-role-log.png)

### role change log
okite logs roles added or removed on a member (the second entry in the screenshot). needs the server members intent.

![member joined and roles updated log](assets/join-and-role-log.png)

### mute log
a timed mute is recorded as a numbered infraction with the user, the moderator, the duration, the rule and the reason. below it, the log of the deleted `!shh` command message that triggered it. timed mutes need the server members intent so okite can put the mute back if the user leaves and rejoins.

![member muted log](assets/member-muted-log.png)

### display name change log
okite logs a display name or nickname change with the old and new name (the middle entry in the screenshot). needs the server members intent.

![display name change log](assets/display-name-change-log.png)

## application overview

### voice log
okite logs voice joins, leaves and moves in the staff log channel with the user and the channel.

![voice join and leave log](assets/voice-log.png)

### infraction history and void
okite logs when a moderator looks up a user's infraction history, and when an infraction is voided with the reason. voided infractions stay on record but are not counted.

![infraction history viewed and infraction voided log](assets/infraction-history-and-void-log.png)

### log channel setup
an admin sets where logs go with `/setlog` or the prefix version `!setlog #channel [type]`. okite confirms it in chat and writes a "log channel changed" entry (the first entry in the screenshot). each server picks its own channels.

![setlog command and log channel changed entry](assets/setlog-and-purge-log.png)

### help for one command
`!help ban` (or `/help ban`) explains a command: what it does, its syntax and the permission it needs. for `ban` it also describes the transcript-first flow: the last 7 days of messages are logged as a transcript, staff decide whether to archive attachments, and only then are the messages deleted.

![help for the ban command](assets/help-ban.png)

### rule list
`/rule list` (or `!rule list`) shows the server's rules, grouped by rule number, each with its id (`r1_1`) so moderators can cite it. every server has its own rule set, with a default one for servers that haven't added any.

![rule list](assets/rule-list.png)

### infraction card
`/infraction view 5` shows one numbered infraction: its type, the user, the duration, the reason and who created it, with buttons to edit the reason, void it, or open the user's history. only the moderator who ran the command sees it.

![infraction card](assets/infraction-card.png)

### infraction history
`/infraction user` lists a user's infractions with the total, how many are active and how many are voided, each with its type, date and duration, and a button to open it. voided infractions stay on record but are not counted. the list is paged. only the moderator who ran the command sees it.

![infraction history](assets/infraction-history.png)

### command list
`/help` lists every command by group. `/help <command>` explains one.

![help command list](assets/help-overview.png)

### softban
`/softban` bans and unbans straight away to clear a user's messages, and records the infraction like any other action.

![member softbanned log](assets/softban-log.png)

### catch-up after downtime
on every start okite works out what it missed while offline and posts a summary: how long it was down, what it logged from the audit log, and how many messages it remembered from the gap. it also says what it cannot recover.

![catch-up summary after downtime](assets/catch-up-log.png)
