const express = require('express');
const router = express.Router();
const Payment = require('../models/Payment');
const Expense = require('../models/Expense');
const User = require('../models/User');
const { protect, adminOnly } = require('../middleware/auth');

// GET /api/reports/monthly/:month - Full monthly report
router.get('/monthly/:month', protect, adminOnly, async (req, res) => {
  try {
    const { month } = req.params;
    const totalResidents = await User.countDocuments({ role: 'resident', isActive: true });

    // Payments
    const payments = await Payment.find({ month })
      .populate('resident', 'name houseNumber phone block');
    
    const verified = payments.filter(p => p.status === 'verified');
    const submitted = payments.filter(p => p.status === 'submitted');
    const pending = totalResidents - payments.filter(p => ['verified', 'submitted'].includes(p.status)).length;
    
    const totalCollected = verified.reduce((sum, p) => sum + p.totalAmount, 0);
    const totalLateFees = verified.reduce((sum, p) => sum + p.lateFee, 0);

    // Expenses
    const expenses = await Expense.find({ month }).populate('addedBy', 'name');
    const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
    
    // Balance
    const balance = totalCollected - totalExpenses;

    // Unpaid residents
    const paidResidentIds = verified.map(p => p.resident._id.toString());
    const unpaidResidents = await User.find({
      role: 'resident',
      isActive: true,
      _id: { $nin: paidResidentIds }
    }).select('name houseNumber phone block');

    const report = {
      month,
      generatedAt: new Date().toISOString(),
      society: process.env.SOCIETY_NAME || 'Executive Villas',
      summary: {
        totalResidents,
        paidCount: verified.length,
        pendingSubmissionCount: submitted.length,
        unpaidCount: pending,
        totalCollected,
        totalLateFees,
        totalExpenses,
        balance,
        collectionRate: totalResidents > 0 ? ((verified.length / totalResidents) * 100).toFixed(1) : 0
      },
      payments: verified.map(p => ({
        house: p.resident.houseNumber,
        name: p.resident.name,
        amount: p.amount,
        lateFee: p.lateFee,
        total: p.totalAmount,
        mode: p.paymentMode,
        date: p.verifiedAt
      })),
      expenses: expenses.map(e => ({
        title: e.title,
        amount: e.amount,
        category: e.category,
        date: e.date
      })),
      unpaidResidents: unpaidResidents.map(r => ({
        house: r.houseNumber,
        name: r.name,
        phone: r.phone
      })),
      pendingVerification: submitted.map(p => ({
        house: p.resident.houseNumber,
        name: p.resident.name,
        referenceId: p.referenceId,
        submittedAt: p.submittedAt
      }))
    };

    res.json({ success: true, report });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/reports/dashboard - Admin dashboard stats
router.get('/dashboard', protect, adminOnly, async (req, res) => {
  try {
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const lastMonth = now.getMonth() === 0
      ? `${now.getFullYear() - 1}-12`
      : `${now.getFullYear()}-${String(now.getMonth()).padStart(2, '0')}`;

    const totalResidents = await User.countDocuments({ role: 'resident', isActive: true });
    
    const [currentPayments, lastPayments, currentExpenses, recentPayments] = await Promise.all([
      Payment.find({ month: currentMonth }),
      Payment.find({ month: lastMonth, status: 'verified' }),
      Expense.find({ month: currentMonth }),
      Payment.find({ status: 'submitted' })
        .populate('resident', 'name houseNumber')
        .sort({ submittedAt: -1 })
        .limit(10)
    ]);

    const currentVerified = currentPayments.filter(p => p.status === 'verified');
    const currentCollected = currentVerified.reduce((sum, p) => sum + p.totalAmount, 0);
    const lastCollected = lastPayments.reduce((sum, p) => sum + p.totalAmount, 0);
    const currentExpensesTotal = currentExpenses.reduce((sum, e) => sum + e.amount, 0);

    // Last 6 months trend
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }

    const trend = await Payment.aggregate([
      { $match: { month: { $in: months }, status: 'verified' } },
      { $group: { _id: '$month', collected: { $sum: '$totalAmount' }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);

    const expenseTrend = await Expense.aggregate([
      { $match: { month: { $in: months } } },
      { $group: { _id: '$month', total: { $sum: '$amount' }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);

    res.json({
      success: true,
      dashboard: {
        currentMonth,
        totalResidents,
        currentMonth: {
          collected: currentCollected,
          paidCount: currentVerified.length,
          pendingCount: totalResidents - currentVerified.length,
          submittedCount: currentPayments.filter(p => p.status === 'submitted').length,
          expenses: currentExpensesTotal,
          balance: currentCollected - currentExpensesTotal
        },
        lastMonth: { collected: lastCollected },
        pendingVerification: recentPayments,
        trend,
        expenseTrend
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/reports/resident-dashboard - Resident's own stats
router.get('/resident-dashboard', protect, async (req, res) => {
  try {
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    
    const [myPayments, currentExpenses, totalCollected] = await Promise.all([
      Payment.find({ resident: req.user._id }).sort({ month: -1 }).limit(12),
      Expense.find({ isVisible: true }).sort({ date: -1 }).limit(10),
      Payment.aggregate([
        { $match: { status: 'verified' } },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } }
      ])
    ]);

    const currentPayment = myPayments.find(p => p.month === currentMonth);

    res.json({
      success: true,
      dashboard: {
        currentMonth,
        currentPayment: currentPayment || null,
        paymentHistory: myPayments,
        recentExpenses: currentExpenses,
        societyFunds: {
          totalCollected: totalCollected[0]?.total || 0
        },
        easypaisa: {
          accountNumber: process.env.EASYPAISA_ACCOUNT || '03001234567',
          accountTitle: process.env.SOCIETY_NAME || 'Executive Villas Society'
        }
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/reports/whatsapp/:month - WhatsApp share template
router.get('/whatsapp/:month', protect, adminOnly, async (req, res) => {
  try {
    const { month } = req.params;
    const totalResidents = await User.countDocuments({ role: 'resident', isActive: true });
    const payments = await Payment.find({ month, status: 'verified' });
    const expenses = await Expense.find({ month });
    
    const collected = payments.reduce((sum, p) => sum + p.totalAmount, 0);
    const expensesTotal = expenses.reduce((sum, e) => sum + e.amount, 0);
    const balance = collected - expensesTotal;
    
    const [y, m] = month.split('-');
    const monthName = new Date(y, m - 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });

    const message = `🏘️ *${process.env.SOCIETY_NAME || 'Executive Villas'} — Monthly Report*
📅 *${monthName}*

💰 *Collections*
✅ Paid: ${payments.length}/${totalResidents} residents
💵 Total Collected: Rs. ${collected.toLocaleString()}

📋 *Expenses*
Total Spent: Rs. ${expensesTotal.toLocaleString()}

🏦 *Balance*
Net Balance: Rs. ${balance.toLocaleString()} ${balance >= 0 ? '✅' : '⚠️'}

${totalResidents - payments.length > 0 ? `⚠️ *Dues Pending: ${totalResidents - payments.length} residents*` : '🎉 All dues collected!'}

_Generated by Society Management Portal_
_Date: ${new Date().toLocaleDateString('en-PK')}_`;

    res.json({ success: true, month, message, url: `https://wa.me/?text=${encodeURIComponent(message)}` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
