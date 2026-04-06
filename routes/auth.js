const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const authenticateToken = require('../middleware/auth');
const { calculateRank, calculateXPFromPayment } = require('../utils/rankSystem');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET || 'srhtg';

function getDebugMode() {
    try {
        const configPath = path.join(__dirname, '..', 'config.json');
        const configData = fs.readFileSync(configPath, 'utf8');
        const config = JSON.parse(configData);
        return config.DEBUG === true;
    } catch (error) {
        return false;
    }
}

const debug = {
    log: (...args) => {
        if (getDebugMode()) {
            console.log(...args);
        }
    },
    error: (...args) => {
        if (getDebugMode()) {
            console.error(...args);
        }
    },
    warn: (...args) => {
        if (getDebugMode()) {
            console.warn(...args);
        }
    }
};

router.post('/register', async (req, res) => {
    try {
        const { name, email, password } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ 
                message: 'Please fill in all fields' 
            });
        }

        if (password.length < 6) {
            return res.status(400).json({ 
                message: 'Password must be at least 6 characters' 
            });
        }

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ 
                message: 'This email address is already in use' 
            });
        }

        const user = new User({ name, email, password });
        await user.save();

        const token = jwt.sign(
            { userId: user._id, email: user.email },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.status(201).json({
            message: 'User created successfully',
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email
            }
        });
    } catch (error) {
        debug.error('Registration error:', error);
        res.status(500).json({ 
            message: 'Server error. Please try again later.' 
        });
    }
});

router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ 
                message: 'Please enter email and password' 
            });
        }

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(401).json({ 
                message: 'Invalid email or password' 
            });
        }

        const isPasswordValid = await user.comparePassword(password);
        if (!isPasswordValid) {
            return res.status(401).json({ 
                message: 'Invalid email or password' 
            });
        }

        if (user.banned === true) {
            return res.status(403).json({ 
                message: 'Your account has been banned',
                banned: true,
                banReason: user.banReason || 'No reason provided'
            });
        }

        const clientIP = req.ip || 
                         req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 
                         req.headers['x-real-ip'] || 
                         req.connection.remoteAddress ||
                         req.socket.remoteAddress ||
                         'unknown';
        
        const userAgent = req.headers['user-agent'] || 'unknown';

        user.lastLogin = new Date();
        user.ipAddress = clientIP;
        
        if (!user.loginHistory) {
            user.loginHistory = [];
        }
        
        user.loginHistory.push({
            ip: clientIP,
            userAgent: userAgent,
            loginAt: new Date()
        });
        
        if (user.loginHistory.length > 100) {
            user.loginHistory = user.loginHistory.slice(-100);
        }
        
        await user.save();

        const token = jwt.sign(
            { userId: user._id, email: user.email },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            message: 'Login successful',
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email
            }
        });
    } catch (error) {
        debug.error('Login error:', error);
        res.status(500).json({ 
            message: 'Server error. Please try again later.' 
        });
    }
});

router.get('/me', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.userId).select('-password');
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        
        if (user.banned === true) {
            return res.status(403).json({ 
                message: 'Account banned',
                banned: true,
                banReason: user.banReason || 'No reason provided',
                user: {
                    id: user._id,
                    name: user.name,
                    email: user.email,
                    banned: true,
                    banReason: user.banReason
                }
            });
        }
        
        res.json({
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                balance: user.UserBalance,
                totalSpent: user.TotalSpent,
                rank: user.Rank,
                rankXP: user.RankXP,
                banned: false
            }
        });
    } catch (error) {
        debug.error('User info error:', error);
        res.status(500).json({ 
            message: 'Server error' 
        });
    }
});

router.post('/logout', (req, res) => {
    res.json({ 
        success: true,
        message: 'Logged out successfully' 
    });
});

