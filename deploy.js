const { REST, Routes, ApplicationCommandType, ContextMenuCommandBuilder, SlashCommandBuilder, PermissionFlagsBits } = require("discord.js"); require("dotenv").config(); const help = require("./help");

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
                { name: "parent (the message being cited or infractioned)", value: "parent" }
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
        .addBooleanOption(o => o.setName("urgent").setDescription("illegal content: delete their last 7 days now, save nothing")),

    new SlashCommandBuilder()
        .setName("purge")
        .setDescription(help.purge.summary)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addIntegerOption(o => o.setName("count").setDescription("how many messages (1-1000)").setMinValue(1).setMaxValue(1000).setRequired(true))
        .addUserOption(o => o.setName("user1").setDescription("only delete messages from this user"))
        .addUserOption(o => o.setName("user2").setDescription("also include this user"))
        .addUserOption(o => o.setName("user3").setDescription("also include this user")),

    new SlashCommandBuilder()
        .setName("kick")
        .setDescription(help.kick.summary)
        .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
        .addUserOption(o => o.setName("user").setDescription("the user to kick").setRequired(true))
        .addStringOption(o => o.setName("rule").setDescription("the rule that was broken, or leave blank for custom").setAutocomplete(true))
        .addStringOption(o => o.setName("reason").setDescription("why").setMaxLength(400)),

    new SlashCommandBuilder()
        .setName("softban")
        .setDescription(help.softban.summary)
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
        .addUserOption(o => o.setName("user").setDescription("the user to softban").setRequired(true))
        .addStringOption(o => o.setName("rule").setDescription("the rule that was broken, or leave blank for custom").setAutocomplete(true))
        .addStringOption(o => o.setName("reason").setDescription("why").setMaxLength(400)),

    new SlashCommandBuilder()
        .setName("mute")
        .setDescription(help.mute.summary)
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .addUserOption(o => o.setName("user").setDescription("the user to mute").setRequired(true))
        .addStringOption(o => o.setName("duration").setDescription("how long (30m, 12h, 7d, permanent); defaults to permanent").setAutocomplete(true))
        .addStringOption(o => o.setName("rule").setDescription("the rule that was broken, or leave blank for custom").setAutocomplete(true))
        .addStringOption(o => o.setName("reason").setDescription("why").setMaxLength(400)),

    new SlashCommandBuilder()
        .setName("unmute")
        .setDescription(help.unmute.summary)
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .addUserOption(o => o.setName("user").setDescription("the user to unmute").setRequired(true))
        .addStringOption(o => o.setName("reason").setDescription("why").setMaxLength(400)),

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
];

const rest = new REST({version: "10"}).setToken(process.env.DISCORD_TOKEN);


( async () => {
    try {
    console.log("started registering context-menu commands w/ discord..")

    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands }
    );
    console.log('successfully registered all context-menu commands.');
  } catch (error) {
    console.error('error registering commands:', error);
  }
}
)();