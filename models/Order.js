const mongoose = require('mongoose');
const orderSchema = require('../schema/OrderSchema');

const Order = mongoose.model('Order', orderSchema);

module.exports = Order;

