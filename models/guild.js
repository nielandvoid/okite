const mongoose = require('mongoose');

const ruleSchema = new mongoose.Schema({
    id: { type: String, required: true },
    label: { type: String, required: true },
    desc: { type: String, required: true },
    text: { type: String, required: true }
}, { _id: false });

const lockedChannelSchema = new mongoose.Schema({
    channelId: { type: String, required: true },
    lockedRoleIds: [String]
}, { _id: false });

const aliasSchema = new mongoose.Schema({
    name: { type: String, required: true },
    command: { type: String, required: true }
}, { _id: false });

const guildSchema = new mongoose.Schema({
    guildId: { type: String, required: true, unique: true },
    logChannelId: { type: String, default: null },
    prefix: { type: String, default: null },
    autoPurge: { type: Boolean, default: false },
    autoPurgeParent: { type: Boolean, default: true },
    autoCorrect: { type: Boolean, default: false },
    requireRule: { type: Boolean, default: false },
    timezone: { type: String, default: null },
    citationChannelId: { type: String, default: null },
    purgeChannelId: { type: String, default: null },
    moderationChannelId: { type: String, default: null },
    messagesChannelId: { type: String, default: null },
    membersChannelId: { type: String, default: null },
    voiceChannelId: { type: String, default: null },
    serverChannelId: { type: String, default: null },
    rules: [ruleSchema],
    lockedChannels: [lockedChannelSchema],
    aliases: [aliasSchema]
}, { timestamps: true });

module.exports = mongoose.model('Guild', guildSchema);
