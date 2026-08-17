// Jab aap admin panel mein 'Approve' button dabayein:
bot.on('callback_query', async (query) => {
    const action = query.data; // e.g., "approve_USERID_CHANNELKEY"
    
    if (action.startsWith('approve_')) {
        const parts = action.split('_');
        const userId = parts[1];
        const channelKey = parts[2];

        // Channel ID set karein (apne paid channel ki chat ID yahan daal dein)
        const targetChannel = channelKey === 'channel1' ? '-100xxxxxxxxxx' : '-100yyyyyyyyyy';

        try {
            // Single-use secure invite link create karna (Member limit: 1)
            const inviteLinkObject = await bot.createChatInviteLink(targetChannel, {
                member_limit: 1, // Sirf 1 user ke liye valid
                expire_date: Math.floor(Date.now() / 1000) + (24 * 3600) // 24 hours expiry agar use na ho toh
            });

            // User ko personal message mein single-use link bhejna
            await bot.sendMessage(userId, `✅ Aapki payment verify ho gayi hai!\n\nYeh raha aapka **Single-Use Secure Invite Link** (Yeh link sirf aapke liye hai aur channel join karte hi expire ho jayega):\n\n${inviteLinkObject.invite_link}`);

            // Admin ko confirm karna
            await bot.editMessageText(`✅ Approved & Single-use link sent to user!`, {
                chat_id: query.message.chat.id,
                message_id: query.message.message_id
            });
        } catch (err) {
            console.error(err);
            bot.sendMessage(query.message.chat.id, "❌ Error: Bot ko channel ka admin banayein aur 'Invite Users via Link' ki permission dein.");
        }
    }
});
