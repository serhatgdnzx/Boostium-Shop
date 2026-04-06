const mongoose = require('mongoose');
const commentSchema = require('../schema/CommentsSchema');

const Comment = mongoose.model('Comment', commentSchema);

module.exports = Comment;

