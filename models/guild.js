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

const guildSchema = new mongoose.Schema({
    guildId: { type: String, required: true, unique: true },
    logChannelId: { type: String, default: null },
    rules: [ruleSchema],
    lockedChannels: [lockedChannelSchema]
}, { timestamps: true });

module.exports = mongoose.model('Guild', guildSchema);
