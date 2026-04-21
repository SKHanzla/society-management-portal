const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const Fundraising = require('../models/Fundraising');
const { protect, adminOnly } = require('../middleware/auth');

// GET /api/fundraising - All campaigns
router.get('/', protect, async (req, res) => {
  try {
    const { status = 'active' } = req.query;
    const filter = status !== 'all' ? { status } : {};
    const campaigns = await Fundraising.find(filter)
      .populate('createdBy', 'name')
      .populate('contributions.resident', 'name houseNumber')
      .sort({ createdAt: -1 });
    res.json({ success: true, campaigns });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/fundraising - Admin: create campaign
router.post('/', protect, adminOnly, [
  body('title').trim().notEmpty(),
  body('goalAmount').isNumeric().isFloat({ min: 1000 }),
  body('category').isIn(['infrastructure', 'events', 'emergency', 'beautification', 'security', 'other'])
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

  try {
    const campaign = await Fundraising.create({ ...req.body, createdBy: req.user._id });
    res.status(201).json({ success: true, message: 'Campaign created.', campaign });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/fundraising/:id/contribute - Resident contributes
router.post('/:id/contribute', protect, [
  body('amount').isNumeric().isFloat({ min: 1 }),
  body('referenceId').optional().trim()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

  try {
    const campaign = await Fundraising.findById(req.params.id);
    if (!campaign) return res.status(404).json({ success: false, message: 'Campaign not found.' });
    if (campaign.status !== 'active') return res.status(400).json({ success: false, message: 'Campaign is not active.' });

    campaign.contributions.push({
      resident: req.user._id,
      amount: parseFloat(req.body.amount),
      referenceId: req.body.referenceId,
      note: req.body.note,
      status: 'pending'
    });

    await campaign.save();
    res.status(201).json({ success: true, message: 'Contribution submitted for verification.', campaign });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/fundraising/:id/contribution/:cid/verify - Admin: verify contribution
router.put('/:id/contribution/:cid/verify', protect, adminOnly, async (req, res) => {
  try {
    const campaign = await Fundraising.findById(req.params.id);
    if (!campaign) return res.status(404).json({ success: false, message: 'Campaign not found.' });
    
    const contribution = campaign.contributions.id(req.params.cid);
    if (!contribution) return res.status(404).json({ success: false, message: 'Contribution not found.' });

    const { action } = req.body; // 'verify' or 'reject'
    contribution.status = action === 'verify' ? 'verified' : 'rejected';
    campaign.recalculateCollected();
    
    if (campaign.collectedAmount >= campaign.goalAmount) {
      campaign.status = 'completed';
    }

    await campaign.save();
    res.json({ success: true, message: `Contribution ${contribution.status}.`, campaign });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/fundraising/:id - Admin: update campaign
router.put('/:id', protect, adminOnly, async (req, res) => {
  try {
    const campaign = await Fundraising.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!campaign) return res.status(404).json({ success: false, message: 'Campaign not found.' });
    res.json({ success: true, campaign });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
