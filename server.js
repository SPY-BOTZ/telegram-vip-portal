require('dotenv').config();
const express = require('express');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
app.use(express.json());
app.use(express.static('public'));

const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID;
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const VIP_CHANNEL_ID = process.env.VIP_CHANNEL_ID;

const razorpay = new Razorpay({
    key_id: RAZORPAY_KEY_ID,
    key_secret: RAZORPAY_KEY_SECRET
});

const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: false });

// Plan prices per month (Aap apne hisab se price change kar sakte hain)
const MONTHLY_PRICE = 199; // ₹199 per month

// 1. Create Razorpay Order API with Multi-Month Support
app.post('/create-order', async (req, res) => {
    try {
        const { months } = req.body;
        const validMonths = parseInt(months) || 1;
        
        // Total amount calculation (e.g., 3 months = 199 * 3 = 597)
        let totalAmount = MONTHLY_PRICE * validMonths;
        
        // Optional: Discount for longer plans (jaise 5 months par thodi chhoot)
        if(validMonths === 5) {
            totalAmount = 899; // Special bundle price for 5 months
        }

        const options = {
            amount: totalAmount * 100, // Amount in paise
            currency: "INR",
            receipt: `receipt_${validMonths}m_${Date.now()}`
        };

        const order = await razorpay.orders.create(options);
        res.json({ success: true, order, totalAmount, months: validMonths });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Server Error" });
    }
});

// 2. Verify Payment & Send Telegram Invite Link API
app.post('/verify-payment', async (req, res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature, telegramId, months } = req.body;

        const body = razorpay_order_id + "|" + razorpay_payment_id;
        const expectedSignature = crypto
            .createHmac('sha256', RAZORPAY_KEY_SECRET)
            .update(body.toString())
            .digest('hex');

        if (expectedSignature === razorpay_signature) {
            // Generate single-use invite link for the private channel
            const inviteLink = await bot.createChatInviteLink(VIP_CHANNEL_ID, {
                member_limit: 1,
                expire_date: Math.floor(Date.now() / 1000) + 86400 // Link expires in 24 hours
            });

            if(telegramId) {
                await bot.sendMessage(telegramId, `🎉 *Payment Successful!*\n\nPlan: *${months} Month(s) VIP Pass*\n\nHere is your exclusive private channel link:\n${inviteLink.invite_link}\n\n_Note: This invite link can only be used once._`, { parse_mode: 'Markdown' });
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

// Dynamic Port setup for Koyeb / Render / Local
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
