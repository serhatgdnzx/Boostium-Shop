const express = require('express');
const router = express.Router();
const User = require('../models/User');
const BoostPackage = require('../models/BoostPackage');
const GeneralSite = require('../models/GeneralSite');
const authenticateAdmin = require('../middleware/admin');
const fs = require('fs');
const path = require('path');

router.get('/stats', authenticateAdmin, async (req, res) => {
    try {
        const totalUsers = await User.countDocuments();
        
        const allUsers = await User.find().select('PaymentHistory TotalSpent');
        let totalRevenue = 0;
        let totalPayments = 0;
        let completedPayments = 0;
        
        allUsers.forEach(user => {
            totalRevenue += user.TotalSpent || 0;
            if (user.PaymentHistory) {
                user.PaymentHistory.forEach(payment => {
                    totalPayments++;
                    if (payment.status === 'confirmed' || payment.status === 'finished') {
                        completedPayments++;
                    }
                });
            }
        });

        let totalBoostPurchases = 0;
        allUsers.forEach(user => {
            if (user.BoostPurchaseHistory) {
                totalBoostPurchases += user.BoostPurchaseHistory.length;
            }
        });

        const generalStats = await GeneralSite.findOne();
        
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const recentUsers = await User.countDocuments({ createdAt: { $gte: sevenDaysAgo } });

        let recentPayments = 0;
        let recentRevenue = 0;
        allUsers.forEach(user => {
            if (user.PaymentHistory) {
                user.PaymentHistory.forEach(payment => {
                    if (new Date(payment.createdAt) >= sevenDaysAgo) {
                        recentPayments++;
                        if (payment.status === 'confirmed' || payment.status === 'finished') {
                            recentRevenue += payment.amount || 0;
                        }
                    }
                });
            }
        });

        res.json({
            success: true,
            stats: {
                totalUsers,
                totalRevenue: totalRevenue.toFixed(2),
                totalPayments,
                completedPayments,
                totalBoostPurchases,
                recentUsers,
                recentPayments,
                recentRevenue: recentRevenue.toFixed(2),
                purchasedBoosts: generalStats?.PurchasedBoosts || 0,
                successfulOrders: generalStats?.SuccessfulOrders || 0,
                boostedServers: generalStats?.BoostedServers || 0
            }
        });
    } catch (error) {
        console.error('Admin stats error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch statistics' });
    }
});

router.get('/users', authenticateAdmin, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const search = req.query.search || '';
        const skip = (page - 1) * limit;

        let query = {};
        if (search) {
            query = {
                $or: [
                    { name: { $regex: search, $options: 'i' } },
                    { email: { $regex: search, $options: 'i' } }
                ]
            };
        }

        const users = await User.find(query)
            .select('-password')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();

        const totalUsers = await User.countDocuments(query);

        const usersWithStats = users.map(user => ({
            ...user,
            totalPayments: user.PaymentHistory?.length || 0,
            totalBoostPurchases: user.BoostPurchaseHistory?.length || 0,
            totalSpent: user.TotalSpent || 0
        }));

        res.json({
            success: true,
            users: usersWithStats,
            pagination: {
                page,
                limit,
                total: totalUsers,
                pages: Math.ceil(totalUsers / limit)
            }
        });
    } catch (error) {
        console.error('Admin users fetch error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch users' });
    }
});

router.get('/users/:userId', authenticateAdmin, async (req, res) => {
    try {
        const user = await User.findById(req.params.userId).select('-password');
        
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        res.json({
            success: true,
            user
        });
    } catch (error) {
        console.error('Admin user fetch error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch user' });
    }
});

