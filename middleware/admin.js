const jwt = require('jsonwebtoken');
const User = require('../models/User');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET || 'srhtg';

const authenticateAdmin = async (req, res, next) => {
    try {
        const token = req.cookies?.token || (req.headers['authorization'] && req.headers['authorization'].split(' ')[1]);

        if (!token) {
            if (req.path.startsWith('/api')) {
                return res.status(401).json({ message: 'Authentication required' });
            }
            return res.redirect('/login');
        }

        const decoded = jwt.verify(token, JWT_SECRET);
        
        const user = await User.findById(decoded.userId);
        
        if (!user) {
            if (req.path.startsWith('/api')) {
                return res.status(404).json({ message: 'User not found' });
            }
            return res.redirect('/login');
        }

        const isAdmin = user.UserPermissions && user.UserPermissions.includes('admin');
        
        if (!isAdmin) {
            if (req.path.startsWith('/api')) {
                return res.status(403).json({ message: 'Admin access required' });
            }
            return res.status(403).send('Access denied. Admin privileges required.');
        }

        req.user = user;
        req.userId = decoded.userId;
        req.ip = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'unknown';
        next();
    } catch (error) {
        if (req.path.startsWith('/api')) {
            return res.status(401).json({ message: 'Invalid or expired token' });
        }
        return res.redirect('/login');
    }
};

module.exports = authenticateAdmin;

