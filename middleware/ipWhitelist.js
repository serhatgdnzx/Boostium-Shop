const allowedIPs = [
    '127.0.0.1',
    '::1',
    'localhost'
].filter(Boolean);

const ipWhitelist = (req, res, next) => {
    const clientIP = req.ip || 
                     req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 
                     req.headers['x-real-ip'] || 
                     req.connection.remoteAddress ||
                     req.socket.remoteAddress ||
                     'unknown';

    const isAllowed = allowedIPs.some(allowedIP => {
        if (clientIP === allowedIP) return true;
        if (clientIP.startsWith(allowedIP + ':')) return true;
        if (allowedIP.includes('*')) {
            const pattern = allowedIP.replace(/\*/g, '.*');
            return new RegExp(`^${pattern}$`).test(clientIP);
        }
        return false;
    });

    if (!isAllowed) {
        console.warn(`Blocked API request from unauthorized IP: ${clientIP}`);
        return res.status(403).json({ 
            message: 'Access denied. Your IP address is not authorized.',
            error: 'FORBIDDEN'
        });
    }

    next();
};

module.exports = ipWhitelist;

