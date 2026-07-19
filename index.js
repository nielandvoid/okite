const {
    Client, 
    GatewayIntentBits,
    Events,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle
} = require("discord.js"); require("dotenv").config();

const http = require('http');
http.createServer((req, res) => res.end('okite online')).listen(process.env.PORT || 3000);

const client = new Client({intents: [GatewayIntentBits.Guilds]});

const rules = require('./rules.json')
const fs = require('fs');
let config = require('./config.json');

const markedpurgestarts = new Map();

client.once(Events.ClientReady, (readyClient) => {
    console.log(`ready - logged in as ${readyClient.user.tag}`);
});


// brain cell #1

client.on(Events.InteractionCreate, async (interaction) => {

    if (interaction.isChatInputCommand()) {
        const { commandName } = interaction;
        if (commandName === 'setlog') {
            const channel = interaction.options.getChannel('channel');
            config.logChannelId = channel.id;
            fs.writeFileSync('./config.json', JSON.stringify(config, null, 4));
            return interaction.reply({ content: `log channel set to <#${channel.id}>.`, ephemeral: true });
        }
    }

    if (interaction.isMessageContextMenuCommand()) {
        const { commandName, targetMessage, user } = interaction;
        const targetUser = targetMessage.author;
    
        
        if (commandName.toLowerCase() === 'mark / purge range') {
            const start = markedpurgestarts.get(user.id); 

            if (!start || start.channelId !== interaction.channelId) {
                markedpurgestarts.set(user.id, {
                    channelId: interaction.channelId,
                    messageId: targetMessage.id
                });
                return interaction.reply({ 
                    content: 'initial point marked. right-click the endpoint and select **mark / purge range** to purge the range.', 
                    ephemeral: true 
                });
            }

            await interaction.deferReply({ ephemeral: true });
            try {
                const startId = start.messageId;
                const endId = targetMessage.id;
                const [olderId, newerId] = BigInt(startId) < BigInt(endId) 
                    ? [startId, endId] 
                    : [endId, startId];

                const fetchedMessages = await interaction.channel.messages.fetch({
                    after: olderId,
                    limit: 100
                });

                const olderMessage = await interaction.channel.messages.fetch(olderId).catch(() => null);

                const toDeleteIds = Array.from(
                    fetchedMessages
                        .filter(msg => BigInt(msg.id) <= BigInt(newerId))
                        .keys()
                );
                
                toDeleteIds.push(olderId);


                // paper trail
                const header = `purged by: ${user.username} // channel: #${interaction.channel.name} // count: ${toDeleteIds.length}\n---`;

                const logLinesArray = await Promise.all(toDeleteIds.map(async id => {
                    let msg = fetchedMessages.get(id);
                    if (!msg) {
                        if (id === targetMessage.id) msg = targetMessage;
                        else if (id === olderId) msg = olderMessage;
                    }
                    if (!msg) return `[id: ${id}]`;

                    const time = msg.createdAt.toLocaleTimeString();
                    let files = '';
                    if (msg.attachments.size > 0) {
                        const catboxUrls = await Promise.all(
                            Array.from(msg.attachments.values()).map(a => uploadToCatbox(a.url, a.name))
                        );
                        files = ` [files: ${catboxUrls.join(' ')}]`;
                    }
                    return `[${time}] ${msg.author.username}: ${msg.content}${files}`;
                }));

                const logLines = logLinesArray.reverse().join('\n');
                const log = `${header}\n${logLines}`;

                console.log(log);

                const logChannelId = config.logChannelId || process.env.LOG_CHANNEL_ID;
                let logChannel = logChannelId ? interaction.guild.channels.cache.get(logChannelId) : null;
                if (!logChannel) {
                    logChannel = interaction.guild.channels.cache.find(c => c.name === 'logs' || c.name === 'mod-logs');
                }
                if (logChannel) {
                    await logChannel.send(`\`\`\`\n${log.slice(0, 1900)}\n\`\`\``).catch(() => null);
                }

                
                await interaction.channel.bulkDelete(toDeleteIds);
                markedpurgestarts.delete(user.id);  // reset mark

                return interaction.editReply(`purged ${toDeleteIds.length} messages.`);

            } catch (error) {
                console.error(error);
                return interaction.editReply("failed to purge messages. note: messages must be under 14 days old to bulk delete. [why?](<https://docs.discord.com/developers/resources/message#bulk-delete-messages>)");
            }
        }


        // cite
        if (commandName === 'lookup') {
            const options = rules.map(rule => ({
                label: rule.label,
                description: rule.desc || rule.description,
                value: rule.id
            }));

            // A
            options.push({
                label: 'custom',
                description: 'provide manually, reason(s) for this action.',
                value: 'custom'
            });

            const customId = `${commandName}:${targetUser.id}:${targetMessage.id}`;
            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId(customId)
                .setPlaceholder('select a rule violation')
                .addOptions(options);
            const row = new ActionRowBuilder().addComponents(selectMenu);
            return interaction.reply({
                content: `select a rule for **${commandName}** on **${targetUser.username}**:`,
                components: [row],
                ephemeral: true
            });
        }
    }

    // 
    if (interaction.isStringSelectMenu()) {
        const { customId, values } = interaction;
        const [action, targetUserId, targetMessageId] = customId.split(':');
        const selectedValue = values[0];

        // if custom reason, show modal
        if (selectedValue === 'custom') {
            const modal = new ModalBuilder()
                .setCustomId(`modal:${action}:${targetUserId}:${targetMessageId}`)
                .setTitle(`Custom Reason for ${action.toUpperCase()}`);

            const reasonInput = new TextInputBuilder()
                .setCustomId('reason')
                .setLabel('Reason')
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder('type the reason here...')
                .setRequired(true);

            const row = new ActionRowBuilder().addComponents(reasonInput);
            modal.addComponents(row);

            return interaction.showModal(modal);
        }

        const selectedRule = rules.find(r => r.id === selectedValue);
        if (!selectedRule) return interaction.reply({ content: 'rule not found.', ephemeral: true });

        await handleModerationAction(interaction, action, targetUserId, targetMessageId, selectedRule.text);
    }

    // modal submit handler
    if (interaction.isModalSubmit()) {
        const { customId, fields } = interaction;
        const [, action, targetUserId, targetMessageId] = customId.split(':');
        const reason = fields.getTextInputValue('reason');

        await handleModerationAction(interaction, action, targetUserId, targetMessageId, reason);
    }
});