router.put('/users/:userId', authenticateAdmin, async (req, res) => {
    try {
        const { balance, permissions, rank, rankXP } = req.body;
        const user = await User.findById(req.params.userId);

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const oldBalance = user.UserBalance;
        const oldPermissions = [...(user.UserPermissions || [])];

        if (balance !== undefined) {
            user.UserBalance = parseFloat(balance);
        }

        if (permissions !== undefined && Array.isArray(permissions)) {
            user.UserPermissions = permissions;
        }

        if (rank !== undefined) {
            user.Rank = rank;
        }

        if (rankXP !== undefined) {
            user.RankXP = parseInt(rankXP);
        }

        await user.save();
        
        await logActivity('update_user', req.userId, req.user.name, 'user', req.params.userId, {
            balance: { old: oldBalance, new: user.UserBalance },
            permissions: { old: oldPermissions, new: user.UserPermissions }
        }, req.ip);

        res.json({
            success: true,
            message: 'User updated successfully',
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                balance: user.UserBalance,
                permissions: user.UserPermissions,
                rank: user.Rank,
                rankXP: user.RankXP
            }
        });
    } catch (error) {
        console.error('Admin user update error:', error);
        res.status(500).json({ success: false, message: 'Failed to update user' });
    }
});

router.delete('/users/:userId', authenticateAdmin, async (req, res) => {
    try {
        const user = await User.findById(req.params.userId);

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        if (user.UserPermissions && user.UserPermissions.includes('admin')) {
            return res.status(403).json({ success: false, message: 'Cannot delete admin users' });
        }

        await User.findByIdAndDelete(req.params.userId);
        
        await logActivity('delete_user', req.userId, req.user.name, 'user', req.params.userId, { userName: user.name }, req.ip);

        res.json({
            success: true,
            message: 'User deleted successfully'
        });
    } catch (error) {
        console.error('Admin user delete error:', error);
        res.status(500).json({ success: false, message: 'Failed to delete user' });
    }
});

router.get('/payments', authenticateAdmin, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const skip = (page - 1) * limit;

        const users = await User.find({ 'PaymentHistory.0': { $exists: true } })
            .select('name email PaymentHistory')
            .lean();

        let allPayments = [];
        users.forEach(user => {
            if (user.PaymentHistory) {
                user.PaymentHistory.forEach(payment => {
                    allPayments.push({
                        ...payment,
                        userId: user._id.toString(),
                        userName: user.name,
                        userEmail: user.email
                    });
                });
            }
        });

        allPayments.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        const total = allPayments.length;
        const paginatedPayments = allPayments.slice(skip, skip + limit);

        res.json({
            success: true,
            payments: paginatedPayments,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Admin payments fetch error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch payments' });
    }
});

router.get('/boost-purchases', authenticateAdmin, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const skip = (page - 1) * limit;

        const users = await User.find({ 'BoostPurchaseHistory.0': { $exists: true } })
            .select('name email BoostPurchaseHistory')
            .lean();

        let allPurchases = [];
        users.forEach(user => {
            if (user.BoostPurchaseHistory) {
                user.BoostPurchaseHistory.forEach(purchase => {
                    allPurchases.push({
                        ...purchase,
                        userId: user._id.toString(),
                        userName: user.name,
                        userEmail: user.email
                    });
                });
            }
        });

        allPurchases.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        const total = allPurchases.length;
        const paginatedPurchases = allPurchases.slice(skip, skip + limit);

        res.json({
            success: true,
            purchases: paginatedPurchases,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Admin boost purchases fetch error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch boost purchases' });
    }
});

router.get('/boosts', authenticateAdmin, async (req, res) => {
    try {
        const packages = await BoostPackage.find().sort({ duration: 1, quantity: 1 });
        res.json({ success: true, packages });
    } catch (error) {
        console.error('Admin boosts fetch error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch boost packages' });
    }
});

router.patch('/boosts/:packageId/stock', authenticateAdmin, async (req, res) => {
    try {
        const { inStock } = req.body;
        const package = await BoostPackage.findById(req.params.packageId);
        
        if (!package) {
            return res.status(404).json({ success: false, message: 'Package not found' });
        }
        
        package.inStock = inStock === true;
        await package.save();
        
        await logActivity('toggle_stock', req.userId, req.user.name, 'boost', req.params.packageId, { inStock }, req.ip);
        
        res.json({ success: true, message: 'Stock status updated', package });
    } catch (error) {
        console.error('Toggle stock error:', error);
        res.status(500).json({ success: false, message: 'Failed to update stock status' });
    }
});

