const mongoose = require('mongoose');

module.exports = new mongoose.Schema({
    UserID: {
        type: String,
        required: true
    },
    Comment: {
        type: String,
        required: true
    },
    CreatedAt: {
        type: Date,
        default: Date.now
    },
    Stars: {
        type: Number,
        required: true,
        min: 1,
        max: 5
    }
});
