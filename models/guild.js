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
    autoPurgeResult: { type: Boolean, default: false },
    autoCorrect: { type: Boolean, default: false },
    requireRule: { type: Boolean, default: false },
    messageLogs: { type: Boolean, default: false },
    banCleanup: { type: Boolean, default: true },
    banCleanupDays: { type: Number, default: 7 },
    userDms: { type: Boolean, default: true },
    userDmActions: { type: [String], default: ['ban', 'kick', 'mute', 'unmute', 'warn', 'cite', 'void'] },
    userDmShowMod: { type: Boolean, default: false },
    watchdogEnabled: { type: Boolean, default: true },
    watchdogChannels: { type: Number, default: 3 },
    watchdogSeconds: { type: Number, default: 30 },
    watchdogMute: { type: String, default: '1d' },
    honeypotChannelId: { type: String, default: null },
    honeypotAction: { type: String, default: 'softban' },
    honeypotInvite: { type: Boolean, default: false },
    appealsEnabled: { type: Boolean, default: false },
    appealsChannelId: { type: String, default: null },
    appealBlocked: { type: [String], default: [] },
    modRoleId: { type: String, default: null },
    modmailEnabled: { type: Boolean, default: false },
    modmailChannelId: { type: String, default: null },
    modmailAsServer: { type: Boolean, default: true },
    modmailPing: { type: Boolean, default: true },
    modmailGreeting: { type: String, default: null },
    modmailCloseMessage: { type: String, default: null },
    modmailBlocked: { type: [String], default: [] },
    joinGateEnabled: { type: Boolean, default: false },
    joinGateDays: { type: Number, default: 7 },
    joinGateAction: { type: String, default: 'kick' },
    joinGateMute: { type: String, default: '1d' },
    joinGateNoAvatar: { type: Boolean, default: false },
    joinGateAllowed: { type: [String], default: [] },
    lockdown: { type: mongoose.Schema.Types.Mixed, default: null },
    appealQuestions: [new mongoose.Schema({ label: { type: String, required: true }, hint: { type: String, default: '' } }, { _id: false })],
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
