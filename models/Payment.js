const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  resident: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  month: {
    type: String,
    required: [true, 'Month is required'],
    match: [/^\d{4}-(0[1-9]|1[0-2])$/, 'Month must be in YYYY-MM format']
  },
  amount: {
    type: Number,
    required: [true, 'Amount is required'],
    min: [0, 'Amount cannot be negative']
  },
  lateFee: {
    type: Number,
    default: 0
  },
  totalAmount: {
    type: Number,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'submitted', 'verified', 'rejected', 'waived'],
    default: 'pending'
  },
  paymentMode: {
    type: String,
    enum: ['easypaisa_manual', 'easypaisa_api', 'cash', 'bank_transfer'],
    default: 'easypaisa_manual'
  },
  referenceId: {
    type: String,
    trim: true
  },
  transactionId: {
    type: String,
    trim: true
  },
  screenshotUrl: {
    type: String
  },
  submittedAt: {
    type: Date
  },
  verifiedAt: {
    type: Date
  },
  verifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  adminNote: {
    type: String,
    maxlength: [500, 'Note cannot exceed 500 characters']
  },
  rejectionReason: {
    type: String,
    maxlength: [500, 'Reason cannot exceed 500 characters']
  },
  // Easypaisa API webhook data
  easypaisaResponse: {
    type: mongoose.Schema.Types.Mixed
  }
}, { timestamps: true });

// Compound unique index: one payment per resident per month
paymentSchema.index({ resident: 1, month: 1 }, { unique: true });

// Auto-calculate totalAmount
paymentSchema.pre('save', function(next) {
  this.totalAmount = this.amount + this.lateFee;
  next();
});

module.exports = mongoose.model('Payment', paymentSchema);
