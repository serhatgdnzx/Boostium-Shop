const express = require('express');
const router = express.Router();
const BoostPackage = require('../models/BoostPackage');
const User = require('../models/User');
const GeneralSite = require('../models/GeneralSite');
const authenticateToken = require('../middleware/auth');
const { calculateRank, calculateXPFromPayment } = require('../utils/rankSystem');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

router.get('/packages/:duration', async (req, res) => {
    try {
        const duration = parseInt(req.params.duration);
        
        if (duration !== 1 && duration !== 3) {
            return res.status(400).json({ 
                message: 'Invalid duration. Only 1 or 3 months can be selected.' 
            });
        }

        const packages = await BoostPackage.find({ duration })
            .sort({ quantity: 1 })
            .select('-__v');

        res.json({
            success: true,
            duration,
            packages
        });
    } catch (error) {
        console.error('Boost packages fetch error:', error);
        res.status(500).json({ 
            message: 'Server error. Please try again later.' 
        });
    }
});

router.get('/packages', async (req, res) => {
    try {
        const packages = await BoostPackage.find()
            .sort({ duration: 1, quantity: 1 })
            .select('-__v');

        res.json({
            success: true,
            packages
        });
    } catch (error) {
        console.error('Boost packages fetch error:', error);
        res.status(500).json({ 
            message: 'Server error. Please try again later.' 
        });
    }
});

router.post('/packages', async (req, res) => {
    try {
        const { name, quantity, price, pricePerBoost, duration, inStock } = req.body;

        if (!name || !quantity || !price || !pricePerBoost || !duration) {
            return res.status(400).json({ 
                message: 'Please fill in all fields' 
            });
        }

        if (duration !== 1 && duration !== 3) {
            return res.status(400).json({ 
                message: 'Duration can only be 1 or 3 months' 
            });
        }

        const package = new BoostPackage({
            name,
            quantity,
            price,
            pricePerBoost,
            duration,
            inStock: inStock !== undefined ? inStock : true
        });

        await package.save();

        res.status(201).json({
            success: true,
            message: 'Boost package created successfully',
            package
        });
    } catch (error) {
        console.error('Boost package creation error:', error);
        res.status(500).json({ 
            message: 'Server error. Please try again later.' 
        });
    }
});

router.patch('/packages/:id/stock', async (req, res) => {
    try {
        const { inStock } = req.body;
        const { id } = req.params;

        if (typeof inStock !== 'boolean') {
            return res.status(400).json({ 
                message: 'inStock value must be boolean' 
            });
        }

        const package = await BoostPackage.findByIdAndUpdate(
            id,
            { inStock, updatedAt: Date.now() },
            { new: true }
        );

        if (!package) {
            return res.status(404).json({ 
                message: 'Boost package not found' 
            });
        }

        res.json({
            success: true,
            message: 'Stock status updated',
            package
        });
    } catch (error) {
        console.error('Stock status update error:', error);
        res.status(500).json({ 
            message: 'Server error. Please try again later.' 
        });
    }
});

router.delete('/packages/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const package = await BoostPackage.findByIdAndDelete(id);

        if (!package) {
            return res.status(404).json({ 
                message: 'Boost package not found' 
            });
        }

        res.json({
            success: true,
            message: 'Boost package deleted successfully'
        });
    } catch (error) {
        console.error('Boost package deletion error:', error);
        res.status(500).json({ 
            message: 'Server error. Please try again later.' 
        });
    }
});

