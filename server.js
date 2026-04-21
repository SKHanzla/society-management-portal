const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const paymentRoutes = require('./routes/payments');
const expenseRoutes = require('./routes/expenses');
const reportRoutes = require('./routes/reports');
const fundraisingRoutes = require('./routes/fundraising');
const userRoutes = require('./routes/users');
const webhookRoutes = require('./routes/webhooks');

const app = express();

app.set('trust proxy', 1);

/**
 * ✅ CORS
 */
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173',
  'http://localhost:5000'
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('CORS not allowed'));
  },
  credentials: true
}));

/**
 * ✅ BODY PARSING
 */
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

/**
 * ✅ ROUTES (NO RATE LIMIT)
 */
app.use('/api/auth', authRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/fundraising', fundraisingRoutes);
app.use('/api/users', userRoutes);
app.use('/api/webhooks', webhookRoutes);

/**
 * ✅ HEALTH CHECK
 */
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'Executive Villas Society Portal API is running',
    timestamp: new Date().toISOString(),
    society: process.env.SOCIETY_NAME
  });
});

/**
 * ✅ ERROR HANDLER
 */
app.use((err, req, res, next) => {
  console.error('❌ Error:', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error'
  });
});

/**
 * ✅ DB + SERVER
 */
const PORT = process.env.PORT || 5000;

mongoose.connect(process.env.MONGO_URI, {
  serverSelectionTimeoutMS: 5000
})
.then(() => {
  console.log('✅ MongoDB connected successfully');

  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🏘️  ${process.env.SOCIETY_NAME} Portal API ready`);
  });
})
.catch(err => {
  console.error('❌ MongoDB connection failed:', err.message);
  process.exit(1);
});

module.exports = app;