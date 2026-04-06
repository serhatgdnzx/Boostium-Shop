const mongoose = require('mongoose');
const advertisementSchema = require('../schema/AdversimentSchema');

const Advertisement = mongoose.model('Advertisement', advertisementSchema);

module.exports = Advertisement;

