const { REST, Routes, ApplicationCommandType, ContextMenuCommandBuilder, SlashCommandBuilder } = require("discord.js"); require("dotenv").config();

const commands = [
    new ContextMenuCommandBuilder()
        .setName("lookup")
        .setType(ApplicationCommandType.Message),

    new ContextMenuCommandBuilder()
        .setName("mark / purge range")
        .setType(ApplicationCommandType.Message),

    new SlashCommandBuilder()
        .setName("setlog")
        .setDescription("sets the log channel for purged messages")
        .addChannelOption(option =>
            option.setName("channel")
                .setDescription("the channel to send logs to")
                .setRequired(true)
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