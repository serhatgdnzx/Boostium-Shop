const mongoose = require('mongoose');
const generalSiteSchema = require('../schema/GeneralSiteSchema');

const GeneralSite = mongoose.model('GeneralSite', generalSiteSchema);

module.exports = GeneralSite;


