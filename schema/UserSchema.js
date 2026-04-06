const mongoose = require('mongoose');

module.exports = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },
    password: {
        type: String,
        required: true,
        minlength: 6
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    UserPermissions: {
        type: Array,
        default: ['user']
    },
    UserBalance: {
        type: Number,
        default: 0
    },
    TotalSpent: {
        type: Number,
        default: 0
    },
    Rank: {
        type: String,
        default: 'No Rank'
    },
    RankXP: {
        type: Number,
        default: 0
    },
    RankNextXP: {
        type: Number,
        default: 0
    },
    OrderHistory: {
        type: Array,
        default: []
    },
    PaymentHistory: {
        type: [{
            paymentId: {
                type: String,
                required: true
            },
            orderId: {
                type: String,
                required: true
            },
            amount: {
                type: Number,
                required: true
            },
            currency: {
                type: String,
                default: 'USD'
            },
            paymentMethod: {
                type: String,
                default: 'Bitcoin'
            },
            status: {
                type: String,
                enum: ['waiting', 'confirming', 'confirmed', 'finished', 'failed', 'refunded', 'expired'],
                default: 'waiting'
            },
            btcAmount: {
                type: String,
                default: null
            },
            btcAddress: {
                type: String,
                default: null
            },
            createdAt: {
                type: Date,
                default: Date.now
            },
            completedAt: {
                type: Date,
                default: null
            },
            testMode: {
                type: Boolean,
                default: false
            }
        }],
        default: []
    },
    BoostPurchaseHistory: {
        type: [{
            packageId: {
                type: String,
                required: true
            },
            packageName: {
                type: String,
                required: true
            },
            quantity: {
                type: Number,
                required: true
            },
            duration: {
                type: Number,
                required: true
            },
            price: {
                type: Number,
                required: true
            },
            previousBalance: {
                type: Number,
                required: true
            },
            newBalance: {
                type: Number,
                required: true
            },
            discordInvite: {
                type: String,
                required: true
            },
            createdAt: {
                type: Date,
                default: Date.now
            }
        }],
        default: []
    },
    banned: {
        type: Boolean,
        default: false
    },
    banReason: {
        type: String,
        default: null
    },
    bannedAt: {
        type: Date,
        default: null
    },
    adminNotes: {
        type: [{
            note: String,
            adminId: String,
            adminName: String,
            createdAt: { type: Date, default: Date.now }
        }],
        default: []
    },
    lastLogin: {
        type: Date,
        default: null
    },
    ipAddress: {
        type: String,
        default: null
    },
    loginHistory: {
        type: [{
            ip: String,
            userAgent: String,
            loginAt: { type: Date, default: Date.now }
        }],
        default: []
    }
});
