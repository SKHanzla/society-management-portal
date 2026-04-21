const express = require('express');
const router = express.Router();
const Payment = require('../models/Payment');
const crypto = require('crypto');

/**
 * Easypaisa Webhook Endpoint
 * This receives payment confirmations from Easypaisa's server
 * 
 * To activate: Register this URL in Easypaisa merchant portal:
 * https://yourdomain.com/api/webhooks/easypaisa
 */
router.post('/easypaisa', async (req, res) => {
  try {
    const payload = req.body;
    console.log('📱 Easypaisa webhook received:', JSON.stringify(payload));

    // Validate signature (Easypaisa sends HMAC hash)
    // Uncomment and configure when using real Easypaisa API
    /*
    const hashKey = process.env.EASYPAISA_HASH_KEY;
    const receivedHash = req.headers['hash'];
    const dataString = `${payload.storeId}${payload.orderId}${payload.transactionAmount}${payload.mobileAccountNo}`;
    const computedHash = crypto.createHmac('sha256', hashKey).update(dataString).digest('hex').toUpperCase();
    
    if (receivedHash !== computedHash) {
      console.error('❌ Invalid Easypaisa webhook signature');
      return res.status(400).json({ success: false, message: 'Invalid signature' });
    }
    */

    const {
      transactionId,
      orderId,         // This should be our referenceId
      responseCode,    // 0000 = success
      transactionAmount,
      mobileAccountNo
    } = payload;

    if (responseCode === '0000' || payload.responseCode === '0000') {
      // Find payment by referenceId (orderId from Easypaisa)
      const payment = await Payment.findOne({
        $or: [
          { referenceId: orderId },
          { transactionId: transactionId }
        ]
      });

      if (payment) {
        payment.status = 'verified';
        payment.transactionId = transactionId;
        payment.paymentMode = 'easypaisa_api';
        payment.verifiedAt = new Date();
        payment.easypaisaResponse = payload;
        payment.submittedAt = payment.submittedAt || new Date();
        await payment.save();
        console.log(`✅ Payment auto-verified via Easypaisa: ${transactionId}`);
      } else {
        console.warn(`⚠️ Payment not found for orderId: ${orderId}`);
      }
    }

    // Easypaisa expects 200 OK
    res.status(200).json({ success: true, message: 'Webhook received' });
  } catch (err) {
    console.error('Webhook error:', err);
    res.status(500).json({ success: false });
  }
});

/**
 * Mode 2: Easypaisa API Integration Placeholder
 * 
 * When ready for full API:
 * 1. Register merchant at: https://www.easypaisa.com.pk/merchants/
 * 2. Get Store ID and Hash Key
 * 3. Use their SDK: https://github.com/telenorpakistan/easypaisa-sdk
 * 
 * Payment initiation flow:
 * POST https://easypay.easypaisa.com.pk/easypay/Index.jsf
 * with: storeId, orderId, transactionAmount, mobileAccountNo, emailAddress
 */
router.post('/easypaisa/initiate', async (req, res) => {
  try {
    const { amount, mobileNumber, orderId } = req.body;
    
    // PLACEHOLDER: Replace with actual Easypaisa API call
    const easypaisaPayload = {
      storeId: process.env.EASYPAISA_STORE_ID,
      orderId,
      transactionAmount: amount,
      mobileAccountNo: mobileNumber,
      emailAddress: '',
      transactionType: 'MA',
      tokenExpiry: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      encryptedHashRequest: 'PLACEHOLDER_HASH'
    };

    res.json({
      success: true,
      message: 'Easypaisa API integration placeholder. Configure EASYPAISA_STORE_ID and EASYPAISA_HASH_KEY in .env',
      payload: easypaisaPayload,
      docs: 'https://developer.easypaisa.com.pk'
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
