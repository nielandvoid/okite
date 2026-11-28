const mongoose = require('mongoose');

const noteSchema = new mongoose.Schema({
    guildId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    authorId: { type: String, required: true },
    text: { type: String, required: true }
}, { timestamps: true });

module.exports = mongoose.model('Note', noteSchema);