router.post('/boosts', authenticateAdmin, async (req, res) => {
    try {
        const { name, quantity, price, pricePerBoost, duration, inStock } = req.body;

        if (!name || !quantity || !price || !pricePerBoost || !duration) {
            return res.status(400).json({ success: false, message: 'All fields are required' });
        }

        const package = new BoostPackage({
            name,
            quantity: parseInt(quantity),
            price: parseFloat(price),
            pricePerBoost: parseFloat(pricePerBoost),
            duration: parseInt(duration),
            inStock: inStock !== undefined ? inStock : true
        });

        await package.save();
        
        await logActivity('create_boost', req.userId, req.user.name, 'boost', package._id.toString(), { quantity: package.quantity, price: package.price }, req.ip);

        res.json({ success: true, message: 'Boost package created successfully', package });
    } catch (error) {
        console.error('Admin boost create error:', error);
        res.status(500).json({ success: false, message: 'Failed to create boost package' });
    }
});

router.put('/boosts/:packageId', authenticateAdmin, async (req, res) => {
    try {
        const { name, quantity, price, pricePerBoost, duration, inStock } = req.body;

        const package = await BoostPackage.findById(req.params.packageId);

        if (!package) {
            return res.status(404).json({ success: false, message: 'Package not found' });
        }

        if (name !== undefined) package.name = name;
        if (quantity !== undefined) package.quantity = parseInt(quantity);
        if (duration !== undefined) package.duration = parseInt(duration);
        if (price !== undefined) package.price = parseFloat(price);
        if (pricePerBoost !== undefined) package.pricePerBoost = parseFloat(pricePerBoost);
        if (inStock !== undefined) package.inStock = inStock;

        await package.save();
        
        await logActivity('update_boost', req.userId, req.user.name, 'boost', req.params.packageId, {}, req.ip);

        res.json({ success: true, message: 'Boost package updated successfully', package });
    } catch (error) {
        console.error('Admin boost update error:', error);
        res.status(500).json({ success: false, message: 'Failed to update boost package' });
    }
});

router.delete('/boosts/:packageId', authenticateAdmin, async (req, res) => {
    try {
        const package = await BoostPackage.findById(req.params.packageId);

        if (!package) {
            return res.status(404).json({ success: false, message: 'Package not found' });
        }

        await BoostPackage.findByIdAndDelete(req.params.packageId);
        
        await logActivity('delete_boost', req.userId, req.user.name, 'boost', req.params.packageId, {}, req.ip);

        res.json({ success: true, message: 'Boost package deleted successfully' });
    } catch (error) {
        console.error('Admin boost delete error:', error);
        res.status(500).json({ success: false, message: 'Failed to delete boost package' });
    }
});

router.put('/settings', authenticateAdmin, async (req, res) => {
    try {
        let generalSite = await GeneralSite.findOne();

        if (!generalSite) {
            generalSite = new GeneralSite();
        }

        const { PurchasedBoosts, SuccessfulOrders, BoostedServers, GeneralSettings, SecuritySettings } = req.body;

        if (PurchasedBoosts !== undefined) generalSite.PurchasedBoosts = parseInt(PurchasedBoosts);
        if (SuccessfulOrders !== undefined) generalSite.SuccessfulOrders = parseInt(SuccessfulOrders);
        if (BoostedServers !== undefined) generalSite.BoostedServers = parseInt(BoostedServers);
        
        if (GeneralSettings) {
            if (!generalSite.GeneralSettings) {
                generalSite.GeneralSettings = {};
            }
            Object.assign(generalSite.GeneralSettings, GeneralSettings);
        }
        
        if (SecuritySettings) {
            if (!generalSite.SecuritySettings) {
                generalSite.SecuritySettings = {};
            }
            Object.assign(generalSite.SecuritySettings, SecuritySettings);
        }

        await generalSite.save();
        
        await logActivity('update_settings', req.userId, req.user.name, 'settings', null, { updatedFields: Object.keys(req.body) }, req.ip);

        res.json({ success: true, message: 'Settings updated successfully', settings: generalSite });
    } catch (error) {
        console.error('Admin settings update error:', error);
        res.status(500).json({ success: false, message: 'Failed to update settings' });
    }
});

