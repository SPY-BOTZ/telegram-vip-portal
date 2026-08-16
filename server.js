require('dotenv').config();
const express = require('express');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
app.use(express.json());
app.use(express.static('public'));

// Credentials (Apni details yahan daalein ya environment variables me set karein)
const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || 'YOUR_RAZORPAY_KEY_ID';
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || 'YOUR_RAZORPAY_KEY_SECRET';
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || 'YOUR_TELEGRAM_BOT_TOKEN';
const VIP_CHANNEL_ID = process.env.VIP_CHANNEL_ID || '@your_vip_channel_username';

const razorpay = new Razorpay({
    key_id: RAZORPAY_KEY_ID,
    key_secret: RAZORPAY_KEY_SECRET
});

const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: false });

// 1. Create Razorpay Order API
app.post('/create-order', async (req, res) => {
    try {
        const { plan, amount } = req.body;
        const options = {
            amount: amount * 100, // Amount in paise (e.g. ₹199 = 19900)
            currency: "INR",
            receipt: "receipt_" + Date.now()
        };
        const order = await razorpay.orders.create(options);
        res.json({ success: true, order });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Server Error" });
    }
});

// 2. Verify Payment & Send Telegram Invite Link API
app.post('/verify-payment', async (req, res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature, telegramId } = req.body;

        const body = razorpay_order_id + "|" + razorpay_payment_id;
        const expectedSignature = crypto
            .createHmac('sha256', RAZORPAY_KEY_SECRET)
            .update(body.toString())
            .digest('hex');

        if (expectedSignature === razorpay_signature) {
            // Payment is genuine! Now generate a single-use Telegram invite link
            const inviteLink = await bot.createChatInviteLink(VIP_CHANNEL_ID, {
                member_limit: 1,
                expire_date: Math.floor(Date.now() / 1000) + 86400 // Link expires in 24 hours
            });

            // Send link directly to user via Bot message if numeric ID is provided
            if(telegramId) {
                await bot.sendMessage(telegramId, `🎉 *Payment Successful!*\n\nHere is your exclusive VIP channel link:\n${inviteLink.invite_link}\n\n_Note: This link can only be used once._`, { parse_mode: 'Markdown' });
            }

            res.json({ success: true, invite_link: inviteLink.invite_link });
        } else {
            res.status(400).json({ success: false, message: "Invalid Payment Signature" });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Verification Failed" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
