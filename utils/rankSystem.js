
const RANK_LEVELS = [
    { name: 'Bronze', minXP: 0, maxXP: 499, discount: 0, icon: 'fa-medal', color: 'from-amber-600 to-orange-600' },
    { name: 'Silver', minXP: 500, maxXP: 1499, discount: 2, icon: 'fa-medal', color: 'from-gray-400 to-gray-500' },
    { name: 'Gold', minXP: 1500, maxXP: 4999, discount: 5, icon: 'fa-medal', color: 'from-yellow-400 to-yellow-600' },
    { name: 'Platinum', minXP: 5000, maxXP: 14999, discount: 10, icon: 'fa-crown', color: 'from-cyan-400 to-blue-500' },
    { name: 'Diamond', minXP: 15000, maxXP: 49999, discount: 15, icon: 'fa-gem', color: 'from-blue-400 to-purple-500' },
    { name: 'Master', minXP: 50000, maxXP: 99999, discount: 20, icon: 'fa-crown', color: 'from-purple-500 to-pink-500' },
    { name: 'Legend', minXP: 100000, maxXP: Infinity, discount: 25, icon: 'fa-crown', color: 'from-red-500 to-orange-500' }
];

/**
 * Calculate rank based on XP
 * @param {number} xp - User's current XP
 * @returns {object} Rank information
 */
function calculateRank(xp) {
    xp = xp || 0;
    
    for (let i = RANK_LEVELS.length - 1; i >= 0; i--) {
        if (xp >= RANK_LEVELS[i].minXP) {
            const currentRank = RANK_LEVELS[i];
            const nextRank = i < RANK_LEVELS.length - 1 ? RANK_LEVELS[i + 1] : null;
            
            return {
                name: currentRank.name,
                level: i + 1,
                currentXP: xp,
                minXP: currentRank.minXP,
                maxXP: currentRank.maxXP,
                discount: currentRank.discount,
                icon: currentRank.icon,
                color: currentRank.color,
                nextRank: nextRank ? nextRank.name : null,
                nextRankMinXP: nextRank ? nextRank.minXP : null,
                progress: nextRank 
                    ? ((xp - currentRank.minXP) / (nextRank.minXP - currentRank.minXP)) * 100 
                    : 100,
                xpNeeded: nextRank ? (nextRank.minXP - xp) : 0
            };
        }
    }
    
    return {
        name: 'Bronze',
        level: 1,
        currentXP: xp,
        minXP: 0,
        maxXP: 499,
        discount: 0,
        icon: 'fa-medal',
        color: 'from-amber-600 to-orange-600',
        nextRank: 'Silver',
        nextRankMinXP: 500,
        progress: (xp / 500) * 100,
        xpNeeded: 500 - xp
    };
}

/**
 * Add XP to user (called when payment is completed)
 * @param {number} amountUSD - Amount in USD
 * @returns {number} XP earned
 */
function calculateXPFromPayment(amountUSD) {
    return Math.floor(amountUSD * 100);
}

/**
 * Get all rank levels
 * @returns {array} All rank levels
 */
function getAllRanks() {
    return RANK_LEVELS;
}

module.exports = {
    calculateRank,
    calculateXPFromPayment,
    getAllRanks,
    RANK_LEVELS
};

