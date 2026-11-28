const mongoose = require('mongoose');

const tempRoleSchema = new mongoose.Schema({
    guildId: { type: String, required: true, index: true },
    userId: { type: String, required: true },
    roleId: { type: String, required: true },
    addedBy: { type: String, default: null },
    duration: { type: String, default: null },
    expiresAt: { type: Date, required: true, index: true }
}, { timestamps: true });

module.exports = mongoose.model('TempRole', tempRoleSchema);
