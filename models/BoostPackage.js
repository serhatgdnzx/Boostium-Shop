const mongoose = require('mongoose');
const boostPackageSchema = require('../schema/BoostPackageSchema');

boostPackageSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

const BoostPackage = mongoose.model('BoostPackage', boostPackageSchema);

module.exports = BoostPackage;