router.post('/discord/validate-invite', authenticateToken, async (req, res) => {
    try {
        const { inviteUrl } = req.body;

        if (!inviteUrl || typeof inviteUrl !== 'string') {
            return res.status(400).json({
                success: false,
                valid: false,
                message: 'Discord invite URL required'
            });
        }

        let inviteCode = null;
        
        const patterns = [
            /discord\.gg\/([a-zA-Z0-9]+)/i,
            /discord\.com\/invite\/([a-zA-Z0-9]+)/i,
            /discordapp\.com\/invite\/([a-zA-Z0-9]+)/i
        ];

        for (const pattern of patterns) {
            const match = inviteUrl.match(pattern);
            if (match && match[1]) {
                inviteCode = match[1];
                break;
            }
        }

        if (!inviteCode && /^[a-zA-Z0-9]+$/.test(inviteUrl.trim())) {
            inviteCode = inviteUrl.trim();
        }

        if (!inviteCode) {
            return res.status(400).json({
                success: false,
                valid: false,
                message: 'Invalid Discord invite URL format'
            });
        }

        const fs = require('fs');
        const path = require('path');
        let discordConfig = {};
        try {
            const configPath = path.join(__dirname, '..', 'config.json');
            const configData = fs.readFileSync(configPath, 'utf8');
            discordConfig = JSON.parse(configData);
        } catch (error) {
            debug.error('config.json could not be read:', error.message);
        }

        const DISCORD_BOT_TOKEN = discordConfig.DISCORD_BOT_TOKEN || process.env.DISCORD_BOT_TOKEN;

        if (!DISCORD_BOT_TOKEN || DISCORD_BOT_TOKEN === 'your_discord_bot_token_here') {
            return res.status(500).json({
                success: false,
                valid: false,
                message: 'Discord bot token not configured'
            });
        }

        try {
            const axios = require('axios');
            const discordResponse = await axios.get(
                `https://discord.com/api/v10/invites/${inviteCode}?with_counts=true`,
                {
                    headers: {
                        'Authorization': `Bot ${DISCORD_BOT_TOKEN}`
                    },
                    timeout: 10000 // 10 saniye timeout
                }
            );

            const inviteData = discordResponse.data;

            res.json({
                success: true,
                valid: true,
                message: 'Discord invite URL is valid',
                data: {
                    code: inviteCode,
                    guild: inviteData.guild ? {
                        id: inviteData.guild.id,
                        name: inviteData.guild.name,
                        icon: inviteData.guild.icon
                    } : null,
                    channel: inviteData.channel ? {
                        id: inviteData.channel.id,
                        name: inviteData.channel.name,
                        type: inviteData.channel.type
                    } : null,
                    approximate_member_count: inviteData.approximate_member_count,
                    approximate_presence_count: inviteData.approximate_presence_count
                }
            });
        } catch (discordError) {
            if (discordError.response) {
                const status = discordError.response.status;
                
                if (status === 404) {
                    return res.json({
                        success: true,
                        valid: false,
                        message: 'Discord invite URL is invalid or expired'
                    });
                } else if (status === 401 || status === 403) {
                    return res.status(500).json({
                        success: false,
                        valid: false,
                        message: 'Discord bot token is invalid or unauthorized'
                    });
                } else {
                    return res.status(500).json({
                        success: false,
                        valid: false,
                        message: 'Discord API error'
                    });
                }
            } else {
                return res.status(500).json({
                    success: false,
                    valid: false,
                    message: 'Could not connect to Discord API'
                });
            }
        }
    } catch (error) {
        debug.error('Discord invite validation error:', error);
        res.status(500).json({
            success: false,
            valid: false,
            message: 'Server error. Please try again later.'
        });
    }
});