// helpe
async function handleModerationAction(interaction, action, targetUserId, targetMessageId, reason) {
    await interaction.deferReply({ ephemeral: true });

    const channel = interaction.channel;

    try {
        const targetMessage = await channel.messages.fetch(targetMessageId).catch(() => null);

        if (action === 'lookup') {
            if (!targetMessage) {
                return interaction.editReply(`original message not found.`);
            }
            await targetMessage.reply(`staff notice:\n${reason}`);
            return interaction.editReply(`rule citation posted.`);
        }

    } catch (error) {
        console.error(error);
        return interaction.editReply(`skill issue: ${error.message}`);
    }
}

// yeet to catbox
async function uploadToCatbox(url, filename) {
    try {
        const res = await fetch(url);
        const buffer = await res.arrayBuffer();
        const blob = new Blob([buffer]);

        const formData = new FormData();
        formData.append('reqtype', 'fileupload');
        formData.append('fileToUpload', blob, filename || 'file');

        const catboxRes = await fetch('https://catbox.moe/user/api.php', {
            method: 'POST',
            body: formData
        });

        if (catboxRes.ok) {
            const catboxUrl = await catboxRes.text();
            return catboxUrl.trim();
        }
    } catch (e) {
        console.error('catbox upload error:', e);
    }
    return url;
}

client.login(process.env.DISCORD_TOKEN);