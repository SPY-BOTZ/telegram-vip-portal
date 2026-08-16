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
const ADMIN_LOG_CHANNEL_ID = process.env.ADMIN_LOG_CHANNEL_ID || '@your_admin_log_channel'; // Jahan payment proof/log jayega

const razorpay = new Razorpay({
    key_id: RAZORPAY_KEY_ID,
    key_secret: RAZORPAY_KEY_SECRET
});

const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: false });

// Plan pricing definitions (15 Days to 4 Months)
const PLANS = {
    '15days': { name: '15 Days Trial', amount: 99, duration: '15 Days' },
    '1month': { name: '1 Month Pass', amount: 199, duration: '1 Month' },
    '2months': { name: '2 Months Pass', amount: 369, duration: '2 Months' },
    '3months': { name: '3 Months Gold VIP', amount: 499, duration: '3 Months' },
    '4months': { name: '4 Months Diamond Pass', amount: 649, duration: '4 Months' }
};

// 1. Create Order API
app.post('/create-order', async (req, res) => {
    try {
        const { planKey } = req.body;
        const selectedPlan = PLANS[planKey];

        if(!selectedPlan) {
            return res.status(400).json({ success: false, message: "Invalid Plan" });
        }

        const options = {
            amount: selectedPlan.amount * 100, // in paise
            currency: "INR",
            receipt: `rcpt_${planKey}_${Date.now()}`
        };

        const order = await razorpay.orders.create(options);
        res.json({ success: true, order, plan: selectedPlan });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Server Error" });
    }
});

// 2. Verify Payment & Send Log to Admin Channel + Link to User
app.post('/verify-payment', async (req, res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature, telegramId, planKey } = req.body;
        const selectedPlan = PLANS[planKey];

        const body = razorpay_order_id + "|" + razorpay_payment_id;
        const expectedSignature = crypto
            .createHmac('sha256', RAZORPAY_KEY_SECRET)
            .update(body.toString())
            .digest('hex');

        if (expectedSignature === razorpay_signature) {
            // Generate single-use invite link for VIP channel
            const inviteLink = await bot.createChatInviteLink(VIP_CHANNEL_ID, {
                member_limit: 1,
                expire_date: Math.floor(Date.now() / 1000) + 86400
            });

            // 1. Send invite link to the User
            if(telegramId) {
                await bot.sendMessage(telegramId, `⚡ *PAYMENT CONFIRMED!*\n\nPlan: *${selectedPlan.name}*\n\nHere is your secure access link:\n${inviteLink.invite_link}\n\n_Note: Valid for single use only._`, { parse_mode: 'Markdown' });
            }

            // 2. Send Payment Proof & User Detail to Admin Log Channel
            const logMessage = `🔔 *NEW VIP SUBSCRIPTION PURCHASE!*\n\n👤 *User ID:* \`${telegramId}\`\n💎 *Plan:* ${selectedPlan.name}\n💰 *Amount Paid:* ₹${selectedPlan.amount}\n🧾 *Payment ID:* \`${razorpay_payment_id}\`\n🆔 *Order ID:* \`${razorpay_order_id}\`\n\n✅ _Access link generated and dispatched successfully._`;
            
            await bot.sendMessage(ADMIN_LOG_CHANNEL_ID, logMessage, { parse_mode: 'Markdown' });

            res.json({ success: true, invite_link: inviteLink.invite_link });
        } else {
            res.status(400).json({ success: false, message: "Invalid Signature" });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Verification Failed" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
