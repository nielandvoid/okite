const mongoose = require('mongoose');

const ticketSchema = new mongoose.Schema({
    guildId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    number: { type: Number, default: 0 },
    channelId: { type: String, default: null },
    threadId: { type: String, default: null, index: true },
    headerId: { type: String, default: null },
    status: { type: String, default: 'open' },
    openedBy: { type: String, default: null },
    claimedBy: { type: String, default: null },
    closedBy: { type: String, default: null },
    closedAt: { type: Date, default: null },
    closeReason: { type: String, default: null },
    userMessages: { type: Number, default: 0 },
    modMessages: { type: Number, default: 0 },
    lastActivity: { type: Date, default: Date.now },
    activeAt: { type: Date, default: null },
    round: { type: mongoose.Schema.Types.Mixed, default: null },
    thread: { type: mongoose.Schema.Types.Mixed, default: null },
    dmIds: { type: [String], default: [] }
}, { timestamps: true });

module.exports = mongoose.model('Ticket', ticketSchema);
