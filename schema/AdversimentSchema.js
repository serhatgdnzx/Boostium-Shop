const mongoose = require('mongoose');

module.exports = new mongoose.Schema({
    Advertisements: {
        ImageURL: {
            type: String,
            required: true
        },
        Link: {
            type: String,
            required: true
        }
    },
    Advertisements2: {
        ImageURL: {
            type: String,
            required: true
        },
        Link: {
            type: String,
            required: true
        }
    }
});
