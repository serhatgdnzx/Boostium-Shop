const mongoose = require('mongoose');

module.exports = new mongoose.Schema({
    PromoCodes: {
        type: String,
        required: true
    },
    Discount: {
        type: Number,
        required: true
    },
    ExpiryDate: {
        type: Date,
        required: true
    }
});