router.post('/balance/create-checkout', authenticateToken, async (req, res) => {
    try {
            const { amount, paymentMethod, currency } = req.body;
            const userId = req.user.userId;

            if (!amount || typeof amount !== 'number' || amount <= 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Please enter a valid amount'
                });
            }

            if (amount < 20) {
                return res.status(400).json({
                    success: false,
                    message: 'Minimum payment amount must be $20'
                });
            }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        const fs = require('fs');
        const path = require('path');
        let config = {};
        try {
            const configPath = path.join(__dirname, '..', 'config.json');
            const configData = fs.readFileSync(configPath, 'utf8');
            config = JSON.parse(configData);
        } catch (error) {
            debug.error('config.json could not be read:', error.message);
        }

        const NOWPAYMENTS_API_KEY = config.NOWPAYMENTS_API_KEY || process.env.NOWPAYMENTS_API_KEY;
        const NOWPAYMENTS_TEST_MODE = config.NOWPAYMENTS_TEST_MODE || process.env.NOWPAYMENTS_TEST_MODE === 'true';

        if (!NOWPAYMENTS_API_KEY) {
            return res.status(500).json({
                success: false,
                message: 'NOWPayments API key not configured. Please add NOWPAYMENTS_API_KEY to config.json.'
            });
        }

        let payCurrency = 'BTC';
        let currencyDisplayName = 'Bitcoin';
        
        if (currency === 'BTC') {
            payCurrency = 'BTC';
            currencyDisplayName = 'Bitcoin';
        } else if (currency === 'USDTTRX') {
            payCurrency = 'USDTTRC20';
            currencyDisplayName = 'Tether (USDT) - TRON';
        } else if (currency === 'TRX') {
            payCurrency = 'TRX';
            currencyDisplayName = 'TRON (TRX)';
        }

        if (NOWPAYMENTS_TEST_MODE) {
            debug.log('🧪 TEST MODE: Simulating NOWPayments payment (no real payment will be made)');
            
            const orderId = `balance-${userId}-${Date.now()}`;
            const testPaymentId = Math.floor(Math.random() * 1000000000000).toString(); // 12-digit number
            
            let testCryptoAmount, testCryptoAddress;
            if (currency === 'BTC') {
                testCryptoAmount = (amount / 65000).toFixed(8);
                testCryptoAddress = 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh';
            } else if (currency === 'USDTTRX') {
                testCryptoAmount = amount.toFixed(2);
                testCryptoAddress = 'TQn9Y2khEsLMWDmP5qJ7xJz8K9vZzZzZzZz';
            } else if (currency === 'TRX') {
                testCryptoAmount = (amount / 0.1).toFixed(2);
                testCryptoAddress = 'TQn9Y2khEsLMWDmP5qJ7xJz8K9vZzZzZzZz';
            } else {
                testCryptoAmount = (amount / 65000).toFixed(8);
                testCryptoAddress = 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh';
            }
            
            const paymentHistoryEntry = {
                paymentId: testPaymentId,
                orderId: orderId,
                amount: amount,
                currency: 'USD',
                paymentMethod: currencyDisplayName,
                payCurrency: payCurrency,
                status: 'waiting',
                btcAmount: testCryptoAmount,
                btcAddress: testCryptoAddress,
                createdAt: new Date(),
                testMode: true
            };
            
            if (!user.PaymentHistory) {
                user.PaymentHistory = [];
            }
            user.PaymentHistory.push(paymentHistoryEntry);
            await user.save();
            
            let qrCodeUrl;
            if (currency === 'BTC') {
                qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent('bitcoin:' + testCryptoAddress + '?amount=' + testCryptoAmount)}`;
            } else if (currency === 'USDTTRX') {
                qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(testCryptoAddress)}`;
            } else if (currency === 'TRX') {
                qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(testCryptoAddress)}`;
            } else {
                qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent('bitcoin:' + testCryptoAddress + '?amount=' + testCryptoAmount)}`;
            }
            
            return res.json({
                success: true,
                paymentId: testPaymentId,
                invoiceId: testPaymentId,
                paymentUrl: null,
                amount: amount,
                btcAmount: testCryptoAmount,
                btcAddress: testCryptoAddress,
                payCurrency: payCurrency,
                orderId: orderId,
                paymentStatus: 'waiting',
                qrCodeUrl: qrCodeUrl,
                embedMode: true,
                nowpayments: true,
                testMode: true // Notify frontend that we are in test mode
            });
        }

        try {
            const axios = require('axios');
            
            let minAmountResponse;
            try {
                minAmountResponse = await axios.get(`https://api.nowpayments.io/v1/min-amount?currency_from=USD&currency_to=${payCurrency}`, {
                    headers: {
                        'x-api-key': NOWPAYMENTS_API_KEY
                    }
                });
                const minAmount = parseFloat(minAmountResponse.data.min_amount || 0);
                if (amount < minAmount) {
                    return res.status(400).json({
                        success: false,
                        message: `Minimum payment amount must be $${minAmount.toFixed(2)}.`
                    });
                }
            } catch (minAmountError) {
                const minAmountErrorMsg = minAmountError.response?.data?.message || minAmountError.message || '';
                const lowerMinAmountError = minAmountErrorMsg.toLowerCase();
                
                debug.warn('Minimum amount check failed:', minAmountError.response?.data || minAmountError.message);
                
                if ((payCurrency === 'USDTTRC20' || payCurrency === 'TRX') && minAmountError.response?.status === 400) {
                    if (lowerMinAmountError.includes('can not get estimate') || lowerMinAmountError.includes('cannot get estimate') || lowerMinAmountError.includes('estimate not available')) {
                        if (payCurrency === 'USDTTRC20') {
                            debug.log('USDTTRC20 not supported for estimate, trying USDT instead...');
                            payCurrency = 'USDT';
                        } else if (payCurrency === 'TRX') {
                            debug.warn('TRX currency may not be supported by NOWPayments API for estimate');
                        }
                        
                        if (payCurrency === 'USDT') {
                            try {
                                minAmountResponse = await axios.get(`https://api.nowpayments.io/v1/min-amount?currency_from=USD&currency_to=${payCurrency}`, {
                                    headers: {
                                        'x-api-key': NOWPAYMENTS_API_KEY
                                    }
                                });
                                const minAmount = parseFloat(minAmountResponse.data.min_amount || 0);
                                if (amount < minAmount) {
                                    return res.status(400).json({
                                        success: false,
                                        message: `Minimum payment amount must be $${minAmount.toFixed(2)}.`
                                    });
                                }
                            } catch (retryError) {
                                debug.warn('Retry with USDT also failed:', retryError.response?.data || retryError.message);
                            }
                        }
                    }
                }
            }
            
            const orderId = `balance-${userId}-${Date.now()}`;
            const nowPaymentsPaymentData = {
                price_amount: amount,
                price_currency: 'USD',
                pay_currency: payCurrency,
                order_id: orderId,
                order_description: `Balance Top-up: $${amount}`,
                ipn_callback_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/api/auth/balance/nowpayments-webhook`,
                success_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/add-balance?success=true&amount=${amount}`,
                cancel_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/add-balance?canceled=true`
            };
            
            debug.log('Creating NOWPayments payment:', nowPaymentsPaymentData);
            
            const paymentResponse = await axios.post('https://api.nowpayments.io/v1/payment', nowPaymentsPaymentData, {
                headers: {
                    'x-api-key': NOWPAYMENTS_API_KEY,
                    'Content-Type': 'application/json'
                }
            });
            
            const paymentData = paymentResponse.data;
            
            debug.log('NOWPayments Payment Response:', JSON.stringify(paymentData, null, 2));
            
            if (paymentData && paymentData.payment_id) {
                const paymentHistoryEntry = {
                    paymentId: paymentData.payment_id.toString(),
                    orderId: paymentData.order_id || orderId,
                    amount: amount,
                    currency: paymentData.price_currency || 'USD',
                    paymentMethod: currencyDisplayName,
                    payCurrency: paymentData.pay_currency || payCurrency,
                    status: paymentData.payment_status || 'waiting',
                    btcAmount: paymentData.pay_amount || null,
                    btcAddress: paymentData.pay_address || null,
                    createdAt: new Date(),
                    testMode: false
                };
                
                if (!user.PaymentHistory) {
                    user.PaymentHistory = [];
                }
                user.PaymentHistory.push(paymentHistoryEntry);
                await user.save();
                
                return res.json({
                    success: true,
                    paymentId: paymentData.payment_id,
                    invoiceId: paymentData.payment_id, // For compatibility
                    paymentUrl: paymentData.invoice_url || null,
                    amount: amount,
                    btcAmount: paymentData.pay_amount || null,
                    btcAddress: paymentData.pay_address || null,
                    payCurrency: paymentData.pay_currency || 'BTC',
                    orderId: paymentData.order_id || orderId,
                    paymentStatus: paymentData.payment_status || 'waiting',
                    qrCodeUrl: paymentData.pay_address ? `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent('bitcoin:' + paymentData.pay_address + (paymentData.pay_amount ? '?amount=' + paymentData.pay_amount : ''))}` : null,
                    embedMode: true,
                    nowpayments: true
                });
            } else {
                throw new Error('Payment could not be created: ' + JSON.stringify(paymentData));
            }
        } catch (nowpaymentsError) {
            debug.error('NOWPayments API error:', nowpaymentsError.response?.data || nowpaymentsError.message);
            
            const errorMessage = nowpaymentsError.response?.data?.message || nowpaymentsError.message || 'Payment system error. Please try again later.';
            const errorData = nowpaymentsError.response?.data || {};
            const statusCode = nowpaymentsError.response?.status || 500;
            
            const lowerErrorMessage = errorMessage.toLowerCase();
            
            const isEstimateError = lowerErrorMessage.includes('can not get estimate') || 
                                   lowerErrorMessage.includes('cannot get estimate') || 
                                   lowerErrorMessage.includes('estimate not available') || 
                                   lowerErrorMessage.includes('unable to get estimate') ||
                                   lowerErrorMessage.includes('failed to get estimate');
            
            if (isEstimateError) {
                if (payCurrency === 'USDTTRC20') {
                    return res.status(400).json({
                        success: false,
                        message: 'USDT (TRON) payment is currently not available. Please try BTC, USDT (Ethereum), or TRX instead.'
                    });
                } else if (payCurrency === 'TRX') {
                    return res.status(400).json({
                        success: false,
                        message: 'TRX payment is currently not available. Please try BTC, USDT (Ethereum), or USDT (TRON) instead.'
                    });
                }
            }
            
            const isCurrencyNotFound = statusCode === 400 && (
                errorData.code === 'INVALID_CURRENCY' || 
                (lowerErrorMessage.includes('currency') && lowerErrorMessage.includes('not found')) ||
                (lowerErrorMessage.includes('currency') && lowerErrorMessage.includes('was not found')) ||
                lowerErrorMessage.includes('currency not found') ||
                lowerErrorMessage.includes('currency was not found')
            );
            
            if (isCurrencyNotFound) {
                if (payCurrency === 'USDTTRC20') {
                    return res.status(400).json({
                        success: false,
                        message: 'USDT (TRON) currency is not supported. Please try BTC, USDT (Ethereum), or TRX instead.'
                    });
                } else if (payCurrency === 'TRX') {
                    return res.status(400).json({
                        success: false,
                        message: 'TRX currency is not supported. Please try BTC, USDT (Ethereum), or USDT (TRON) instead.'
                    });
                } else if (payCurrency === 'USDT') {
                    const isUSDTNotFound = lowerErrorMessage.includes('usdt') || lowerErrorMessage.includes('tether');
                    if (isUSDTNotFound) {
                        return res.status(400).json({
                            success: false,
                            message: 'USDT (Ethereum) currency is not supported. Please try BTC instead.'
                        });
                    }
                }
            }
            
            return res.status(statusCode >= 400 && statusCode < 500 ? statusCode : 500).json({
                success: false,
                message: errorMessage
            });
        }
    } catch (error) {
        debug.error('Checkout creation error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error. Please try again later.'
        });
    }
});

router.post('/balance/nowpayments-webhook', async (req, res) => {
    try {
        const event = req.body;
        
        debug.log('🔔 NOWPayments IPN Webhook received:', JSON.stringify(event, null, 2));
        debug.log(`📊 Payment Status: ${event.payment_status}, Payment ID: ${event.payment_id}, Order ID: ${event.order_id}`);
        
        if (event.payment_status === 'confirmed' || event.payment_status === 'finished') {
            const orderId = event.order_id;
            const userIdMatch = orderId ? orderId.match(/balance-([^-]+)-/) : null;
            
            if (!userIdMatch || !userIdMatch[1]) {
                debug.error('User ID not found, order_id:', orderId);
                return res.status(400).json({ success: false, message: 'User ID not found' });
            }
            
            const userId = userIdMatch[1];
            const amount = parseFloat(event.price_amount || 0);
            const paymentId = event.payment_id.toString();

            const user = await User.findById(userId);
            if (!user) {
                debug.error('User not found:', userId);
                return res.status(404).json({ success: false, message: 'User not found' });
            }

            if (!user.PaymentHistory) {
                user.PaymentHistory = [];
            }
            
            const paymentEntry = user.PaymentHistory.find(p => p.paymentId === paymentId);
            
            if (paymentEntry) {
                paymentEntry.status = event.payment_status;
                paymentEntry.completedAt = new Date();
                if (event.pay_amount) paymentEntry.btcAmount = event.pay_amount.toString();
                if (event.pay_address) paymentEntry.btcAddress = event.pay_address;
            } else {
                user.PaymentHistory.push({
                    paymentId: paymentId,
                    orderId: orderId,
                    amount: amount,
                    currency: event.price_currency || 'USD',
                    paymentMethod: 'Bitcoin',
                    status: event.payment_status,
                    btcAmount: event.pay_amount ? event.pay_amount.toString() : null,
                    btcAddress: event.pay_address || null,
                    createdAt: new Date(),
                    completedAt: new Date(),
                    testMode: false
                });
            }
            
            const wasAlreadyCompleted = paymentEntry && paymentEntry.completedAt && paymentEntry.status === 'confirmed';
            
            if (!wasAlreadyCompleted) {
                const currentBalance = user.UserBalance || 0;
                user.UserBalance = currentBalance + amount;
                
                const xpEarned = calculateXPFromPayment(amount);
                const currentXP = user.RankXP || 0;
                user.RankXP = currentXP + xpEarned;
                
                const rankInfo = calculateRank(user.RankXP);
                user.Rank = rankInfo.name;
                user.RankNextXP = rankInfo.nextRankMinXP || 0;
                
                debug.log(`✅ Balance updated for user ${userId}: +$${amount} (payment_id: ${paymentId}, status: ${event.payment_status})`);
                debug.log(`✅ XP added: +${xpEarned} XP (Total: ${user.RankXP} XP, Rank: ${rankInfo.name})`);
            } else {
                debug.log(`⚠️ Payment already processed: ${paymentId} for user ${userId}`);
            }
            
            await user.save();

            return res.json({ success: true, message: 'Balance updated' });
        } else {
            const orderId = event.order_id;
            const userIdMatch = orderId ? orderId.match(/balance-([^-]+)-/) : null;
            
            if (userIdMatch && userIdMatch[1]) {
                const userId = userIdMatch[1];
                const user = await User.findById(userId);
                
                if (user && user.PaymentHistory) {
                    const paymentId = event.payment_id.toString();
                    const paymentEntry = user.PaymentHistory.find(p => p.paymentId === paymentId);
                    
                    if (paymentEntry) {
                        paymentEntry.status = event.payment_status;
                        if (event.pay_amount) paymentEntry.btcAmount = event.pay_amount.toString();
                        if (event.pay_address) paymentEntry.btcAddress = event.pay_address;
                        await user.save();
                    }
                }
            }
            
            debug.log(`ℹ️ Payment status update (not confirmed yet): ${event.payment_status} for payment_id: ${event.payment_id}`);
        }

        res.json({ success: true, message: 'Webhook received' });
    } catch (error) {
        debug.error('Webhook error:', error);
        res.status(500).json({ success: false, message: 'Webhook processing error' });
    }
});

router.get('/balance/check-payment-status', authenticateToken, async (req, res) => {
    try {
        const { paymentId } = req.query;
        
        if (!paymentId) {
            return res.status(400).json({
                success: false,
                message: 'Payment ID required'
            });
        }

        const fs = require('fs');
        const path = require('path');
        let config = {};
        try {
            const configPath = path.join(__dirname, '..', 'config.json');
            const configData = fs.readFileSync(configPath, 'utf8');
            config = JSON.parse(configData);
        } catch (error) {
            debug.error('config.json could not be read:', error.message);
        }

        const NOWPAYMENTS_API_KEY = config.NOWPAYMENTS_API_KEY || process.env.NOWPAYMENTS_API_KEY;
        const NOWPAYMENTS_TEST_MODE = config.NOWPAYMENTS_TEST_MODE || process.env.NOWPAYMENTS_TEST_MODE === 'true';

        if (!NOWPAYMENTS_API_KEY) {
            return res.status(500).json({
                success: false,
                message: 'NOWPayments API key not configured'
            });
        }

        if (NOWPAYMENTS_TEST_MODE && req.query.forceStatus) {
            debug.log('🧪 TEST MODE: Manual payment simulation');
            
            const testStatus = req.query.forceStatus || 'waiting';
            
            if (testStatus === 'confirmed') {
                const orderId = req.query.orderId || '';
                const userIdMatch = orderId ? orderId.match(/balance-([^-]+)-/) : null;
                
                if (userIdMatch && userIdMatch[1]) {
                    const userId = userIdMatch[1];
                    const user = await User.findById(userId);
                    
                    if (user) {
                        const amount = parseFloat(req.query.amount || 0);
                        const paymentId = req.query.paymentId || paymentId;
                        
                        if (!user.PaymentHistory) {
                            user.PaymentHistory = [];
                        }
                        
                        const paymentEntry = user.PaymentHistory.find(p => p.paymentId === paymentId);
                        const wasAlreadyCompleted = paymentEntry && paymentEntry.completedAt && paymentEntry.status === 'confirmed';
                        
                        if (paymentEntry) {
                            paymentEntry.status = 'confirmed';
                            if (!paymentEntry.completedAt) {
                                paymentEntry.completedAt = new Date();
                            }
                        }
                        
                        if (!wasAlreadyCompleted) {
                            user.UserBalance = (user.UserBalance || 0) + amount;
                            
                            const xpEarned = calculateXPFromPayment(amount);
                            const currentXP = user.RankXP || 0;
                            user.RankXP = currentXP + xpEarned;
                            
                            const rankInfo = calculateRank(user.RankXP);
                            user.Rank = rankInfo.name;
                            user.RankNextXP = rankInfo.nextRankMinXP || 0;
                            
                            debug.log(`✅ TEST MODE: Balance updated for user ${userId}: +$${amount}`);
                            debug.log(`✅ TEST MODE: XP added: +${xpEarned} XP (Total: ${user.RankXP} XP, Rank: ${rankInfo.name})`);
                        } else {
                            debug.log(`⚠️ TEST MODE: Payment already processed: ${paymentId} for user ${userId}`);
                        }
                        
                        await user.save();
                    }
                }
            }
            
            return res.json({
                success: true,
                status: testStatus,
                amount: parseFloat(req.query.amount || 0),
                btcAmount: req.query.cryptoAmount || req.query.btcAmount || '0.00027703',
                btcAddress: req.query.cryptoAddress || req.query.btcAddress || 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
                payCurrency: req.query.payCurrency || 'BTC',
                testMode: true
            });
        }
        

        const axios = require('axios');
        
        if (!/^\d+$/.test(paymentId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid payment ID format. Payment ID must be a number.'
            });
        }
        
        try {
            const statusResponse = await axios.get(`https://api.nowpayments.io/v1/payment/${paymentId}`, {
                headers: {
                    'x-api-key': NOWPAYMENTS_API_KEY,
                    'Content-Type': 'application/json'
                }
            });
            
            const paymentData = statusResponse.data;
            const status = paymentData.payment_status;
            
            if (status === 'confirmed' || status === 'finished') {
                const orderId = paymentData.order_id;
                const userIdMatch = orderId ? orderId.match(/balance-([^-]+)-/) : null;
                
                if (userIdMatch && userIdMatch[1]) {
                    const userId = userIdMatch[1];
                    const user = await User.findById(userId);
                    
                    if (user) {
                        const amount = parseFloat(paymentData.price_amount || 0);
                        const paymentId = paymentData.payment_id.toString();
                        
                        if (!user.PaymentHistory) {
                            user.PaymentHistory = [];
                        }
                        
                        const paymentEntry = user.PaymentHistory.find(p => p.paymentId === paymentId);
                        const wasAlreadyCompleted = paymentEntry && paymentEntry.completedAt && (paymentEntry.status === 'confirmed' || paymentEntry.status === 'finished');
                        
                        if (paymentEntry) {
                            paymentEntry.status = status;
                            if (!paymentEntry.completedAt) {
                                paymentEntry.completedAt = new Date();
                            }
                            if (paymentData.pay_amount) paymentEntry.btcAmount = paymentData.pay_amount.toString();
                            if (paymentData.pay_address) paymentEntry.btcAddress = paymentData.pay_address;
                        } else {
                            user.PaymentHistory.push({
                                paymentId: paymentId,
                                orderId: orderId,
                                amount: amount,
                                currency: paymentData.price_currency || 'USD',
                                paymentMethod: 'Bitcoin',
                                status: status,
                                btcAmount: paymentData.pay_amount ? paymentData.pay_amount.toString() : null,
                                btcAddress: paymentData.pay_address || null,
                                createdAt: new Date(),
                                completedAt: new Date(),
                                testMode: NOWPAYMENTS_TEST_MODE || false
                            });
                        }
                        
                        if (!wasAlreadyCompleted) {
                            const currentBalance = user.UserBalance || 0;
                            user.UserBalance = currentBalance + amount;
                            
                            const xpEarned = calculateXPFromPayment(amount);
                            const currentXP = user.RankXP || 0;
                            user.RankXP = currentXP + xpEarned;
                            
                            const rankInfo = calculateRank(user.RankXP);
                            user.Rank = rankInfo.name;
                            user.RankNextXP = rankInfo.nextRankMinXP || 0;
                            
                            const modeText = NOWPAYMENTS_TEST_MODE ? ' (TEST MODE)' : '';
                            debug.log(`✅ Balance updated for user ${userId}: +$${amount} (status: ${status})${modeText}`);
                            debug.log(`✅ XP added: +${xpEarned} XP (Total: ${user.RankXP} XP, Rank: ${rankInfo.name})${modeText}`);
                        } else {
                            debug.log(`⚠️ Payment already processed: ${paymentId} for user ${userId}`);
                        }
                        
                        await user.save();
                    }
                }
            }
            
            return res.json({
                success: true,
                status: status,
                amount: parseFloat(paymentData.price_amount || 0),
                btcAmount: paymentData.pay_amount,
                btcAddress: paymentData.pay_address,
                payCurrency: paymentData.pay_currency || 'BTC'
            });
        } catch (apiError) {
            debug.error('NOWPayments status check error:', apiError.response?.data || apiError.message);
            return res.status(500).json({
                success: false,
                message: 'Payment status could not be checked'
            });
        }
    } catch (error) {
        debug.error('Payment status check error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error. Please try again later.'
        });
    }
});

