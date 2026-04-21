const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { generateToken, protect, adminOnly } = require('../middleware/auth');

/**
 * Helpers
 */
const normalizePhone = (phone) => phone.trim();
const normalizeHouse = (house) => house.trim().toUpperCase();



// POST /api/auth/register
router.post('/register', [
  body('name').trim().notEmpty().withMessage('Name is required').isLength({ max: 100 }),
  body('houseNumber').trim().notEmpty().withMessage('House number is required'),
  body('phone').matches(/^03\d{9}$/).withMessage('Enter valid Pakistani phone number (03XXXXXXXXX)'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('role').optional().isIn(['admin', 'resident'])
], async (req, res) => {

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  try {
    let { name, houseNumber, phone, password, role, block, floor } = req.body;

    phone = normalizePhone(phone);
    houseNumber = normalizeHouse(houseNumber);

    const existing = await User.findOne({ $or: [{ houseNumber }, { phone }] });
    if (existing) {
      const field = existing.houseNumber === houseNumber ? 'House number' : 'Phone number';
      return res.status(409).json({ success: false, message: `${field} already registered.` });
    }

    let assignedRole = 'resident';

    if (role === 'admin') {
      const adminCount = await User.countDocuments({ role: 'admin' });
      if (adminCount === 0) assignedRole = 'admin';
    }

    // ✅ Save password as-is (plain text)
    const user = await User.create({
      name,
      houseNumber,
      phone,
      password,
      role: assignedRole,
      block,
      floor
    });

    const token = generateToken(user._id);

    res.status(201).json({
      success: true,
      message: 'Account created successfully',
      token,
      user: {
        id: user._id,
        name: user.name,
        houseNumber: user.houseNumber,
        role: user.role,
        phone: user.phone
      }
    });

  } catch (err) {
    res.status(500).json({ success: false, message: 'Registration failed', error: err.message });
  }
});



// POST /api/auth/login
router.post('/login', [
  body('identifier').trim().notEmpty().withMessage('Phone or house number is required'),
  body('password').notEmpty().withMessage('Password is required')
], async (req, res) => {

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  try {
    let { identifier, password } = req.body;

    const upper = identifier.toUpperCase();

    const user = await User.findOne({
      $or: [
        { phone: identifier },
        { houseNumber: upper }
      ]
    }).select('+password');

    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid credentials.' });
    }

    

    if (!user.isActive) {
      return res.status(401).json({ success: false, message: 'Account deactivated. Contact admin.' });
    }

    user.lastLogin = new Date();
    await user.save({ validateBeforeSave: false });

    const token = generateToken(user._id);

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        name: user.name,
        houseNumber: user.houseNumber,
        role: user.role,
        phone: user.phone,
        block: user.block
      }
    });

  } catch (err) {
    res.status(500).json({ success: false, message: 'Login failed', error: err.message });
  }
});



// GET /api/auth/me
router.get('/me', protect, async (req, res) => {
  res.json({ success: true, user: req.user });
});



// POST /api/auth/create-resident (admin only)
router.post('/create-resident', protect, adminOnly, [
  body('name').trim().notEmpty(),
  body('houseNumber').trim().notEmpty(),
  body('phone').matches(/^03\d{9}$/),
  body('password').isLength({ min: 6 })
], async (req, res) => {

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  try {
    let { name, houseNumber, phone, password, block, floor } = req.body;

    phone = normalizePhone(phone);
    houseNumber = normalizeHouse(houseNumber);

    const existing = await User.findOne({ $or: [{ houseNumber }, { phone }] });
    if (existing) {
      return res.status(409).json({ success: false, message: 'House number or phone already registered.' });
    }

    const user = await User.create({
      name,
      houseNumber,
      phone,
      password,
      role: 'resident',
      block,
      floor
    });

    res.status(201).json({
      success: true,
      message: `Resident ${name} (${houseNumber}) created successfully`,
      user
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;