const mongoose = require('mongoose');

const answerSchema = new mongoose.Schema({
    question: { type: String, required: true },
    answer: { type: String, default: '' }
}, { _id: false });

const appealSchema = new mongoose.Schema({
    guildId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    kind: { type: String, default: 'ban' },
    caseNumber: { type: Number, default: null },
    answers: [answerSchema],
    status: { type: String, default: 'pending' },
    channelId: { type: String, default: null },
    messageId: { type: String, default: null },
    decidedBy: { type: String, default: null },
    decidedAt: { type: Date, default: null },
    decisionNote: { type: String, default: null }
}, { timestamps: true });

module.exports = mongoose.model('Appeal', appealSchema);
