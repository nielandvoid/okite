const { REST, Routes, ApplicationCommandType, ContextMenuCommandBuilder, SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require("discord.js"); require("dotenv").config(); const help = require("./help");
const { guildModmail, dmModmail } = require("./modmail-commands");

const commands = [
    new ContextMenuCommandBuilder()
        .setName("lookup")
        .setType(ApplicationCommandType.Message)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

    new ContextMenuCommandBuilder()
        .setName("mark / purge range")
        .setType(ApplicationCommandType.Message)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

    new ContextMenuCommandBuilder()
        .setName("reply")
        .setType(ApplicationCommandType.Message)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

    new SlashCommandBuilder()
        .setName("setlog")
        .setDescription(help.setlog.summary)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
        .addChannelOption(option =>
            option.setName("channel")
                .setDescription("the channel to send logs to")
        )
        .addBooleanOption(option =>
            option.setName("reset")
                .setDescription("clear this log type instead of setting a channel")
        )
        .addStringOption(option =>
            option.setName("type")
                .setDescription("which logs go to this channel (default: general)")
                .addChoices(
                    { name: "general (everything else, and fallback)", value: "general" },
                    { name: "citation (rule citations)", value: "citation" },
                    { name: "purge (purge transcripts)", value: "purge" },
                    { name: "moderation (bans, kicks, locks, staff replies)", value: "moderation" },
                    { name: "messages (edits and deletes)", value: "messages" },
                    { name: "members (joins, leaves, role / nickname changes)", value: "members" },
                    { name: "voice (voice joins, leaves, moves)", value: "voice" },
                    { name: "server (channel / role changes, rules)", value: "server" }
                )
        ),

    new SlashCommandBuilder()
        .setName("prefix")
        .setDescription(help.prefix.summary)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
        .addSubcommand(sub =>
            sub.setName("show")
               .setDescription("show the current prefix")
        )
        .addSubcommand(sub =>
            sub.setName("set")
               .setDescription("set a new prefix")
               .addStringOption(o => o.setName("prefix").setDescription("the new prefix (1-5 characters)").setMaxLength(5).setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName("reset")
               .setDescription("go back to the default prefix")
        ),

    new SlashCommandBuilder()
        .setName("autopurge")
        .setDescription(help.autopurge.summary)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
        .addStringOption(o => o.setName("target").setDescription("which auto-purge")
            .addChoices(
                { name: "commands (the prefix command and the bot's reply)", value: "commands" },
                { name: "parent (the message being cited or infractioned)", value: "parent" },
                { name: "result (the purge result reply, like purged 2 messages)", value: "result" }
            ))
        .addBooleanOption(o => o.setName("enabled").setDescription("turn it on or off")),

    new SlashCommandBuilder()
        .setName("autocorrect")
        .setDescription(help.autocorrect.summary)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
        .addBooleanOption(o => o.setName("enabled").setDescription("on: run unambiguous typos, ask when unsure (no option shows the state)")),

    new SlashCommandBuilder()
        .setName("timezone")
        .setDescription(help.timezone.summary)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
        .addStringOption(o => o.setName("zone").setDescription("UTC+5:30, -4, or a name like Asia/Kolkata; reset for the default (no option shows it)")),

    new SlashCommandBuilder()
        .setName("requirerule")
        .setDescription(help.requirerule.summary)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
        .addBooleanOption(o => o.setName("enabled").setDescription("on: a rule is needed for every action (no option shows the state)")),

    new SlashCommandBuilder()
        .setName("messagelogs")
        .setDescription(help.messagelogs.summary)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
        .addBooleanOption(o => o.setName("enabled").setDescription("on: log edited and deleted messages and build ban transcripts (no option shows the state)")),

    new SlashCommandBuilder()
        .setName("userdms")
        .setDescription(help.userdms.summary)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
        .addBooleanOption(o => o.setName("enabled").setDescription("on: DM users when they are banned, kicked, muted, warned or cited (no option shows the state)"))
        .addStringOption(o => o.setName("action").setDescription("an action to turn the DM on or off for (use with send)")
            .addChoices({ name: "ban (includes softban)", value: "ban" }, { name: "kick", value: "kick" }, { name: "mute", value: "mute" }, { name: "unmute (includes a mute ending)", value: "unmute" }, { name: "warn", value: "warn" }, { name: "cite", value: "cite" }, { name: "void or delete an infraction", value: "void" }))
        .addBooleanOption(o => o.setName("send").setDescription("whether that action sends a DM (use with action)"))
        .addBooleanOption(o => o.setName("show_moderator").setDescription("show the moderator's name in the DM (off by default)")),

    new SlashCommandBuilder()
        .setName("watchdog")
        .setDescription(help.watchdog.summary)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
        .addBooleanOption(o => o.setName("enabled").setDescription("on or off (no option shows the state)"))
        .addIntegerOption(o => o.setName("channels").setDescription("how many channels the same message has to hit (2 to 10, default 3)").setMinValue(2).setMaxValue(10))
        .addIntegerOption(o => o.setName("seconds").setDescription("within how many seconds (5 to 300, default 30)").setMinValue(5).setMaxValue(300))
        .addStringOption(o => o.setName("mute").setDescription("how long the timeout is, like 1h or 1d (default 1d)").setMaxLength(10)),

    new SlashCommandBuilder()
        .setName("honeypot")
        .setDescription(help.honeypot.summary)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
        .addChannelOption(o => o.setName("channel").setDescription("the trap channel nobody should post in"))
        .addStringOption(o => o.setName("action").setDescription("what happens to whoever posts there (default softban)")
            .addChoices({ name: "softban (ban and unban, which removes their messages from the last day)", value: "softban" }, { name: "ban", value: "ban" }, { name: "mute for 1 day", value: "mute" }))
        .addBooleanOption(o => o.setName("invite").setDescription("softban only: DM them a one-use invite to rejoin, in case the account was compromised"))
        .addBooleanOption(o => o.setName("off").setDescription("turn the honeypot off")),

    new SlashCommandBuilder()
        .setName("modrole")
        .setDescription(help.modrole.summary)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
        .addRoleOption(o => o.setName("role").setDescription("the role to ping on alerts"))
        .addBooleanOption(o => o.setName("off").setDescription("stop pinging a role")),

    new SlashCommandBuilder()
        .setName("appeals")
        .setDescription(help.appeals.summary)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
        .addSubcommand(sub => sub.setName("setup").setDescription("turn appeals on and pick the channel they go to")
            .addChannelOption(o => o.setName("channel").setDescription("where appeals are posted for the mods").setRequired(true)))
        .addSubcommand(sub => sub.setName("off").setDescription("stop taking appeals"))
        .addSubcommand(sub => sub.setName("add").setDescription("add a question to the appeal form (up to 7, {action} becomes banned/muted/kicked/warned)")
            .addStringOption(o => o.setName("question").setDescription("the question, up to 45 characters").setRequired(true).setMaxLength(45))
            .addStringOption(o => o.setName("hint").setDescription("grey example text inside the answer box, up to 100 characters").setMaxLength(100)))
        .addSubcommand(sub => sub.setName("remove").setDescription("remove a question")
            .addIntegerOption(o => o.setName("number").setDescription("the question's number from /appeals list").setRequired(true).setMinValue(1).setMaxValue(7)))
        .addSubcommand(sub => sub.setName("block").setDescription("stop a user from appealing")
            .addUserOption(o => o.setName("user").setDescription("the user").setRequired(true)))
        .addSubcommand(sub => sub.setName("unblock").setDescription("let a blocked user appeal again")
            .addUserOption(o => o.setName("user").setDescription("the user").setRequired(true)))
        .addSubcommand(sub => sub.setName("list").setDescription("show the appeal settings and questions")),

    new SlashCommandBuilder()
        .setName("bancleanup")
        .setDescription(help.bancleanup.summary)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
        .addBooleanOption(o => o.setName("enabled").setDescription("on (default): build the transcript, then delete their messages (no option shows the state)"))
        .addIntegerOption(o => o.setName("days").setDescription("how far back to look and delete, 1 to 30 (default 7)").setMinValue(1).setMaxValue(30)),

    new SlashCommandBuilder()
        .setName("alias")
        .setDescription(help.alias.summary)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
        .addSubcommand(sub =>
            sub.setName("add")
               .setDescription("add or replace an alias, e.g. name warn, command infraction add")
               .addStringOption(o => o.setName("name").setDescription("the new command word (1-20 letters, numbers, - or _)").setMaxLength(20).setRequired(true))
               .addStringOption(o => o.setName("command").setDescription("what it runs, e.g. infraction add (use $1..$9 and $* to place arguments)").setMaxLength(200).setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName("remove")
               .setDescription("remove an alias")
               .addStringOption(o => o.setName("name").setDescription("the alias to remove").setAutocomplete(true).setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName("list")
               .setDescription("show every alias")
        ),

    new SlashCommandBuilder()
        .setName("security-audit")
        .setDescription(help['security-audit'].summary)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    new SlashCommandBuilder()
        .setName("ping")
        .setDescription(help.ping.summary),

    new SlashCommandBuilder()
        .setName("help")
        .setDescription(help.help.summary)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addStringOption(option =>
            option.setName("command")
                .setDescription("the command to explain")
                .setRequired(false)
        ),

    new SlashCommandBuilder()
        .setName("logchannels")
        .setDescription(help.logchannels.summary)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

    new SlashCommandBuilder()
        .setName("rule")
        .setDescription(help.rule.summary)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
        .addSubcommand(sub =>
            sub.setName("add")
               .setDescription("add a new server rule")
        )
        .addSubcommand(sub =>
            sub.setName("remove")
               .setDescription("remove a server rule by ID")
               .addStringOption(opt =>
                   opt.setName("id")
                      .setDescription("the rule ID (e.g. r1)")
                      .setAutocomplete(true)
                      .setRequired(true)
               )
        )
        .addSubcommand(sub =>
            sub.setName("list")
               .setDescription("list all rules configured for this server")
        ),

    new SlashCommandBuilder()
        .setName("lock")
        .setDescription(help.lock.summary)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
        .addChannelOption(option =>
            option.setName("channel")
                .setDescription("the channel to lock")
                .setRequired(false)
        ),

    new SlashCommandBuilder()
        .setName("ban")
        .setDescription(help.ban.summary)
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
        .addUserOption(o => o.setName("user").setDescription("the user to ban").setRequired(true))
        .addStringOption(o => o.setName("duration").setDescription("how long (7d, 12h, permanent); defaults to permanent").setAutocomplete(true))
        .addStringOption(o => o.setName("rule").setDescription("the rule that was broken, or leave blank for custom").setAutocomplete(true))
        .addStringOption(o => o.setName("reason").setDescription("why").setMaxLength(400))
        .addBooleanOption(o => o.setName("urgent").setDescription("illegal content: delete their last 7 days now, save nothing"))
        .addBooleanOption(o => o.setName("silent").setDescription("skip the DM to the user for this action"))
        .addStringOption(o => o.setName("modnote").setDescription("a note for the user, shown in their DM (put it last on prefix commands: --mn or --modnote)").setMaxLength(500)),

    new SlashCommandBuilder()
        .setName("purge")
        .setDescription(help.purge.summary)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addIntegerOption(o => o.setName("count").setDescription("how many messages (1-1000)").setMinValue(1).setMaxValue(1000).setRequired(true))
        .addUserOption(o => o.setName("user1").setDescription("only delete messages from this user"))
        .addUserOption(o => o.setName("user2").setDescription("also include this user"))
        .addUserOption(o => o.setName("user3").setDescription("also include this user")),

    new SlashCommandBuilder()
        .setName("obliterate")
        .setDescription(help['obliterate'].summary)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addUserOption(o => o.setName("user").setDescription("the user whose messages to delete everywhere").setRequired(true)),

    new SlashCommandBuilder()
        .setName("kick")
        .setDescription(help.kick.summary)
        .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
        .addUserOption(o => o.setName("user").setDescription("the user to kick").setRequired(true))
        .addStringOption(o => o.setName("rule").setDescription("the rule that was broken, or leave blank for custom").setAutocomplete(true))
        .addStringOption(o => o.setName("reason").setDescription("why").setMaxLength(400))
        .addBooleanOption(o => o.setName("silent").setDescription("skip the DM to the user for this action"))
        .addStringOption(o => o.setName("modnote").setDescription("a note for the user, shown in their DM (put it last on prefix commands: --mn or --modnote)").setMaxLength(500)),

    new SlashCommandBuilder()
        .setName("softban")
        .setDescription(help.softban.summary)
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
        .addUserOption(o => o.setName("user").setDescription("the user to softban").setRequired(true))
        .addStringOption(o => o.setName("rule").setDescription("the rule that was broken, or leave blank for custom").setAutocomplete(true))
        .addStringOption(o => o.setName("reason").setDescription("why").setMaxLength(400))
        .addBooleanOption(o => o.setName("silent").setDescription("skip the DM to the user for this action"))
        .addStringOption(o => o.setName("modnote").setDescription("a note for the user, shown in their DM (put it last on prefix commands: --mn or --modnote)").setMaxLength(500)),

    new SlashCommandBuilder()
        .setName("mute")
        .setDescription(help.mute.summary)
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .addUserOption(o => o.setName("user").setDescription("the user to mute").setRequired(true))
        .addStringOption(o => o.setName("duration").setDescription("how long (30m, 12h, 7d, permanent); defaults to permanent").setAutocomplete(true))
        .addStringOption(o => o.setName("rule").setDescription("the rule that was broken, or leave blank for custom").setAutocomplete(true))
        .addStringOption(o => o.setName("reason").setDescription("why").setMaxLength(400))
        .addBooleanOption(o => o.setName("silent").setDescription("skip the DM to the user for this action"))
        .addStringOption(o => o.setName("modnote").setDescription("a note for the user, shown in their DM (put it last on prefix commands: --mn or --modnote)").setMaxLength(500)),

    new SlashCommandBuilder()
        .setName("setnick")
        .setDescription(help.setnick.summary)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames)
        .addUserOption(o => o.setName("user").setDescription("the member").setRequired(true))
        .addStringOption(o => o.setName("nickname").setDescription("the new nickname (up to 32 characters, or reset)").setMaxLength(32)),

    new SlashCommandBuilder()
        .setName("role")
        .setDescription(help.role.summary)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
        .addSubcommand(sub => sub.setName("add").setDescription("give a member a role")
            .addUserOption(o => o.setName("user").setDescription("the member").setRequired(true))
            .addRoleOption(o => o.setName("role").setDescription("the role to give").setRequired(true))
            .addStringOption(o => o.setName("reason").setDescription("shown in the audit log").setMaxLength(300))
            .addStringOption(o => o.setName("duration").setDescription("take it away again after this long, like 1h, 7d or 2w")))
        .addSubcommand(sub => sub.setName("remove").setDescription("take a role from a member")
            .addUserOption(o => o.setName("user").setDescription("the member").setRequired(true))
            .addRoleOption(o => o.setName("role").setDescription("the role to take").setRequired(true))
            .addStringOption(o => o.setName("reason").setDescription("shown in the audit log").setMaxLength(300)))
        .addSubcommand(sub => sub.setName("create").setDescription("create a role with no permissions")
            .addStringOption(o => o.setName("name").setDescription("the role name").setRequired(true).setMaxLength(100))
            .addStringOption(o => o.setName("color").setDescription("hex code, like #7ee8a8"))
            .addBooleanOption(o => o.setName("hoist").setDescription("show members with it separately in the member list"))
            .addBooleanOption(o => o.setName("mentionable").setDescription("let anyone @mention it"))),

    new SlashCommandBuilder()
        .setName("slowmode")
        .setDescription(help.slowmode.summary)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
        .addSubcommand(sub => sub.setName("set").setDescription("set a channel's slowmode")
            .addStringOption(o => o.setName("time").setDescription("like 5s, 10s, 2m, 1h (up to 6h), or off").setRequired(true))
            .addChannelOption(o => o.setName("channel").setDescription("defaults to this channel")))
        .addSubcommand(sub => sub.setName("revert").setDescription("go back to the slowmode before the last change")
            .addChannelOption(o => o.setName("channel").setDescription("defaults to this channel"))),

    new SlashCommandBuilder()
        .setName("sendmessage")
        .setDescription(help.sendmessage.summary)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addChannelOption(o => o.setName("channel").setDescription("where to send it").setRequired(true))
        .addStringOption(o => o.setName("message").setDescription("what to send (optional when a file is attached)").setMaxLength(2000))
        .addAttachmentOption(o => o.setName("file").setDescription("a picture, video or file to send along"))
        .addAttachmentOption(o => o.setName("file2").setDescription("another file"))
        .addAttachmentOption(o => o.setName("file3").setDescription("another file")),

    new SlashCommandBuilder()
        .setName("unban")
        .setDescription(help.unban.summary)
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
        .addUserOption(o => o.setName("user").setDescription("the user to unban (an id works too)").setRequired(true))
        .addStringOption(o => o.setName("reason").setDescription("why").setMaxLength(400)),

    new SlashCommandBuilder()
        .setName("unmute")
        .setDescription(help.unmute.summary)
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .addUserOption(o => o.setName("user").setDescription("the user to unmute").setRequired(true))
        .addStringOption(o => o.setName("reason").setDescription("why").setMaxLength(400))
        .addBooleanOption(o => o.setName("silent").setDescription("skip the DM to the user for this action"))
        .addStringOption(o => o.setName("modnote").setDescription("a note for the user, shown in their DM (put it last on prefix commands: --mn or --modnote)").setMaxLength(500)),

    new SlashCommandBuilder()
        .setName("infraction")
        .setDescription(help.infraction.summary)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addSubcommand(sub =>
            sub.setName("view")
               .setDescription("show one infraction in full")
               .addIntegerOption(o => o.setName("id").setDescription("infraction number").setAutocomplete(true).setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName("user")
               .setDescription("a user's infraction history")
               .addUserOption(o => o.setName("user").setDescription("the user to look up").setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName("moderator")
               .setDescription("infractions issued by a moderator")
               .addUserOption(o => o.setName("user").setDescription("the moderator").setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName("recent")
               .setDescription("the latest infractions in this server")
        )
        .addSubcommand(sub =>
            sub.setName("add")
               .setDescription("record an infraction without a cited message")
               .addUserOption(o => o.setName("user").setDescription("the user").setRequired(true))
               .addStringOption(o => o.setName("rule").setDescription("the rule that was broken, or custom (optional unless the server requires one)").setAutocomplete(true))
               .addStringOption(o => o.setName("duration").setDescription("how long it lasts (7d, 12h, permanent); defaults to permanent").setAutocomplete(true))
               .addStringOption(o => o.setName("reason").setDescription("what happened (defaults to not specified)").setMaxLength(1000))
               .addBooleanOption(o => o.setName("silent").setDescription("skip the DM to the user for this warning"))
               .addStringOption(o => o.setName("modnote").setDescription("a note for the user, shown in their DM (put it last on prefix commands: --mn or --modnote)").setMaxLength(500))
        )
        .addSubcommand(sub =>
            sub.setName("edit")
               .setDescription("change the recorded reason of an infraction")
               .addIntegerOption(o => o.setName("id").setDescription("infraction number").setAutocomplete(true).setRequired(true))
               .addStringOption(o => o.setName("reason").setDescription("the new reason").setRequired(true).setMaxLength(1000))
        )
        .addSubcommand(sub =>
            sub.setName("void")
               .setDescription("mark an infraction as void (kept on record, not counted)")
               .addIntegerOption(o => o.setName("id").setDescription("infraction number").setAutocomplete(true).setRequired(true))
               .addStringOption(o => o.setName("reason").setDescription("why it's being voided").setRequired(true).setMaxLength(500))
               .addBooleanOption(o => o.setName("silent").setDescription("skip the DM to the user for this action"))
               .addStringOption(o => o.setName("modnote").setDescription("a note for the user, shown in their DM (put it last on prefix commands: --mn or --modnote)").setMaxLength(500))
        )
        .addSubcommand(sub =>
            sub.setName("restore")
               .setDescription("restore a voided infraction")
               .addIntegerOption(o => o.setName("id").setDescription("infraction number").setAutocomplete(true).setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName("delete")
               .setDescription("delete an infraction for good (written to the log first)")
               .addIntegerOption(o => o.setName("id").setDescription("infraction number").setAutocomplete(true).setRequired(true))
               .addBooleanOption(o => o.setName("silent").setDescription("skip the DM to the user for this action"))
               .addStringOption(o => o.setName("modnote").setDescription("a note for the user, shown in their DM (put it last on prefix commands: --mn or --modnote)").setMaxLength(500))
        ),

    new SlashCommandBuilder()
        .setName("unlock")
        .setDescription(help.unlock.summary)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
        .addChannelOption(option =>
            option.setName("channel")
                .setDescription("the channel to unlock")
                .setRequired(false)
        ),

    new SlashCommandBuilder()
        .setName("whois")
        .setDescription(help.whois.summary)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addUserOption(o => o.setName("user").setDescription("the user (defaults to you)")),

    new SlashCommandBuilder()
        .setName("note")
        .setDescription(help.note.summary)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addSubcommand(sub => sub.setName("add").setDescription("add a private mod note")
            .addUserOption(o => o.setName("user").setDescription("the user").setRequired(true))
            .addStringOption(o => o.setName("text").setDescription("the note").setRequired(true).setMaxLength(1500)))
        .addSubcommand(sub => sub.setName("list").setDescription("show the notes on a user")
            .addUserOption(o => o.setName("user").setDescription("the user").setRequired(true)))
        .addSubcommand(sub => sub.setName("remove").setDescription("delete a note")
            .addUserOption(o => o.setName("user").setDescription("the user").setRequired(true))
            .addIntegerOption(o => o.setName("number").setDescription("the note's number from the list").setRequired(true).setMinValue(1))),

    new SlashCommandBuilder()
        .setName("modstats")
        .setDescription(help.modstats.summary)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addIntegerOption(o => o.setName("days").setDescription("how far back (default 30)").setMinValue(1).setMaxValue(365))
        .addUserOption(o => o.setName("moderator").setDescription("only this mod")),

    new SlashCommandBuilder()
        .setName("serverinfo")
        .setDescription(help.serverinfo.summary),

    new SlashCommandBuilder()
        .setName("roles")
        .setDescription(help.roles.summary),

    new SlashCommandBuilder()
        .setName("voice")
        .setDescription(help.voice.summary)
        .setDefaultMemberPermissions(PermissionFlagsBits.MoveMembers)
        .addSubcommand(sub => sub.setName("move").setDescription("move a member, or everyone in a channel")
            .addChannelOption(o => o.setName("to").setDescription("where to move them").addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice).setRequired(true))
            .addUserOption(o => o.setName("user").setDescription("one member to move"))
            .addChannelOption(o => o.setName("from").setDescription("move everyone in this channel (defaults to yours)").addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice))),

    new SlashCommandBuilder()
        .setName("joingate")
        .setDescription(help.joingate.summary)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
        .addBooleanOption(o => o.setName("enabled").setDescription("turn the join gate on or off"))
        .addIntegerOption(o => o.setName("days").setDescription("minimum account age in days (default 7)").setMinValue(1).setMaxValue(365))
        .addStringOption(o => o.setName("action").setDescription("what happens to accounts that are too new").addChoices(
            { name: "kick (they can rejoin once old enough)", value: "kick" },
            { name: "mute (time them out)", value: "mute" },
            { name: "log only", value: "log" }))
        .addStringOption(o => o.setName("mute").setDescription("how long the mute lasts, like 1h or 1d"))
        .addBooleanOption(o => o.setName("noavatar").setDescription("also catch accounts with no profile picture"))
        .addUserOption(o => o.setName("allow").setDescription("let this user through anyway"))
        .addUserOption(o => o.setName("unallow").setDescription("take a user off the allow list")),

    new SlashCommandBuilder()
        .setName("lockdown")
        .setDescription(help.lockdown.summary)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
        .addSubcommand(sub => sub.setName("on").setDescription("lock every public channel")
            .addStringOption(o => o.setName("reason").setDescription("shown in the locked channels and the log").setMaxLength(500))
            .addBooleanOption(o => o.setName("notice").setDescription("post a note in each locked channel (default on)")))
        .addSubcommand(sub => sub.setName("off").setDescription("reopen every channel the lockdown closed"))
        .addSubcommand(sub => sub.setName("status").setDescription("show whether a lockdown is running")),

    new SlashCommandBuilder()
        .setName("perms")
        .setDescription(help.perms.summary)
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(sub => sub.setName("set").setDescription("allow or deny permissions for a role in a category or some of its channels")
            .addChannelOption(o => o.setName("category").setDescription("the category").addChannelTypes(ChannelType.GuildCategory).setRequired(true))
            .addRoleOption(o => o.setName("role").setDescription("the role").setRequired(true)))
        .addSubcommand(sub => sub.setName("clear").setDescription("remove a role's permissions from a category and every channel in it")
            .addChannelOption(o => o.setName("category").setDescription("the category").addChannelTypes(ChannelType.GuildCategory).setRequired(true))
            .addRoleOption(o => o.setName("role").setDescription("the role").setRequired(true))),
];


const rest = new REST({version: "10"}).setToken(process.env.DISCORD_TOKEN);


( async () => {
    try {
    console.log("started registering context-menu commands w/ discord..")

    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: [...commands, dmModmail()] }
    );
    console.log('successfully registered all context-menu commands.');
    const guilds = await rest.get(Routes.userGuilds());
    for (const guild of guilds) {
      await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, guild.id), { body: [guildModmail()] })
        .then(() => console.log(`registered /modmail in ${guild.name}`))
        .catch(err => console.error(`could not register /modmail in ${guild.name}:`, err.message));
    }
  } catch (error) {
    console.error('error registering commands:', error);
  }
}
)();