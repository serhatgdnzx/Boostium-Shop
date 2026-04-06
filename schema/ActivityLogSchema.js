const mongoose = require('mongoose');

module.exports = new mongoose.Schema({
    action: {
        type: String,
        required: true
    },
    adminId: {
        type: String,
        required: true
    },
    adminName: {
        type: String,
        required: true
    },
    targetType: {
        type: String,
        enum: ['user', 'payment', 'boost', 'settings', 'system'],
        required: true
    },
    targetId: {
        type: String,
        default: null
    },
    details: {
        type: Object,
        default: {}
    },
    ipAddress: {
        type: String,
        default: null
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});


