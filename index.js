const {
    Client, 
    GatewayIntentBits,
    Events,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    PermissionFlagsBits
} = require("discord.js"); require("dotenv").config();

const http = require('http');
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => res.end('okite online')).listen(PORT, () => {
    console.log(`http server listening on port ${PORT}`);
});

const client = new Client({intents: [GatewayIntentBits.Guilds]});

const mongoose = require('mongoose');
const Guild = require('./models/guild');

if (process.env.MONGODB_URI) {
    mongoose.connect(process.env.MONGODB_URI)
        .then(() => console.log('connected to mongodb database'))
        .catch(err => console.error('mongodb connection error:', err));
}

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
        const { commandName, options, guildId } = interaction;
        if (commandName === 'setlog') {
            const channel = options.getChannel('channel');
            if (process.env.MONGODB_URI) {
                await Guild.findOneAndUpdate(
                    { guildId },
                    { logChannelId: channel.id },
                    { upsert: true, new: true }
                );
            } else {
                config.logChannelId = channel.id;
                fs.writeFileSync('./config.json', JSON.stringify(config, null, 4));
            }
            return interaction.reply({ content: `log channel set to <#${channel.id}>.`, ephemeral: true });
        }

        if (commandName === 'rule') {
            const subcommand = options.getSubcommand();

            if (subcommand === 'add') {
                const modal = new ModalBuilder()
                    .setCustomId('rule_add_modal')
                    .setTitle('Add Server Rule');

                const idInput = new TextInputBuilder()
                    .setCustomId('rule_id')
                    .setLabel('Rule ID (e.g. r1)')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('r1')
                    .setRequired(true);

                const labelInput = new TextInputBuilder()
                    .setCustomId('rule_label')
                    .setLabel('Rule Label / Title')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('Rule 1: Civility Rule')
                    .setRequired(true);

                const descInput = new TextInputBuilder()
                    .setCustomId('rule_desc')
                    .setLabel('Short Description (dropdown hover)')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('Be kind and respectful')
                    .setRequired(true);

                const textInput = new TextInputBuilder()
                    .setCustomId('rule_text')
                    .setLabel('Full Rule Text (markdown supported)')
                    .setStyle(TextInputStyle.Paragraph)
                    .setPlaceholder('>>> **Rule #1**\nBe kind and helpful...')
                    .setRequired(true);

                modal.addComponents(
                    new ActionRowBuilder().addComponents(idInput),
                    new ActionRowBuilder().addComponents(labelInput),
                    new ActionRowBuilder().addComponents(descInput),
                    new ActionRowBuilder().addComponents(textInput)
                );

                return interaction.showModal(modal);
            }

            if (subcommand === 'remove') {
                const targetId = options.getString('id');
                const guildConfig = await Guild.findOne({ guildId });

                if (!guildConfig || !guildConfig.rules.some(r => r.id === targetId)) {
                    return interaction.reply({ content: `rule \`${targetId}\` not found in database.`, ephemeral: true });
                }

                guildConfig.rules = guildConfig.rules.filter(r => r.id !== targetId);
                await guildConfig.save();
                return interaction.reply({ content: `removed rule \`${targetId}\`.`, ephemeral: true });
            }

            if (subcommand === 'list') {
                const guildConfig = await Guild.findOne({ guildId });
                const serverRules = (guildConfig && guildConfig.rules.length > 0) ? guildConfig.rules : rules;

                const ruleList = serverRules.map(r => `• **${r.id}** (${r.label}): ${r.desc}`).join('\n');
                return interaction.reply({ content: `**configured rules:**\n${ruleList}`, ephemeral: true });
            }
        }

        if (commandName === 'lock' || commandName === 'unlock') {
            const isLocking = commandName === 'lock';
            const targetChannel = options.getChannel('channel') || interaction.channel;

            if (!targetChannel.isTextBased()) {
                return interaction.reply({ content: 'target must be a text channel.', ephemeral: true });
            }

            await interaction.deferReply({ ephemeral: true });

            const rolesToUpdate = [interaction.guild.id];

            targetChannel.permissionOverwrites.cache.forEach((overwrite, id) => {
                if (overwrite.type === 0 && overwrite.allow.has(PermissionFlagsBits.SendMessages)) {
                    rolesToUpdate.push(id);
                }
            });

            for (const roleId of rolesToUpdate) {
                await targetChannel.permissionOverwrites.edit(roleId, {
                    SendMessages: isLocking ? false : null,
                    SendMessagesInThreads: isLocking ? false : null
                }).catch(() => null);
            }

            const notice = isLocking 
                ? 'channel has been locked.' 
                : 'channel unlocked.';

            await targetChannel.send(notice).catch(() => null);
            return interaction.editReply(`channel <#${targetChannel.id}> has been ${isLocking ? 'locked' : 'unlocked'}.`);
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

            //   
            await interaction.deferReply({ ephemeral: true });

            try {
                const messages = await interaction.channel.messages.fetch({ limit: 100 });
                const msgArray = Array.from(messages.values()).sort((a, b) => a.createdTimestamp - b.createdTimestamp);
                
                const startIndex = msgArray.findIndex(m => m.id === start.messageId);
                const endIndex = msgArray.findIndex(m => m.id === targetMessage.id);

                if (startIndex === -1 || endIndex === -1) {
                    markedpurgestarts.delete(user.id);
                    return interaction.editReply("messages are too old or not in the last 100 messages.");
                }

                const minIndex = Math.min(startIndex, endIndex);
                const maxIndex = Math.max(startIndex, endIndex);

                const toDelete = msgArray.slice(minIndex, maxIndex + 1);
                const toDeleteIds = toDelete.map(m => m.id);

                // paper trail
                const header = `purge range executed by: ${user.username} // channel: #${interaction.channel.name} // count: ${toDelete.length}\n---`;
                const logsLines = [];
                for (const m of toDelete) {
                    const time = m.createdAt.toLocaleTimeString();
                    let files = '';
                    if (m.attachments.size > 0) {
                        const catboxUrls = await Promise.all(
                            Array.from(m.attachments.values()).map(a => uploadToCatbox(a.url, a.name))
                        );
                        files = ` [files: ${catboxUrls.join(' ')}]`;
                    }
                    logsLines.push(`[${time}] ${m.author.username}: ${m.content}${files}`);
                }
                const log = `${header}\n${logsLines.join('\n')}`;

                let logChannelId = config.logChannelId || process.env.LOG_CHANNEL_ID;
                if (process.env.MONGODB_URI) {
                    const guildConfig = await Guild.findOne({ guildId: interaction.guildId });
                    if (guildConfig && guildConfig.logChannelId) {
                        logChannelId = guildConfig.logChannelId;
                    }
                }
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
            let serverRules = rules;
            if (process.env.MONGODB_URI) {
                const guildConfig = await Guild.findOne({ guildId: interaction.guildId });
                if (guildConfig && guildConfig.rules.length > 0) {
                    serverRules = guildConfig.rules;
                }
            }

            const options = serverRules.map(rule => ({
                label: rule.label,
                description: rule.desc || rule.description,
                value: rule.id
            }));

            //   
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

        if (commandName.toLowerCase() === 'reply') {
            const modal = new ModalBuilder()
                .setCustomId(`reply_modal:${targetMessage.id}`)
                .setTitle('reply as Okite');

            const replyInput = new TextInputBuilder()
                .setCustomId('reply_text')
                .setLabel('reply message')
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder('type your reply here...')
                .setRequired(true);

            const row = new ActionRowBuilder().addComponents(replyInput);
            modal.addComponents(row);

            return interaction.showModal(modal);
        }
    }

    // 
    if (interaction.isStringSelectMenu()) {
        const { customId, values } = interaction;
        const [action, targetUserId, targetMessageId] = customId.split(':');
        const selectedValue = values[0];

        // 
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

        let serverRules = rules;
        if (process.env.MONGODB_URI) {
            const guildConfig = await Guild.findOne({ guildId: interaction.guildId });
            if (guildConfig && guildConfig.rules.length > 0) {
                serverRules = guildConfig.rules;
            }
        }

        const selectedRule = serverRules.find(r => r.id === selectedValue);
        if (!selectedRule) return interaction.reply({ content: 'rule not found.', ephemeral: true });

        await handleModerationAction(interaction, action, targetUserId, targetMessageId, selectedRule.text);
    }

    // modal submit handler
    if (interaction.isModalSubmit()) {
        const { customId, fields } = interaction;

        if (customId === 'rule_add_modal') {
            await interaction.deferReply({ ephemeral: true });
            const id = fields.getTextInputValue('rule_id').trim();
            const label = fields.getTextInputValue('rule_label').trim();
            const desc = fields.getTextInputValue('rule_desc').trim();
            const text = fields.getTextInputValue('rule_text').trim();

            let guildConfig = await Guild.findOne({ guildId: interaction.guildId });
            if (!guildConfig) {
                guildConfig = new Guild({ guildId: interaction.guildId, rules: [] });
            }

            const existingIndex = guildConfig.rules.findIndex(r => r.id === id);
            if (existingIndex >= 0) {
                guildConfig.rules[existingIndex] = { id, label, desc, text };
            } else {
                guildConfig.rules.push({ id, label, desc, text });
            }

            await guildConfig.save();
            return interaction.editReply(`added / updated rule \`${id}\` (${label}).`);
        }

        if (customId.startsWith('reply_modal:')) {
            await interaction.deferReply({ ephemeral: true });
            const targetMessageId = customId.split(':')[1];
            const replyText = fields.getTextInputValue('reply_text');

            const targetMessage = await interaction.channel.messages.fetch(targetMessageId).catch(() => null);
            if (!targetMessage) {
                return interaction.editReply(`original message not found.`);
            }

            await targetMessage.reply(replyText);
            return interaction.editReply(`reply sent.`);
        }

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

            // reply & ping author
            await targetMessage.reply(`staff notice for <@${targetMessage.author.id}>:\n${reason}`);

            // log cited message
            const time = targetMessage.createdAt.toLocaleTimeString();
            let files = '';
            if (targetMessage.attachments.size > 0) {
                const catboxUrls = await Promise.all(
                    Array.from(targetMessage.attachments.values()).map(a => uploadToCatbox(a.url, a.name))
                );
                files = ` [files: ${catboxUrls.join(' ')}]`;
            }

            const header = `rule citation by: ${interaction.user.username} // user: ${targetMessage.author.username} // channel: #${interaction.channel.name}\n---`;
            const logLine = `[${time}] ${targetMessage.author.username}: ${targetMessage.content}${files}`;
            const log = `${header}\n${logLine}`;

            console.log(log);

            let logChannelId = config.logChannelId || process.env.LOG_CHANNEL_ID;
            if (process.env.MONGODB_URI) {
                const guildConfig = await Guild.findOne({ guildId: interaction.guildId });
                if (guildConfig && guildConfig.logChannelId) {
                    logChannelId = guildConfig.logChannelId;
                }
            }
            let logChannel = logChannelId ? interaction.guild.channels.cache.get(logChannelId) : null;
            if (!logChannel) {
                logChannel = interaction.guild.channels.cache.find(c => c.name === 'logs' || c.name === 'mod-logs');
            }
            if (logChannel) {
                await logChannel.send(`\`\`\`\n${log.slice(0, 1900)}\n\`\`\``).catch(() => null);
            }

            // delete parent message
            await targetMessage.delete().catch(() => null);

            return interaction.editReply(`rule citation posted & parent message deleted.`);
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