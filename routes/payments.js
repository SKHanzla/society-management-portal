const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const Payment = require('../models/Payment');
const User = require('../models/User');
const { protect, adminOnly } = require('../middleware/auth');

const getCurrentMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

const isLateFee = () => {
  const now = new Date();
  return now.getDate() > parseInt(process.env.DUE_DATE_DAY || 10);
};

// GET /api/payments/my - Resident's own payments
router.get('/my', protect, async (req, res) => {
  try {
    const payments = await Payment.find({ resident: req.user._id })
      .sort({ month: -1 })
      .populate('verifiedBy', 'name');
    
    res.json({ success: true, payments });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/payments/current - Get or init current month payment
router.get('/current', protect, async (req, res) => {
  try {
    const month = getCurrentMonth();
    let payment = await Payment.findOne({ resident: req.user._id, month });
    
    if (!payment) {
      const baseAmount = parseFloat(process.env.MONTHLY_DUE_AMOUNT || 2000);
      const lateFee = isLateFee() ? parseFloat(process.env.LATE_FEE_AMOUNT || 200) : 0;
      
      payment = {
        _id: null,
        resident: req.user._id,
        month,
        amount: baseAmount,
        lateFee,
        totalAmount: baseAmount + lateFee,
        status: 'pending',
        isNew: true
      };
    }

    res.json({ success: true, payment });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/payments/submit - Resident submits payment
router.post('/submit', protect, [
  body('referenceId').trim().notEmpty().withMessage('Reference ID is required'),
  body('month').optional().matches(/^\d{4}-(0[1-9]|1[0-2])$/)
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  try {
    const month = req.body.month || getCurrentMonth();
    
    // Check for duplicate submission
    const existing = await Payment.findOne({ resident: req.user._id, month });
    if (existing && ['submitted', 'verified'].includes(existing.status)) {
      return res.status(409).json({ 
        success: false, 
        message: `Payment for ${month} already ${existing.status}.` 
      });
    }

    const baseAmount = parseFloat(process.env.MONTHLY_DUE_AMOUNT || 2000);
    const lateFee = isLateFee() ? parseFloat(process.env.LATE_FEE_AMOUNT || 200) : 0;

    const paymentData = {
      resident: req.user._id,
      month,
      amount: baseAmount,
      lateFee,
      totalAmount: baseAmount + lateFee,
      status: 'submitted',
      paymentMode: req.body.paymentMode || 'easypaisa_manual',
      referenceId: req.body.referenceId,
      screenshotUrl: req.body.screenshotUrl,
      submittedAt: new Date()
    };

    let payment;
    if (existing) {
      Object.assign(existing, paymentData);
      payment = await existing.save();
    } else {
      payment = await Payment.create(paymentData);
    }

    res.status(201).json({
      success: true,
      message: 'Payment submitted successfully. Admin will verify shortly.',
      payment
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// --- ADMIN ROUTES ---

// GET /api/payments/all - Admin: all payments with filters
router.get('/all', protect, adminOnly, async (req, res) => {
  try {
    const { month, status, page = 1, limit = 50 } = req.query;
    const filter = {};
    if (month) filter.month = month;
    if (status) filter.status = status;

    const payments = await Payment.find(filter)
      .populate('resident', 'name houseNumber phone block')
      .populate('verifiedBy', 'name')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Payment.countDocuments(filter);

    res.json({ success: true, payments, total, pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/payments/summary/:month - Admin: monthly summary
router.get('/summary/:month', protect, adminOnly, async (req, res) => {
  try {
    const { month } = req.params;
    const totalResidents = await User.countDocuments({ role: 'resident', isActive: true });
    
    const payments = await Payment.find({ month })
      .populate('resident', 'name houseNumber block');
    
    const verified = payments.filter(p => p.status === 'verified');
    const submitted = payments.filter(p => p.status === 'submitted');
    const pending = totalResidents - payments.length;
    const rejected = payments.filter(p => p.status === 'rejected');
    
    const totalCollected = verified.reduce((sum, p) => sum + p.totalAmount, 0);

    // Get all residents and mark their payment status
    const residents = await User.find({ role: 'resident', isActive: true }).select('name houseNumber phone block');
    const paymentMap = {};
    payments.forEach(p => { paymentMap[p.resident._id.toString()] = p; });
    
    const residentStatus = residents.map(r => ({
      ...r.toJSON(),
      payment: paymentMap[r._id.toString()] || null,
      paymentStatus: paymentMap[r._id.toString()]?.status || 'pending'
    }));

    res.json({
      success: true,
      month,
      summary: {
        totalResidents,
        totalCollected,
        verifiedCount: verified.length,
        submittedCount: submitted.length,
        pendingCount: pending + rejected.length,
        rejectedCount: rejected.length
      },
      residents: residentStatus,
      payments
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/payments/:id/verify - Admin: verify payment
router.put('/:id/verify', protect, adminOnly, async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id).populate('resident', 'name houseNumber');
    if (!payment) return res.status(404).json({ success: false, message: 'Payment not found.' });

    payment.status = 'verified';
    payment.verifiedAt = new Date();
    payment.verifiedBy = req.user._id;
    payment.adminNote = req.body.note || '';
    await payment.save();

    res.json({ success: true, message: `Payment for ${payment.resident.name} (${payment.resident.houseNumber}) verified.`, payment });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/payments/:id/reject - Admin: reject payment
router.put('/:id/reject', protect, adminOnly, [
  body('reason').trim().notEmpty().withMessage('Rejection reason is required')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

  try {
    const payment = await Payment.findById(req.params.id);
    if (!payment) return res.status(404).json({ success: false, message: 'Payment not found.' });

    payment.status = 'rejected';
    payment.rejectionReason = req.body.reason;
    payment.adminNote = req.body.note || '';
    await payment.save();

    res.json({ success: true, message: 'Payment rejected.', payment });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/payments/:id/override - Admin: manual override
router.put('/:id/override', protect, adminOnly, async (req, res) => {
  try {
    const { status, amount, lateFee, note } = req.body;
    const payment = await Payment.findById(req.params.id);
    if (!payment) return res.status(404).json({ success: false, message: 'Payment not found.' });

    if (status) payment.status = status;
    if (amount !== undefined) payment.amount = amount;
    if (lateFee !== undefined) payment.lateFee = lateFee;
    if (note) payment.adminNote = note;
    if (status === 'verified') {
      payment.verifiedAt = new Date();
      payment.verifiedBy = req.user._id;
    }

    await payment.save();
    res.json({ success: true, message: 'Payment overridden.', payment });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/payments/manual - Admin: add manual payment for a resident
router.post('/manual', protect, adminOnly, [
  body('residentId').notEmpty(),
  body('month').matches(/^\d{4}-(0[1-9]|1[0-2])$/),
  body('amount').isNumeric()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

  try {
    const { residentId, month, amount, lateFee = 0, paymentMode = 'cash', referenceId, note } = req.body;

    const existing = await Payment.findOne({ resident: residentId, month });
    if (existing && existing.status === 'verified') {
      return res.status(409).json({ success: false, message: 'Payment already verified for this month.' });
    }

    const paymentData = {
      resident: residentId, month,
      amount: parseFloat(amount),
      lateFee: parseFloat(lateFee),
      totalAmount: parseFloat(amount) + parseFloat(lateFee),
      status: 'verified',
      paymentMode,
      referenceId,
      adminNote: note,
      verifiedBy: req.user._id,
      verifiedAt: new Date(),
      submittedAt: new Date()
    };

    let payment;
    if (existing) {
      Object.assign(existing, paymentData);
      payment = await existing.save();
    } else {
      payment = await Payment.create(paymentData);
    }

    res.status(201).json({ success: true, message: 'Manual payment recorded.', payment });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
