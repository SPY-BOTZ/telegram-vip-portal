const express = require('express');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Basic Webhook / Home Route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Payment webhook or status route
app.post('/api/verify-payment', async (req, res) => {
  try {
    const paymentData = req.body;
    // Yahan aap apna payment verification aur Telegram add logic likh sakte hain
    res.status(200).json({ success: true, message: 'Payment processed successfully' });
  } catch (error) {
    console.error('Error processing payment:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running smoothly on port ${PORT}`);
});