router.get('/settings', authenticateAdmin, async (req, res) => {
    try {
        let generalSite = await GeneralSite.findOne().lean();

        if (!generalSite) {
            generalSite = await GeneralSite.create({});
            generalSite = generalSite.toObject();
        }

        if (!generalSite.GeneralSettings) {
            generalSite.GeneralSettings = {
                siteName: 'Boostium.shop',
                siteDescription: 'Boostium.shop is a platform for boosting servers.',
                siteKeywords: 'boosts, servers, boosting, platform',
                siteUrl: 'https://boostium.shop',
                maintenanceMode: false,
                maintenanceMessage: 'Site is under maintenance. Please check back later.'
            };
        }

        if (typeof generalSite.GeneralSettings.maintenanceMode !== 'boolean') {
            generalSite.GeneralSettings.maintenanceMode = generalSite.GeneralSettings.maintenanceMode === true || generalSite.GeneralSettings.maintenanceMode === 'true';
        }


        res.json({ success: true, settings: generalSite });
    } catch (error) {
        console.error('Admin settings fetch error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch settings' });
    }
});

async function logActivity(action, adminId, adminName, targetType, targetId, details, ipAddress) {
    try {
        let generalSite = await GeneralSite.findOne();
        if (!generalSite) {
            generalSite = await GeneralSite.create({});
        }
        
        if (!generalSite.ActivityLog) {
            generalSite.ActivityLog = [];
        }
        
        generalSite.ActivityLog.push({
            action,
            adminId: adminId ? adminId.toString() : 'unknown',
            adminName: adminName || 'Unknown',
            targetType,
            targetId: targetId ? targetId.toString() : null,
            details: details || {},
            ipAddress: ipAddress || 'unknown',
            createdAt: new Date()
        });
        
        if (generalSite.ActivityLog.length > 1000) {
            generalSite.ActivityLog = generalSite.ActivityLog.slice(-1000);
        }
        
        await generalSite.save();
    } catch (error) {
        console.error('Activity log error:', error);
    }
}

router.post('/users/:userId/ban', authenticateAdmin, async (req, res) => {
    try {
        const { reason } = req.body;
        const user = await User.findById(req.params.userId);
        
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        
        user.banned = true;
        user.banReason = reason || 'No reason provided';
        user.bannedAt = new Date();
        await user.save();
        
        await logActivity('ban_user', req.userId, req.user.name, 'user', req.params.userId, { reason }, req.ip);
        
        res.json({ success: true, message: 'User banned successfully' });
    } catch (error) {
        console.error('Ban user error:', error);
        res.status(500).json({ success: false, message: 'Failed to ban user' });
    }
});

router.post('/users/:userId/unban', authenticateAdmin, async (req, res) => {
    try {
        const user = await User.findById(req.params.userId);
        
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        
        user.banned = false;
        user.banReason = null;
        user.bannedAt = null;
        await user.save();
        
        await logActivity('unban_user', req.userId, req.user.name, 'user', req.params.userId, {}, req.ip);
        
        res.json({ success: true, message: 'User unbanned successfully' });
    } catch (error) {
        console.error('Unban user error:', error);
        res.status(500).json({ success: false, message: 'Failed to unban user' });
    }
});

router.post('/users/:userId/notes', authenticateAdmin, async (req, res) => {
    try {
        const { note } = req.body;
        const user = await User.findById(req.params.userId);
        
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        
        if (!user.adminNotes) {
            user.adminNotes = [];
        }
        
        user.adminNotes.push({
            note,
            adminId: req.userId.toString(),
            adminName: req.user.name,
            createdAt: new Date()
        });
        
        await user.save();
        
        await logActivity('add_note', req.userId, req.user.name, 'user', req.params.userId, { note }, req.ip);
        
        res.json({ success: true, message: 'Note added successfully' });
    } catch (error) {
        console.error('Add note error:', error);
        res.status(500).json({ success: false, message: 'Failed to add note' });
    }
});

