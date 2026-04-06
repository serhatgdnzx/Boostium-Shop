const mongoose = require('mongoose');
const activityLogSchema = require('../schema/ActivityLogSchema');

const ActivityLog = mongoose.model('ActivityLog', activityLogSchema);

module.exports = ActivityLog;


