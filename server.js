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

// Dono Channels aur unke respective Admin Log Channels ki configuration
const CHANNELS_CONFIG = {
    'channel1': {
        name: 'VIP Movie & Series Channel',
        vipId: process.env.CHANNEL_1_VIP_ID || '@channel_1_vip',
        logId: process.env.CHANNEL_1_LOG_ID || '@channel_1_logs',
        plans: {
            '15days': { name: '15 Days Trial', amount: 99 },
            '1month': { name: '1 Month Pass', amount: 199 },
            '2months': { name: '2 Months Pass', amount: 369 },
            '3months': { name: '3 Months Gold VIP', amount: 499 },
            '4months': { name: '4 Months Diamond', amount: 649 }
        }
    },
    'channel2': {
        name: 'VIP Premium Bot & Tools Channel',
        vipId: process.env.CHANNEL_2_VIP_ID || '@channel_2_vip',
        logId: process.env.CHANNEL_2_LOG_ID || '@channel_2_logs',
        plans: {
            '15days': { name: '15 Days Trial', amount: 149 },
            '1month': { name: '1 Month Pass', amount: 299 },
            '2months': { name: '2 Months Pass', amount: 549 },
            '3months': { name: '3 Months Gold VIP', amount: 799 },
            '4months': { name: '4 Months Diamond', amount: 999 }
        }
    }
};

const razorpay = new Razorpay({
    key_id: RAZORPAY_KEY_ID,
    key_secret: RAZORPAY_KEY_SECRET
});

const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: false });

// 1. Create Order API (Channel aur Plan ke hisab se)
app.post('/create-order', async (req, res) => {
    try {
        const { channelKey, planKey } = req.body;
        const channelData = CHANNELS_CONFIG[channelKey];

        if(!channelData || !channelData.plans[planKey]) {
            return res.status(400).json({ success: false, message: "Invalid Channel or Plan" });
        }

        const selectedPlan = channelData.plans[planKey];

        const options = {
            amount: selectedPlan.amount * 100, // paise me
            currency: "INR",
            receipt: `rcpt_${channelKey}_${planKey}_${Date.now()}`
        };

        const order = await razorpay.orders.create(options);
        res.json({ success: true, order, planName: selectedPlan.name, amount: selectedPlan.amount });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Server Error" });
    }
});

// 2. Verify Payment & Send Link / Log
app.post('/verify-payment', async (req, res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature, telegramId, channelKey, planKey } = req.body;
        const channelData = CHANNELS_CONFIG[channelKey];
        const selectedPlan = channelData.plans[planKey];

        const body = razorpay_order_id + "|" + razorpay_payment_id;
        const expectedSignature = crypto
            .createHmac('sha256', RAZORPAY_KEY_SECRET)
            .update(body.toString())
            .digest('hex');

        if (expectedSignature === razorpay_signature) {
            // Generate single-use invite link for specific channel
            const inviteLink = await bot.createChatInviteLink(channelData.vipId, {
                member_limit: 1,
                expire_date: Math.floor(Date.now() / 1000) + 86400
            });

            // Send link to User
            if(telegramId) {
                await bot.sendMessage(telegramId, `⚡ *PAYMENT CONFIRMED!*\n\nChannel: *${channelData.name}*\nPlan: *${selectedPlan.name}*\n\nHere is your secure access link:\n${inviteLink.invite_link}\n\n_Note: Valid for single use only._`, { parse_mode: 'Markdown' });
            }

            // Send payment proof/log to specific Admin Log Channel
            const logMessage = `🔔 *NEW VIP PURCHASE (${channelData.name})*\n\n👤 *User ID:* \`${telegramId}\`\n💎 *Plan:* ${selectedPlan.name}\n💰 *Amount:* ₹${selectedPlan.amount}\n🧾 *Payment ID:* \`${razorpay_payment_id}\`\n\n✅ _Automated link generated and dispatched._`;
            
            await bot.sendMessage(channelData.logId, logMessage, { parse_mode: 'Markdown' });

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