router.post('/users/bulk', authenticateAdmin, async (req, res) => {
    try {
        const { userIds, action, value } = req.body;
        
        if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
            return res.status(400).json({ success: false, message: 'User IDs required' });
        }
        
        let updated = 0;
        
        switch(action) {
            case 'add_balance':
                await User.updateMany(
                    { _id: { $in: userIds } },
                    { $inc: { UserBalance: parseFloat(value) || 0 } }
                );
                updated = userIds.length;
                break;
            case 'ban':
                await User.updateMany(
                    { _id: { $in: userIds } },
                    { $set: { banned: true, bannedAt: new Date(), banReason: value || 'Bulk ban' } }
                );
                updated = userIds.length;
                break;
            case 'unban':
                await User.updateMany(
                    { _id: { $in: userIds } },
                    { $set: { banned: false, banReason: null, bannedAt: null } }
                );
                updated = userIds.length;
                break;
            default:
                return res.status(400).json({ success: false, message: 'Invalid action' });
        }
        
        await logActivity('bulk_operation', req.userId, req.user.name, 'user', null, { action, count: updated }, req.ip);
        
        res.json({ success: true, message: `${updated} users updated successfully` });
    } catch (error) {
        console.error('Bulk operation error:', error);
        res.status(500).json({ success: false, message: 'Failed to perform bulk operation' });
    }
});

router.post('/payments/:paymentId/refund', authenticateAdmin, async (req, res) => {
    try {
        const { userId } = req.query;
        const user = await User.findById(userId);
        
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        
        const payment = user.PaymentHistory.find(p => p.paymentId === req.params.paymentId);
        
        if (!payment) {
            return res.status(404).json({ success: false, message: 'Payment not found' });
        }
        
        if (payment.status === 'refunded') {
            return res.status(400).json({ success: false, message: 'Payment already refunded' });
        }
        
        user.UserBalance = (user.UserBalance || 0) + payment.amount;
        payment.status = 'refunded';
        payment.completedAt = new Date();
        
        await user.save();
        
        await logActivity('refund_payment', req.userId, req.user.name, 'payment', req.params.paymentId, { amount: payment.amount }, req.ip);
        
        res.json({ success: true, message: 'Payment refunded successfully' });
    } catch (error) {
        console.error('Refund error:', error);
        res.status(500).json({ success: false, message: 'Failed to refund payment' });
    }
});

router.get('/analytics', authenticateAdmin, async (req, res) => {
    try {
        const { period = '30' } = req.query; // days
        const days = parseInt(period);
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        
        const allUsers = await User.find().select('PaymentHistory TotalSpent');
        const revenueByDay = {};
        const userGrowthByDay = {};
        
        for (let i = 0; i < days; i++) {
            const date = new Date();
            date.setDate(date.getDate() - (days - i - 1));
            const dateStr = date.toISOString().split('T')[0];
            revenueByDay[dateStr] = 0;
            userGrowthByDay[dateStr] = 0;
        }
        
        allUsers.forEach(user => {
            if (user.PaymentHistory) {
                user.PaymentHistory.forEach(payment => {
                    if (payment.status === 'confirmed' || payment.status === 'finished') {
                        const paymentDate = new Date(payment.createdAt).toISOString().split('T')[0];
                        if (revenueByDay[paymentDate] !== undefined) {
                            revenueByDay[paymentDate] += payment.amount || 0;
                        }
                    }
                });
            }
        });
        
        const users = await User.find({ createdAt: { $gte: startDate } }).select('createdAt');
        users.forEach(user => {
            const userDate = new Date(user.createdAt).toISOString().split('T')[0];
            if (userGrowthByDay[userDate] !== undefined) {
                userGrowthByDay[userDate]++;
            }
        });
        
        const boostStats = {};
        allUsers.forEach(user => {
            if (user.BoostPurchaseHistory) {
                user.BoostPurchaseHistory.forEach(purchase => {
                    const key = `${purchase.packageName}-${purchase.duration}mo`;
                    if (!boostStats[key]) {
                        boostStats[key] = { name: purchase.packageName, duration: purchase.duration, count: 0, revenue: 0 };
                    }
                    boostStats[key].count++;
                    boostStats[key].revenue += purchase.price || 0;
                });
            }
        });
        
        const topPackages = Object.values(boostStats).sort((a, b) => b.count - a.count).slice(0, 10);
        
        res.json({
            success: true,
            analytics: {
                revenueByDay,
                userGrowthByDay,
                topPackages
            }
        });
    } catch (error) {
        console.error('Analytics error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch analytics' });
    }
});