router.post('/balance/add', authenticateToken, async (req, res) => {
    try {
        const { amount } = req.body;
        const userId = req.user.userId;

        if (!amount || amount <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Please enter a valid amount'
            });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        const currentBalance = user.UserBalance || 0;
        user.UserBalance = currentBalance + amount;
        await user.save();

        res.json({
            success: true,
            message: `$${amount.toFixed(2)} has been added to your balance`,
            newBalance: user.UserBalance
        });
    } catch (error) {
        debug.error('Balance addition error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error. Please try again later.'
        });
    }
});

router.put('/profile/update', authenticateToken, async (req, res) => {
    try {
        const { name, email } = req.body;
        const userId = req.user.userId;

        if (!name || !email) {
            return res.status(400).json({
                success: false,
                message: 'Name and email are required'
            });
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid email format'
            });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        const existingUserByName = await User.findOne({ 
            name: name.trim(),
            _id: { $ne: userId } // Exclude current user
        });

        if (existingUserByName) {
            return res.status(400).json({
                success: false,
                message: 'This username is already taken by another user'
            });
        }

        const existingUserByEmail = await User.findOne({ 
            email: email.toLowerCase().trim(),
            _id: { $ne: userId } // Exclude current user
        });

        if (existingUserByEmail) {
            return res.status(400).json({
                success: false,
                message: 'This email is already taken by another user'
            });
        }

        user.name = name.trim();
        user.email = email.toLowerCase().trim();
        await user.save();

        res.json({
            success: true,
            message: 'Profile updated successfully',
            user: {
                name: user.name,
                email: user.email
            }
        });
    } catch (error) {
        debug.error('Profile update error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error. Please try again later.'
        });
    }
});

router.put('/password/change', authenticateToken, async (req, res) => {
    try {
        const { currentPassword, newPassword, confirmPassword } = req.body;
        const userId = req.user.userId;

        if (!currentPassword || !newPassword || !confirmPassword) {
            return res.status(400).json({
                success: false,
                message: 'All password fields are required'
            });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({
                success: false,
                message: 'New password must be at least 6 characters long'
            });
        }

        if (newPassword !== confirmPassword) {
            return res.status(400).json({
                success: false,
                message: 'New password and confirm password do not match'
            });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        const isPasswordValid = await user.comparePassword(currentPassword);
        if (!isPasswordValid) {
            return res.status(400).json({
                success: false,
                message: 'Current password is incorrect'
            });
        }

        const isSamePassword = await user.comparePassword(newPassword);
        if (isSamePassword) {
            return res.status(400).json({
                success: false,
                message: 'New password must be different from current password'
            });
        }

        user.password = newPassword;
        await user.save();

        res.json({
            success: true,
            message: 'Password changed successfully'
        });
    } catch (error) {
        debug.error('Password change error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error. Please try again later.'
        });
    }
});

module.exports = router;

