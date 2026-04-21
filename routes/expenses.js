const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const Expense = require('../models/Expense');
const { protect, adminOnly } = require('../middleware/auth');

// GET /api/expenses - All (residents see visible ones, admin sees all)
router.get('/', protect, async (req, res) => {
  try {
    const { month, category, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (month) filter.month = month;
    if (category) filter.category = category;
    if (req.user.role !== 'admin') filter.isVisible = true;

    const expenses = await Expense.find(filter)
      .populate('addedBy', 'name')
      .sort({ date: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Expense.countDocuments(filter);
    const totalAmount = await Expense.aggregate([
      { $match: filter },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    res.json({
      success: true,
      expenses,
      total,
      totalAmount: totalAmount[0]?.total || 0,
      pages: Math.ceil(total / limit)
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/expenses/monthly-summary - grouped by month
router.get('/monthly-summary', protect, async (req, res) => {
  try {
    const filter = req.user.role !== 'admin' ? { isVisible: true } : {};
    const summary = await Expense.aggregate([
      { $match: filter },
      { $group: { _id: '$month', total: { $sum: '$amount' }, count: { $sum: 1 } } },
      { $sort: { _id: -1 } },
      { $limit: 12 }
    ]);
    res.json({ success: true, summary });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/expenses - Admin: add expense
router.post('/', protect, adminOnly, [
  body('title').trim().notEmpty().withMessage('Title is required'),
  body('amount').isNumeric().isFloat({ min: 1 }).withMessage('Valid amount required'),
  body('category').isIn(['maintenance', 'utilities', 'security', 'cleaning', 'gardening', 'repairs', 'admin', 'events', 'emergency', 'other']),
  body('date').isISO8601().withMessage('Valid date required')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

  try {
    const { title, description, amount, category, date, isVisible, vendor, receiptUrl } = req.body;
    const expense = await Expense.create({
      title, description, amount: parseFloat(amount), category, date, isVisible,
      vendor, receiptUrl, addedBy: req.user._id
    });

    await expense.populate('addedBy', 'name');
    res.status(201).json({ success: true, message: 'Expense added.', expense });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/expenses/:id - Admin: update expense
router.put('/:id', protect, adminOnly, async (req, res) => {
  try {
    const expense = await Expense.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true })
      .populate('addedBy', 'name');
    if (!expense) return res.status(404).json({ success: false, message: 'Expense not found.' });
    res.json({ success: true, message: 'Expense updated.', expense });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/expenses/:id - Admin: delete expense
router.delete('/:id', protect, adminOnly, async (req, res) => {
  try {
    const expense = await Expense.findByIdAndDelete(req.params.id);
    if (!expense) return res.status(404).json({ success: false, message: 'Expense not found.' });
    res.json({ success: true, message: 'Expense deleted.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
