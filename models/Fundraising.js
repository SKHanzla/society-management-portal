const mongoose = require('mongoose');

const contributionSchema = new mongoose.Schema({
  resident: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  amount: {
    type: Number,
    required: true,
    min: [1, 'Contribution must be at least 1']
  },
  referenceId: String,
  status: {
    type: String,
    enum: ['pending', 'verified', 'rejected'],
    default: 'pending'
  },
  note: String,
  contributedAt: {
    type: Date,
    default: Date.now
  }
});

const fundraisingSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Title is required'],
    trim: true,
    maxlength: [200, 'Title cannot exceed 200 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [2000, 'Description cannot exceed 2000 characters']
  },
  goalAmount: {
    type: Number,
    required: [true, 'Goal amount is required'],
    min: [1000, 'Goal must be at least 1000']
  },
  collectedAmount: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ['active', 'completed', 'cancelled'],
    default: 'active'
  },
  deadline: {
    type: Date
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  contributions: [contributionSchema],
  category: {
    type: String,
    enum: ['infrastructure', 'events', 'emergency', 'beautification', 'security', 'other'],
    default: 'other'
  },
  imageUrl: String
}, { timestamps: true });

// Calculate collected amount from verified contributions
fundraisingSchema.methods.recalculateCollected = function() {
  this.collectedAmount = this.contributions
    .filter(c => c.status === 'verified')
    .reduce((sum, c) => sum + c.amount, 0);
};

module.exports = mongoose.model('Fundraising', fundraisingSchema);