router.get('/activity-logs', authenticateAdmin, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const skip = (page - 1) * limit;
        
        const generalSite = await GeneralSite.findOne();
        
        if (!generalSite || !generalSite.ActivityLog) {
            return res.json({
                success: true,
                logs: [],
                pagination: { page: 1, limit, total: 0, pages: 0 }
            });
        }
        
        const logs = generalSite.ActivityLog
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            .slice(skip, skip + limit);
        
        const total = generalSite.ActivityLog.length;
        
        res.json({
            success: true,
            logs,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Activity logs error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch activity logs' });
    }
});

router.get('/promo-codes', authenticateAdmin, async (req, res) => {
    try {
        const generalSite = await GeneralSite.findOne();
        res.json({
            success: true,
            promoCodes: generalSite?.PromoCodes || []
        });
    } catch (error) {
        console.error('Promo codes fetch error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch promo codes' });
    }
});

router.post('/promo-codes', authenticateAdmin, async (req, res) => {
    try {
        const { code, discountType, discountValue, minAmount, maxUses, validUntil } = req.body;
        
        let generalSite = await GeneralSite.findOne();
        if (!generalSite) {
            generalSite = await GeneralSite.create({});
        }
        
        if (!generalSite.PromoCodes) {
            generalSite.PromoCodes = [];
        }
        
        if (generalSite.PromoCodes.find(pc => pc.code === code)) {
            return res.status(400).json({ success: false, message: 'Promo code already exists' });
        }
        
        generalSite.PromoCodes.push({
            code: code.toUpperCase(),
            discountType: discountType || 'percentage',
            discountValue: parseFloat(discountValue),
            minAmount: parseFloat(minAmount) || 0,
            maxUses: maxUses ? parseInt(maxUses) : null,
            usedCount: 0,
            validFrom: new Date(),
            validUntil: validUntil ? new Date(validUntil) : null,
            active: true
        });
        
        await generalSite.save();
        
        await logActivity('create_promo_code', req.userId, req.user.name, 'settings', null, { code }, req.ip);
        
        res.json({ success: true, message: 'Promo code created successfully' });
    } catch (error) {
        console.error('Create promo code error:', error);
        res.status(500).json({ success: false, message: 'Failed to create promo code' });
    }
});

router.put('/promo-codes/:codeId', authenticateAdmin, async (req, res) => {
    try {
        const { active, discountValue, validUntil } = req.body;
        
        let generalSite = await GeneralSite.findOne();
        if (!generalSite) {
            return res.status(404).json({ success: false, message: 'Settings not found' });
        }
        
        const promoCode = generalSite.PromoCodes.id(req.params.codeId);
        if (!promoCode) {
            return res.status(404).json({ success: false, message: 'Promo code not found' });
        }
        
        if (active !== undefined) promoCode.active = active;
        if (discountValue !== undefined) promoCode.discountValue = parseFloat(discountValue);
        if (validUntil !== undefined) promoCode.validUntil = validUntil ? new Date(validUntil) : null;
        
        await generalSite.save();
        
        await logActivity('update_promo_code', req.userId, req.user.name, 'settings', req.params.codeId, { code: promoCode.code }, req.ip);
        
        res.json({ success: true, message: 'Promo code updated successfully' });
    } catch (error) {
        console.error('Update promo code error:', error);
        res.status(500).json({ success: false, message: 'Failed to update promo code' });
    }
});

