const mongoose = require('mongoose');

module.exports = new mongoose.Schema({
    PurchasedBoosts: {
        type: Number,
        default: 0
    },
    SuccessfulOrders: {
        type: Number,
        default: 0
    },
    BoostedServers: {
        type: Number,
        default: 0
    },

    GeneralSettings: {
        type: Object,
        default: {
            siteName: 'Boostium.shop',
            siteDescription: 'Boostium.shop is a platform for boosting servers.',
            siteKeywords: 'boosts, servers, boosting, platform',
            siteUrl: 'https://boostium.shop',
            maintenanceMode: false,
            maintenanceMessage: 'Site is under maintenance. Please check back later.'
        }
    },
    ActivityLog: {
        type: [{
            action: String,
            adminId: String,
            adminName: String,
            targetType: String, // 'user', 'payment', 'boost', 'settings'
            targetId: String,
            details: Object,
            ipAddress: String,
            createdAt: { type: Date, default: Date.now }
        }],
        default: []
    },
    PromoCodes: {
        type: [{
            code: { type: String, required: true, unique: true },
            discountType: { type: String, enum: ['percentage', 'fixed'], default: 'percentage' },
            discountValue: { type: Number, required: true },
            minAmount: { type: Number, default: 0 },
            maxUses: { type: Number, default: null },
            usedCount: { type: Number, default: 0 },
            validFrom: { type: Date, default: Date.now },
            validUntil: { type: Date },
            active: { type: Boolean, default: true },
            createdAt: { type: Date, default: Date.now }
        }],
        default: []
    },
    SecuritySettings: {
        type: Object,
        default: {
            ipWhitelist: [],
            ipBlacklist: [],
            suspiciousActivityAlerts: true,
            rateLimiting: true
        }
    }
});
