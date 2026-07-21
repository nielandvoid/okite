const { REST, Routes, ApplicationCommandType, ContextMenuCommandBuilder, SlashCommandBuilder } = require("discord.js"); require("dotenv").config();

const commands = [
    new ContextMenuCommandBuilder()
        .setName("lookup")
        .setType(ApplicationCommandType.Message),

    new ContextMenuCommandBuilder()
        .setName("mark / purge range")
        .setType(ApplicationCommandType.Message),

    new ContextMenuCommandBuilder()
        .setName("reply")
        .setType(ApplicationCommandType.Message),

    new SlashCommandBuilder()
        .setName("setlog")
        .setDescription("sets the log channel for purged messages")
        .addChannelOption(option =>
            option.setName("channel")
                .setDescription("the channel to send logs to")
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("rule")
        .setDescription("manage server rules")
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
                      .setRequired(true)
               )
        )
        .addSubcommand(sub =>
            sub.setName("list")
               .setDescription("list all rules configured for this server")
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