router.delete('/promo-codes/:codeId', authenticateAdmin, async (req, res) => {
    try {
        let generalSite = await GeneralSite.findOne();
        if (!generalSite) {
            return res.status(404).json({ success: false, message: 'Settings not found' });
        }
        
        generalSite.PromoCodes = generalSite.PromoCodes.filter(pc => pc._id.toString() !== req.params.codeId);
        await generalSite.save();
        
        await logActivity('delete_promo_code', req.userId, req.user.name, 'settings', req.params.codeId, {}, req.ip);
        
        res.json({ success: true, message: 'Promo code deleted successfully' });
    } catch (error) {
        console.error('Delete promo code error:', error);
        res.status(500).json({ success: false, message: 'Failed to delete promo code' });
    }
});

router.get('/export/:type', authenticateAdmin, async (req, res) => {
    try {
        const { type } = req.params;
        const format = req.query.format || 'json';
        
        let data = [];
        
        switch(type) {
            case 'users':
                const users = await User.find().select('-password').lean();
                data = users.map(user => ({
                    id: user._id,
                    name: user.name,
                    email: user.email,
                    balance: user.UserBalance,
                    totalSpent: user.TotalSpent,
                    rank: user.Rank,
                    rankXP: user.RankXP,
                    banned: user.banned,
                    createdAt: user.createdAt
                }));
                break;
            case 'payments':
                const allUsers = await User.find().select('name email PaymentHistory');
                allUsers.forEach(user => {
                    if (user.PaymentHistory) {
                        user.PaymentHistory.forEach(payment => {
                            data.push({
                                userId: user._id,
                                userName: user.name,
                                userEmail: user.email,
                                paymentId: payment.paymentId,
                                amount: payment.amount,
                                status: payment.status,
                                method: payment.paymentMethod,
                                createdAt: payment.createdAt
                            });
                        });
                    }
                });
                break;
            case 'boosts':
                const packages = await BoostPackage.find().lean();
                data = packages;
                break;
            default:
                return res.status(400).json({ success: false, message: 'Invalid export type' });
        }
        
        if (format === 'csv') {
            if (data.length === 0) {
                return res.status(400).json({ success: false, message: 'No data to export' });
            }
            
            const headers = Object.keys(data[0]);
            const csv = [
                headers.join(','),
                ...data.map(row => headers.map(h => {
                    const val = row[h];
                    return typeof val === 'string' && val.includes(',') ? `"${val}"` : val;
                }).join(','))
            ].join('\n');
            
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename=${type}-${Date.now()}.csv`);
            res.send(csv);
        } else {
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Content-Disposition', `attachment; filename=${type}-${Date.now()}.json`);
            res.json(data);
        }
        
        await logActivity('export_data', req.userId, req.user.name, 'system', null, { type, format }, req.ip);
    } catch (error) {
        console.error('Export error:', error);
        res.status(500).json({ success: false, message: 'Failed to export data' });
    }
});

router.post('/maintenance', authenticateAdmin, async (req, res) => {
    try {
        const { enabled, message } = req.body;
        
        
        let generalSite = await GeneralSite.findOne();
        if (!generalSite) {
            generalSite = await GeneralSite.create({});
        }
        
        if (!generalSite.GeneralSettings) {
            generalSite.GeneralSettings = {};
        }
        
        const maintenanceEnabled = enabled === true;
        
        if (!generalSite.GeneralSettings) {
            generalSite.GeneralSettings = {};
        }
        
        generalSite.GeneralSettings.maintenanceMode = maintenanceEnabled;
        
        if (message !== undefined && message !== null) {
            generalSite.GeneralSettings.maintenanceMessage = message || 'Site is under maintenance. Please check back later.';
        }
        
        generalSite.markModified('GeneralSettings');
        
        await generalSite.save();
        
        const saved = await GeneralSite.findById(generalSite._id).lean();
        
        await logActivity('toggle_maintenance', req.userId, req.user.name, 'system', null, { enabled: maintenanceEnabled }, req.ip);
        
        res.json({ 
            success: true, 
            message: `Maintenance mode ${maintenanceEnabled ? 'enabled' : 'disabled'}`,
            settings: generalSite
        });
    } catch (error) {
        console.error('Maintenance mode error:', error);
        res.status(500).json({ success: false, message: 'Failed to update maintenance mode' });
    }
});

module.exports = router;

