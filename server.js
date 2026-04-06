const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

const corsOptions = {
    origin: function (origin, callback) {
        const allowedOrigins = [
            'http://localhost:3000',
            'http://localhost:3001',
            'https://boostium.shop',
            process.env.FRONTEND_URL
        ].filter(Boolean);
        
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    optionsSuccessStatus: 200
};
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

const MONGODB_URI = process.env.MONGODB_URI || 'MongoDB URI';

mongoose.connect(MONGODB_URI)
.then(() => {
    console.log('MongoDB connection successful');
})
.catch((error) => {
    console.error('MongoDB connection error:', error);
});

const GeneralSite = require('./models/GeneralSite');
const User = require('./models/User');
const Advertisement = require('./models/Advertisement');
const Comment = require('./models/Comment');

const checkMaintenance = async (req, res, next) => {
    try {
        if (req.path.startsWith('/admin') || 
            req.path.startsWith('/api/admin') || 
            req.path.startsWith('/api/auth/login') ||
            req.path.startsWith('/login')) {
            return next();
        }
        
        const generalSite = await GeneralSite.findOne().lean();
        
        if (generalSite && generalSite.GeneralSettings) {
            const maintenanceMode = generalSite.GeneralSettings.maintenanceMode === true || 
                                   generalSite.GeneralSettings.maintenanceMode === 'true';
            
            if (maintenanceMode) {
                return res.status(503).render('maintenance', {
                    title: 'Maintenance Mode',
                    message: generalSite.GeneralSettings.maintenanceMessage || 'Site is under maintenance. Please check back later.'
                });
            }
        }
        
        next();
    } catch (error) {
        console.error('Maintenance check error:', error);
        next(); // Continue on error
    }
};

const authRoutes = require('./routes/auth');
const boostsRoutes = require('./routes/boosts');
const adminRoutes = require('./routes/admin');
const authenticateAdmin = require('./middleware/admin');

const JWT_SECRET = process.env.JWT_SECRET || 'srhtg';

const authenticatePage = async (req, res, next) => {
    const token = req.cookies && req.cookies.token;

    if (!token) {
        return res.redirect('/login');
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await User.findById(decoded.userId);
        
        if (!user) {
            res.clearCookie('token');
            return res.redirect('/login');
        }
        
        if (user.banned === true) {
            res.clearCookie('token');
            return res.redirect(`/login?banned=true&reason=${encodeURIComponent(user.banReason || 'No reason provided')}`);
        }
        
        req.user = decoded;
        req.userId = decoded.userId;
        next();
    } catch (err) {
        res.clearCookie('token');
        return res.redirect('/login');
    }
};

const redirectIfAuthenticated = (req, res, next) => {
    const token = req.cookies && req.cookies.token;

    if (!token) {
        return next();
    }

    jwt.verify(token, JWT_SECRET, (err) => {
        if (err) {
            return next();
        }
        return res.redirect('/dashboard');
    });
};

app.get('/', async (req, res) => {
    try {
        let generalSite = await GeneralSite.findOne().lean();
        if (!generalSite) {
            generalSite = await GeneralSite.create({});
            generalSite = generalSite.toObject();
        }
        const siteSettings = generalSite?.GeneralSettings || {};
        const siteName = siteSettings.siteName || 'Boostium.shop';
        const siteDescription = siteSettings.siteDescription || 'Boostium.shop is a platform for boosting servers.';
        
        let comments = await Comment.find({})
            .sort({ CreatedAt: -1 })
            .limit(20)
            .lean();

        const commentsWithUsers = await Promise.all(comments.map(async (comment) => {
            let user = null;
            try {
                if (mongoose.Types.ObjectId.isValid(comment.UserID)) {
                    user = await User.findById(comment.UserID).select('name email').lean();
                } else {
                    user = await User.findOne({ email: comment.UserID }).select('name email').lean();
                }
            } catch (err) {
                console.error('User not found:', err);
            }
            
            return {
                ...comment,
                userName: user ? user.name : 'User',
                userEmail: user ? user.email : 'user@example.com'
            };
        }));
        
        res.render('index', { 
            title: siteName,
            siteName,
            siteDescription,
            siteKeywords: siteSettings.siteKeywords || 'boosts, servers, boosting, platform',
            siteUrl: siteSettings.siteUrl || 'https://boostium.shop',
            apiUrl: '/api',
            comments: commentsWithUsers || []
        });
    } catch (error) {
        console.error('Error loading index page:', error);
        let comments = [];
        try {
            comments = await Comment.find({})
                .sort({ CreatedAt: -1 })
                .limit(20)
                .lean();
            
            const commentsWithUsers = await Promise.all(comments.map(async (comment) => {
                let user = null;
                try {
                    if (mongoose.Types.ObjectId.isValid(comment.UserID)) {
                        user = await User.findById(comment.UserID).select('name email').lean();
                    } else {
                        user = await User.findOne({ email: comment.UserID }).select('name email').lean();
                    }
                } catch (err) {
                }
                
                return {
                    ...comment,
                    userName: user ? user.name : 'User',
                    userEmail: user ? user.email : 'user@example.com'
                };
            }));
            comments = commentsWithUsers;
        } catch (err) {
            console.error('Error loading comments in error handler:', err);
        }
        
        res.render('index', { 
            title: 'Boostium.shop',
            siteName: 'Boostium.shop',
            siteDescription: 'Boostium.shop is a platform for boosting servers.',
            siteKeywords: 'boosts, servers, boosting, platform',
            siteUrl: 'https://boostium.shop',
            apiUrl: '/api',
            comments: comments || []
        });
    }
});

app.get('/login', redirectIfAuthenticated, async (req, res) => {
    try {
        const banned = req.query.banned === 'true';
        const banReason = req.query.reason || 'No reason provided';
        
        let generalSite = await GeneralSite.findOne().lean();
        if (!generalSite) {
            generalSite = await GeneralSite.create({});
            generalSite = generalSite.toObject();
        }
        const siteSettings = generalSite?.GeneralSettings || {};
        const siteName = siteSettings.siteName || 'Boostium.shop';
        const siteDescription = siteSettings.siteDescription || 'Boostium.shop is a platform for boosting servers.';
        
        res.render('login', { 
            title: `Login | ${siteName}`,
            siteName,
            siteDescription,
            siteKeywords: siteSettings.siteKeywords || 'boosts, servers, boosting, platform',
            siteUrl: siteSettings.siteUrl || 'https://boostium.shop',
            apiUrl: '/api',
            banned,
            banReason
        });
    } catch (error) {
        console.error('Error loading login page:', error);
        res.render('login', { 
            title: 'Login | Boostium.shop',
            siteName: 'Boostium.shop',
            siteDescription: 'Boostium.shop is a platform for boosting servers.',
            siteKeywords: 'boosts, servers, boosting, platform',
            siteUrl: 'https://boostium.shop',
            apiUrl: '/api',
            banned: req.query.banned === 'true',
            banReason: req.query.reason || 'No reason provided'
        });
    }
});

app.get('/dashboard', authenticatePage, async (req, res) => {
    try {
        let generalStats = await GeneralSite.findOne().lean();

        if (!generalStats) {
            generalStats = await GeneralSite.create({});
            generalStats = generalStats.toObject();
        }

        let userStats = null;
        const userId = (req.user && req.user.userId) || req.query.userId;

        if (userId) {
            userStats = await User.findById(userId).lean();
        }

        let advertisements = await Advertisement.findOne().lean();

        if (!advertisements) {
            advertisements = await Advertisement.create({
                Advertisements: {
                    ImageURL: 'AdsImageURL1',
                    Link: 'https://boostium.shop'
                },
                Advertisements2: {
                    ImageURL: 'AdsImageURL2',
                    Link: 'https://boostium.shop'
                }
            });
            advertisements = advertisements.toObject();
        }

        const leaderboard = await User.find({})
            .select('name email TotalSpent Rank')
            .sort({ TotalSpent: -1 })
            .limit(10)
            .lean();

        let comments = await Comment.find({})
            .sort({ CreatedAt: -1 })
            .limit(10)
            .lean();

        if (comments.length === 0) {
            let sampleUser = await User.findOne().lean();
            if (sampleUser) {
                const sampleComment = new Comment({
                    UserID: sampleUser._id.toString(),
                    Comment: 'Fast and legit',
                    Stars: 5,
                    CreatedAt: new Date()
                });
                await sampleComment.save();
                comments = [sampleComment.toObject()];
            } else {
                const sampleComment = new Comment({
                    UserID: 'sample-user-id',
                    Comment: 'Fast and legit',
                    Stars: 5,
                    CreatedAt: new Date()
                });
                await sampleComment.save();
                comments = [sampleComment.toObject()];
            }
        }
 
        const commentsWithUsers = await Promise.all(comments.map(async (comment) => {
            let user = null;
            try {
                
                if (mongoose.Types.ObjectId.isValid(comment.UserID)) {
                    user = await User.findById(comment.UserID).select('name email').lean();
                } else {
                    user = await User.findOne({ email: comment.UserID }).select('name email').lean();
                }
            } catch (err) {
                console.error('User not found:', err);
            }
            
            return {
                ...comment,
                userName: user ? user.name : 'User6814',
                userEmail: user ? user.email : 'user@example.com'
            };
        }));

        const siteSettings = generalStats?.GeneralSettings || {};
        const siteName = siteSettings.siteName || 'Boostium.shop';
        const siteDescription = siteSettings.siteDescription || 'Boostium.shop is a platform for boosting servers.';

        res.render('dashboard', { 
            title: `Dashboard | ${siteName}`,
            siteName,
            siteDescription,
            siteKeywords: siteSettings.siteKeywords || 'boosts, servers, boosting, platform',
            siteUrl: siteSettings.siteUrl || 'https://boostium.shop',
            apiUrl: '/api',
            generalStats,
            userStats,
            advertisements,
            leaderboard: leaderboard || [],
            comments: commentsWithUsers || []
        });
    } catch (error) {
        console.error('Error fetching dashboard general statistics:', error);
        let generalStats = await GeneralSite.findOne().lean();
        const siteSettings = generalStats?.GeneralSettings || {};
        const siteName = siteSettings.siteName || 'Boostium.shop';
        const siteDescription = siteSettings.siteDescription || 'Boostium.shop is a platform for boosting servers.';
        
        res.render('dashboard', { 
            title: `Dashboard | ${siteName}`,
            siteName,
            siteDescription,
            siteKeywords: siteSettings.siteKeywords || 'boosts, servers, boosting, platform',
            siteUrl: siteSettings.siteUrl || 'https://boostium.shop',
            apiUrl: '/api',
            generalStats: null,
            userStats: null,
            advertisements: null,
            leaderboard: [],
            comments: []
        });
    }
});


app.get('/add-balance', authenticatePage, async (req, res) => {
    try {
        let userStats = null;
        const userId = (req.user && req.user.userId) || req.query.userId;

        if (userId) {
            userStats = await User.findById(userId).lean();
        }

        let generalSite = await GeneralSite.findOne().lean();
        if (!generalSite) {
            generalSite = await GeneralSite.create({});
            generalSite = generalSite.toObject();
        }
        const siteSettings = generalSite?.GeneralSettings || {};
        const siteName = siteSettings.siteName || 'Boostium.shop';
        const siteDescription = siteSettings.siteDescription || 'Boostium.shop is a platform for boosting servers.';
        
        res.render('add-balance', { 
            title: `Add Balance | ${siteName}`,
            siteName,
            siteDescription,
            siteKeywords: siteSettings.siteKeywords || 'boosts, servers, boosting, platform',
            siteUrl: siteSettings.siteUrl || 'https://boostium.shop',
            apiUrl: '/api',
            userStats
        });
    } catch (error) {
        console.error('Error loading add balance page:', error);
        let generalSite = await GeneralSite.findOne().lean();
        const siteSettings = generalSite?.GeneralSettings || {};
        const siteName = siteSettings.siteName || 'Boostium.shop';
        const siteDescription = siteSettings.siteDescription || 'Boostium.shop is a platform for boosting servers.';
        
        res.render('add-balance', { 
            title: `Add Balance | ${siteName}`,
            siteName,
            siteDescription,
            siteKeywords: siteSettings.siteKeywords || 'boosts, servers, boosting, platform',
            siteUrl: siteSettings.siteUrl || 'https://boostium.shop',
            apiUrl: '/api',
            userStats: userStats || null
        });
    }
});

app.get('/order-history', authenticatePage, async (req, res) => {
    try {
        let userStats = null;
        const userId = (req.user && req.user.userId) || req.query.userId;

        if (userId) {
            userStats = await User.findById(userId).lean();
        }

        const siteName = 'Boostium.shop';
        res.render('order-history.ejs', { 
            title: `History | ${siteName}`,
            apiUrl: '/api',
            userStats
        });
    } catch (error) {
        console.error('Error loading order history page:', error);
        res.render('order-history.ejs', { 
            title: 'Order History | Boostium.shop',
            apiUrl: '/api',
            userStats: userStats || null
        });
    }
});

app.get('/account-settings', authenticatePage, async (req, res) => {
    try {
        let userStats = null;
        const userId = (req.user && req.user.userId) || req.query.userId;

        if (userId) {
            userStats = await User.findById(userId).lean();
        }

        let generalSite = await GeneralSite.findOne().lean();
        if (!generalSite) {
            generalSite = await GeneralSite.create({});
            generalSite = generalSite.toObject();
        }
        const siteSettings = generalSite?.GeneralSettings || {};
        const siteName = siteSettings.siteName || 'Boostium.shop';
        const siteDescription = siteSettings.siteDescription || 'Boostium.shop is a platform for boosting servers.';
        
        res.render('account-settings.ejs', { 
            title: `Account Settings | ${siteName}`,
            siteName,
            siteDescription,
            siteKeywords: siteSettings.siteKeywords || 'boosts, servers, boosting, platform',
            siteUrl: siteSettings.siteUrl || 'https://boostium.shop',
            apiUrl: '/api',
            userStats
        });
    } catch (error) {
        console.error('Error loading account settings page:', error);
        let generalSite = await GeneralSite.findOne().lean();
        const siteSettings = generalSite?.GeneralSettings || {};
        const siteName = siteSettings.siteName || 'Boostium.shop';
        const siteDescription = siteSettings.siteDescription || 'Boostium.shop is a platform for boosting servers.';
        
        res.render('account-settings.ejs', { 
            title: `Account Settings | ${siteName}`,
            siteName,
            siteDescription,
            siteKeywords: siteSettings.siteKeywords || 'boosts, servers, boosting, platform',
            siteUrl: siteSettings.siteUrl || 'https://boostium.shop',
            apiUrl: '/api',
            userStats: userStats || null
        });
    }
});

app.use(checkMaintenance);

const ipWhitelist = require('./middleware/ipWhitelist');

app.use('/api/auth', ipWhitelist, authRoutes);
app.use('/api/boosts', ipWhitelist, boostsRoutes);
app.use('/api/admin', ipWhitelist, adminRoutes);

app.get('/admin', authenticateAdmin, async (req, res) => {
    try {
        const user = await User.findById(req.userId).select('-password');
        res.render('admin-dashboard', {
            title: 'Admin Dashboard | Boostium',
            apiUrl: '/api',
            adminUser: user
        });
    } catch (error) {
        console.error('Admin dashboard error:', error);
        res.status(500).send('Error loading admin dashboard');
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Running on http://localhost:${PORT}`);
    console.log(`API: http://localhost:${PORT}/api`);
});

