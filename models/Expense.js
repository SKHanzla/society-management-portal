const mongoose = require('mongoose');

const expenseSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Title is required'],
    trim: true,
    maxlength: [200, 'Title cannot exceed 200 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [1000, 'Description cannot exceed 1000 characters']
  },
  amount: {
    type: Number,
    required: [true, 'Amount is required'],
    min: [1, 'Amount must be at least 1']
  },
  category: {
    type: String,
    enum: ['maintenance', 'utilities', 'security', 'cleaning', 'gardening', 'repairs', 'admin', 'events', 'emergency', 'other'],
    default: 'other'
  },
  date: {
    type: Date,
    required: [true, 'Date is required'],
    default: Date.now
  },
  month: {
    type: String,
    // YYYY-MM format, auto-set from date
  },
  receiptUrl: {
    type: String
  },
  addedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  isVisible: {
    type: Boolean,
    default: true // Residents can see this expense
  },
  vendor: {
    type: String,
    trim: true
  }
}, { timestamps: true });

// Auto-set month from date
expenseSchema.pre('save', function(next) {
  if (this.date) {
    const d = new Date(this.date);
    this.month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
  next();
});

module.exports = mongoose.model('Expense', expenseSchema);