router.post('/purchase', authenticateToken, async (req, res) => {
    try {
        const { packageId, discordInvite } = req.body;
        const userId = req.user.userId;

        if (!packageId) {
            return res.status(400).json({
                success: false,
                message: 'Package ID is required'
            });
        }

        if (!discordInvite || !discordInvite.trim()) {
            return res.status(400).json({
                success: false,
                message: 'Discord invite link is required'
            });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        const boostPackage = await BoostPackage.findById(packageId);
        if (!boostPackage) {
            return res.status(404).json({
                success: false,
                message: 'Boost package not found'
            });
        }

        if (!boostPackage.inStock) {
            return res.status(400).json({
                success: false,
                message: 'This boost package is out of stock'
            });
        }

        try {
            let discordConfig = {};
            try {
                const configPath = path.join(__dirname, '..', 'config.json');
                const configData = fs.readFileSync(configPath, 'utf8');
                discordConfig = JSON.parse(configData);
            } catch (error) {
                console.error('config.json could not be read:', error.message);
            }

            const DISCORD_BOT_TOKEN = discordConfig.DISCORD_BOT_TOKEN || process.env.DISCORD_BOT_TOKEN;
            
            if (DISCORD_BOT_TOKEN && DISCORD_BOT_TOKEN !== 'your_discord_bot_token_here') {
                let inviteCode = null;
                const patterns = [
                    /discord\.gg\/([a-zA-Z0-9]+)/i,
                    /discord\.com\/invite\/([a-zA-Z0-9]+)/i,
                    /discordapp\.com\/invite\/([a-zA-Z0-9]+)/i
                ];

                for (const pattern of patterns) {
                    const match = discordInvite.trim().match(pattern);
                    if (match && match[1]) {
                        inviteCode = match[1];
                        break;
                    }
                }

                if (!inviteCode && /^[a-zA-Z0-9]+$/.test(discordInvite.trim())) {
                    inviteCode = discordInvite.trim();
                }

                if (inviteCode) {
                    try {
                        await axios.get(
                            `https://discord.com/api/v10/invites/${inviteCode}?with_counts=true`,
                            {
                                headers: {
                                    'Authorization': `Bot ${DISCORD_BOT_TOKEN}`
                                },
                                timeout: 10000
                            }
                        );
                    } catch (discordError) {
                        if (discordError.response && discordError.response.status === 404) {
                            return res.status(400).json({
                                success: false,
                                message: 'Invalid or expired Discord invite link'
                            });
                        }
                    }
                }
            }
        } catch (validationError) {
            console.error('Discord invite validation error:', validationError);
            return res.status(400).json({
                success: false,
                message: 'Invalid Discord invite link'
            });
        }

        const currentBalance = user.UserBalance || 0;
        if (currentBalance < boostPackage.price) {
            return res.status(400).json({
                success: false,
                message: `Insufficient balance. You need $${boostPackage.price.toFixed(2)} but you have $${currentBalance.toFixed(2)}`
            });
        }

        const previousBalance = currentBalance;
        const newBalance = currentBalance - boostPackage.price;

        user.UserBalance = newBalance;
        user.TotalSpent = (user.TotalSpent || 0) + boostPackage.price;

        const xpEarned = calculateXPFromPayment(boostPackage.price);
        const currentXP = user.RankXP || 0;
        user.RankXP = currentXP + xpEarned;
        
        const rankInfo = calculateRank(user.RankXP);
        user.Rank = rankInfo.name;
        user.RankNextXP = rankInfo.nextRankMinXP || 0;
        
        console.log(`✅ Boost purchase: XP added: +${xpEarned} XP (Total: ${user.RankXP} XP, Rank: ${rankInfo.name})`);

        if (!user.BoostPurchaseHistory) {
            user.BoostPurchaseHistory = [];
        }

        const purchaseEntry = {
            packageId: packageId,
            packageName: boostPackage.name || `${boostPackage.quantity} Boosts`,
            quantity: boostPackage.quantity,
            duration: boostPackage.duration,
            price: boostPackage.price,
            previousBalance: previousBalance,
            newBalance: newBalance,
            discordInvite: discordInvite.trim(),
            createdAt: new Date()
        };

        user.BoostPurchaseHistory.push(purchaseEntry);
        await user.save();

        try {
            let generalSite = await GeneralSite.findOne();
            if (!generalSite) {
                generalSite = new GeneralSite({
                    PurchasedBoosts: 0,
                    SuccessfulOrders: 0,
                    BoostedServers: 0
                });
            }

            generalSite.PurchasedBoosts = (generalSite.PurchasedBoosts || 0) + boostPackage.quantity;
            
            generalSite.BoostedServers = (generalSite.BoostedServers || 0) + 1;
            
            generalSite.SuccessfulOrders = (generalSite.SuccessfulOrders || 0) + 1;

            await generalSite.save();
        } catch (statsError) {
            console.error('Error updating GeneralSite statistics:', statsError);
        }

        try {
            const configPath = path.join(__dirname, '..', 'config.json');
            const configData = fs.readFileSync(configPath, 'utf8');
            const config = JSON.parse(configData);
            const DISCORD_WEBHOOK_URL = config.DISCORD_WEBHOOK_URL || process.env.DISCORD_WEBHOOK_URL;

            if (DISCORD_WEBHOOK_URL) {
                await axios.post(DISCORD_WEBHOOK_URL, {
                    content: '@everyone',
                    embeds: [{
                        title: '🎉 New Boost Purchase!',
                        color: 0x5865F2,
                        fields: [
                            {
                                name: '👤 User',
                                value: `${user.name} (${user.email})`,
                                inline: true
                            },
                            {
                                name: '📦 Package',
                                value: `${boostPackage.quantity} Boosts (${boostPackage.duration} month${boostPackage.duration > 1 ? 's' : ''})`,
                                inline: true
                            },
                            {
                                name: '💰 Price',
                                value: `$${boostPackage.price.toFixed(2)}`,
                                inline: true
                            },
                            {
                                name: '💵 Previous Balance',
                                value: `$${previousBalance.toFixed(2)}`,
                                inline: true
                            },
                            {
                                name: '💵 New Balance',
                                value: `$${newBalance.toFixed(2)}`,
                                inline: true
                            },
                            {
                                name: '🔗 Discord Invite',
                                value: discordInvite.trim(),
                                inline: false
                            }
                        ],
                        timestamp: new Date().toISOString(),
                        footer: {
                            text: 'Boost Purchase System'
                        }
                    }]
                }, {
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });
            }
        } catch (webhookError) {
            console.error('Discord webhook error:', webhookError);
        }

        res.json({
            success: true,
            message: 'Boost package purchased successfully',
            data: {
                package: {
                    id: boostPackage._id,
                    name: boostPackage.name || `${boostPackage.quantity} Boosts`,
                    quantity: boostPackage.quantity,
                    duration: boostPackage.duration
                },
                previousBalance: previousBalance,
                newBalance: newBalance,
                purchaseHistory: purchaseEntry
            }
        });
    } catch (error) {
        console.error('Boost purchase error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error. Please try again later.'
        });
    }
});

module.exports = router;

