require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Health check for Render/Vercel monitoring
app.get('/api/health', (req, res) => res.status(200).json({ status: 'UP', message: 'Arya Pay Backend is running' }));

// Static file serving - more robust for production
const frontendPath = path.join(__dirname, '../frontend');
app.use(express.static(frontendPath));

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
    console.error("❌ ERROR: MONGODB_URI is not defined in .env");
    process.exit(1);
}

mongoose.connect(MONGODB_URI)
  .then(() => {
      console.log("✅ MongoDB Connected");
      seedDatabase();
  })
  .catch((err) => {
      console.log("❌ MongoDB Error:", err);
      console.log('---------------------------------------------------------');
      console.log('TIP: Ensure your IP is whitelisted to 0.0.0.0/0 in Atlas');
      console.log('---------------------------------------------------------');
  });

// Schemas
const userSchema = new mongoose.Schema({
    phone: { type: String, unique: true, required: true },
    name: String,
    pin: String,
    balance: { type: Number, default: 0 },
    upi_id: { type: String, unique: true },
    bank_name: String,
    atm_card: String,
    rewards_earned: { type: Number, default: 0 },
    profile_photo: { type: String, default: "" },
    flex_active: { type: Boolean, default: false },
    flex_limit: { type: Number, default: 50000 },
    flex_available: { type: Number, default: 50000 },
    flex_card_number: { type: String, default: "4215 8892 3140 8842" },
    pocket_money_active: { type: Boolean, default: false },
    pocket_money_balance: { type: Number, default: 0 },
    pocket_money_allowance: { type: Number, default: 2000 },
    pocket_money_daily_limit: { type: Number, default: 500 }
});
const User = mongoose.model('User', userSchema);

// Helper to generate a unique 12-digit UPI reference number
function generateTransactionId() {
    return 'BHARAT' + Math.floor(100000000000 + Math.random() * 900000000000).toString();
}

const transactionSchema = new mongoose.Schema({
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    target_id: { type: mongoose.Schema.Types.ObjectId }, // Can refer to User, Biller, or Business
    target_type: { type: String, enum: ['User', 'Biller', 'Business'], default: 'User' },
    type: String, // 'paid', 'recharge', 'received'
    amount: Number,
    title: String,
    date: { type: Date, default: Date.now },
    transaction_id: { type: String, default: generateTransactionId }
});
const Transaction = mongoose.model('Transaction', transactionSchema);

const bankAccountSchema = new mongoose.Schema({
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    type: { type: String, default: 'Savings Account' },
    bank_name: String,
    account_number: String,
    ifsc: { type: String, default: '' },
    balance: Number,
    pin: String,
    status: { type: String, default: 'linked' },
    is_primary: { type: Boolean, default: false }
});
const BankAccount = mongoose.model('BankAccount', bankAccountSchema);

const contactSchema = new mongoose.Schema({
    name: String, initials: String, color: String
});
const Contact = mongoose.model('Contact', contactSchema);

const billerSchema = new mongoose.Schema({
    name: String, icon: String, bg_color: String, icon_color: String, status: String
});
const Biller = mongoose.model('Biller', billerSchema);

const businessSchema = new mongoose.Schema({
    name: String, initials: String, color: String, icon_type: String
});
const Business = mongoose.model('Business', businessSchema);


async function seedDatabase() {
    const contactCount = await Contact.countDocuments();
    if (contactCount === 0) {
        await Contact.insertMany([
            { name: 'Aarav Sharma', initials: 'A', color: '#FF5722' },
            { name: 'Neha Singh', initials: 'N', color: '#4CAF50' },
            { name: 'Rohan Patel', initials: 'R', color: '#2196F3' },
            { name: 'Amrita Das', initials: 'A', color: '#9C27B0' },
            { name: 'Vikas Gupta', initials: 'V', color: '#E91E63' }
        ]);
    }

    const billerCount = await Biller.countDocuments();
    if (billerCount === 0) {
        await Biller.insertMany([
            { name: 'Arohan', icon: 'fa-building', bg_color: '#fff', icon_color: '#000080', status: 'overdue' },
            { name: 'Vi Prepaid', icon: 'fa-bolt', bg_color: '#ef4444', icon_color: 'white', status: 'expiring' },
            { name: 'Airtel', icon: 'fa-tv', bg_color: '#ef4444', icon_color: 'white', status: '' },
            { name: 'Jio', icon: 'fa-wifi', bg_color: '#1a73e8', icon_color: 'white', status: '' }
        ]);
    }

    const businessCount = await Business.countDocuments();
    if (businessCount === 0) {
        await Business.insertMany([
            { name: 'DAGA AU...', initials: 'D', color: '#9c27b0', icon_type: 'text' },
            { name: 'Air Fiber', initials: 'A', color: '#ef4444', icon_type: 'text' },
            { name: 'Jio Prepaid', initials: 'Jio', color: '#1a73e8', icon_type: 'text' }
        ]);
    }
}

// ==== AUTHENTICATION APIs ====

app.post('/api/signup', async (req, res) => {
    try {
        const { phone, name, pin, bank_name, atm_card } = req.body;
        if (!phone || !name || !pin || !bank_name || !atm_card) {
            return res.status(400).json({ error: 'All fields are required.' });
        }

        const upi_id = `${phone}@bharat`;
        const initialBalance = 15000.0; 

        const existingUser = await User.findOne({ phone });
        if (existingUser) return res.status(400).json({ error: 'Phone number already registered.' });

        const newUser = new User({ phone, name, pin, balance: initialBalance, upi_id, bank_name, atm_card, rewards_earned: 0 });
        await newUser.save();

        // Automatically create and link the primary bank account
        const primaryBank = new BankAccount({
            user_id: newUser._id,
            type: 'Savings Account',
            bank_name: bank_name,
            account_number: atm_card,
            balance: initialBalance,
            pin: pin,
            status: 'linked'
        });
        await primaryBank.save();

        res.json({ success: true, token: newUser._id, upi_id, name: newUser.name });
    } catch (err) {
        res.status(500).json({ error: 'Database error: ' + err.message });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { phone, pin } = req.body;
        const user = await User.findOne({ phone, pin });
        if (!user) return res.status(401).json({ error: 'Invalid phone or PIN' });
        res.json({ success: true, token: user._id, name: user.name, upi_id: user.upi_id });
    } catch (err) {
        res.status(500).json({ error: 'Database error' });
    }
});

// Active SSE clients mapped by userId
const activeClients = {};

// SSE Events Endpoint
app.get('/api/events', (req, res) => {
    const token = req.query.token;
    if (!token || !mongoose.Types.ObjectId.isValid(token)) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    const userId = token.toString();

    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*'
    });

    // Write a connection confirmation event
    res.write(`data: ${JSON.stringify({ type: 'CONNECTED' })}\n\n`);

    activeClients[userId] = res;

    req.on('close', () => {
        if (activeClients[userId] === res) {
            delete activeClients[userId];
        }
    });
});

app.post('/api/user/update', async (req, res) => {
    try {
        const userId = req.headers['authorization'];
        if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const { name, pin, bank_name, atm_card, profile_photo } = req.body;
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ error: 'User not found' });

        if (name) user.name = name.trim();
        if (pin) {
            if (!/^\d{4}$/.test(pin)) {
                return res.status(400).json({ error: 'UPI PIN must be exactly 4 digits' });
            }
            user.pin = pin;
        }
        if (bank_name) user.bank_name = bank_name.trim();
        if (atm_card) user.atm_card = atm_card.trim();
        if (profile_photo !== undefined) user.profile_photo = profile_photo;

        await user.save();
        res.json({ success: true, name: user.name, upi_id: user.upi_id, profile_photo: user.profile_photo });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==== SECURE APIs ====
function getUserId(req) {
    const token = req.headers['authorization'];
    if (token && mongoose.Types.ObjectId.isValid(token)) {
        return token;
    }
    return null;
}

app.get('/api/user', async (req, res) => {
    try {
        const userId = getUserId(req);
        if (!userId) return res.status(401).json({ error: 'Not logged in' });

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ error: 'User not found' });

        // Calculate Friends based on unique target Users
        const txs = await Transaction.find({ user_id: userId, target_type: 'User', target_id: { $ne: null } });
        const uniqueFriends = new Set(txs.map(t => t.target_id.toString())).size;

        res.json({ ...user.toObject(), friends_count: uniqueFriends });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/transactions', async (req, res) => {
    try {
        const userId = getUserId(req);
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });

        const txs = await Transaction.find({ user_id: userId }).sort({ date: -1 });
        res.json(txs);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Real dynamic contacts
app.get('/api/recent_contacts', async (req, res) => {
    try {
        const userId = getUserId(req);
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });

        const txs = await Transaction.find({ user_id: userId, target_type: 'User', target_id: { $ne: null } }).sort({ date: -1 });
        const contactIds = [...new Set(txs.map(tx => tx.target_id.toString()))];
        
        if (contactIds.length === 0) {
            const allUsers = await User.find({ _id: { $ne: userId } }).limit(5);
            if (allUsers.length > 0) {
                return res.json(allUsers.map(u => ({ id: u._id, name: u.name, initials: u.name.charAt(0).toUpperCase(), color: '#'+Math.floor(Math.random()*16777215).toString(16).padStart(6, '0'), phone: u.phone, upi_id: u.upi_id, profile_photo: u.profile_photo || '' })));
            } else {
                const dummy = await Contact.find();
                return res.json(dummy.map(d => ({ id: d._id, name: d.name, initials: d.initials, color: d.color, phone: '1234567890', upi_id: 'dummy@bharat', profile_photo: '' })));
            }
        }

        const recentUsers = await User.find({ _id: { $in: contactIds } });
        
        // Chronological sort to match transaction history recency order
        recentUsers.sort((a, b) => {
            return contactIds.indexOf(a._id.toString()) - contactIds.indexOf(b._id.toString());
        });

        res.json(recentUsers.map(u => ({ id: u._id, name: u.name, initials: u.name.charAt(0).toUpperCase(), color: '#'+Math.floor(Math.random()*16777215).toString(16).padStart(6, '0'), phone: u.phone, upi_id: u.upi_id, profile_photo: u.profile_photo || '' })));
    } catch (err) {
        console.error('Error in /api/recent_contacts:', err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/recent_billers', async (req, res) => {
    try {
        const userId = getUserId(req);
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });

        const txs = await Transaction.find({ user_id: userId, target_type: 'Biller', target_id: { $ne: null } }).sort({ date: -1 });
        const billerIds = [...new Set(txs.map(tx => tx.target_id.toString()))];

        if (billerIds.length === 0) return res.json([]);

        const billers = await Biller.find({ _id: { $in: billerIds } });
        res.json(billers);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/recent_businesses', async (req, res) => {
    try {
        const userId = getUserId(req);
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });

        const txs = await Transaction.find({ user_id: userId, target_type: 'Business', target_id: { $ne: null } }).sort({ date: -1 });
        const busIds = [...new Set(txs.map(tx => tx.target_id.toString()))];

        if (busIds.length === 0) return res.json([]);

        const businesses = await Business.find({ _id: { $in: busIds } });
        res.json(businesses);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Bank Accounts API
app.get('/api/banks', async (req, res) => {
    try {
        const userId = getUserId(req);
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });

        let banks = await BankAccount.find({ user_id: userId });
        
        // Auto-seed primary bank from user profile if user has no bank accounts yet
        if (banks.length === 0) {
            const user = await User.findById(userId);
            if (user && user.bank_name) {
                const primaryBank = new BankAccount({
                    user_id: user._id,
                    type: 'Savings Account',
                    bank_name: user.bank_name,
                    account_number: user.atm_card || '987654321012',
                    balance: user.balance || 15000,
                    pin: user.pin,
                    status: 'linked',
                    is_primary: true
                });
                await primaryBank.save();
                banks = [primaryBank];
            }
        }

        res.json(banks.map(b => ({
            id: b._id,
            type: b.type || 'Savings Account',
            bank_name: b.bank_name,
            account_number: b.account_number,
            status: b.status,
            balance: b.balance,
            is_primary: b.is_primary || false
        })));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/banks', async (req, res) => {
    try {
        const { type, bank_name, account_number, pin, ifsc } = req.body;
        const userId = getUserId(req);
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });
        if (!bank_name || !account_number || !pin) {
            return res.status(400).json({ error: 'Bank name, account number, and 4-digit UPI PIN are required' });
        }
        if (!/^\d{4}$/.test(pin.toString().trim())) {
            return res.status(400).json({ error: 'UPI PIN must be exactly 4 digits' });
        }

        const existingCount = await BankAccount.countDocuments({ user_id: userId });
        const randomStartingBalance = Math.floor(Math.random() * 45000) + 5000;
        
        const newBank = new BankAccount({
            user_id: userId,
            type: type || 'Savings Account',
            bank_name: bank_name.trim(),
            account_number: account_number.toString().trim(),
            ifsc: ifsc ? ifsc.trim().toUpperCase() : '',
            balance: randomStartingBalance,
            pin: pin.toString().trim(),
            status: 'linked',
            is_primary: existingCount === 0
        });
        await newBank.save();
        res.json({
            success: true,
            id: newBank._id,
            bank_name: newBank.bank_name,
            account_number: newBank.account_number,
            balance: randomStartingBalance,
            type: newBank.type,
            is_primary: newBank.is_primary
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/banks/balance', async (req, res) => {
    try {
        const { bank_id, pin } = req.body;
        const userId = getUserId(req);
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });
        if (!pin) return res.status(400).json({ error: 'UPI PIN is required' });

        const bank = await BankAccount.findOne({ _id: bank_id, user_id: userId });
        if (!bank) return res.status(404).json({ error: 'Bank account not found' });
        if (bank.pin !== pin.toString().trim()) {
            return res.status(401).json({ error: 'Incorrect UPI PIN. Please try again.' });
        }

        // If it's the primary bank, ensure user balance is in sync
        const user = await User.findById(userId);
        if (bank.is_primary && user) {
            bank.balance = user.balance;
            await bank.save();
        }

        res.json({
            success: true,
            balance: bank.balance,
            bank_name: bank.bank_name,
            account_number: bank.account_number
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Payment API
app.post('/api/pay', async (req, res) => {
    try {
        const { amount, title, pin, recipientIdentifier } = req.body;
        const userId = getUserId(req);
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });
        if (!amount || amount <= 0) return res.status(400).json({ error: 'Invalid amount' });

        const sender = await User.findById(userId);
        if (!sender) return res.status(404).json({ error: 'User not found' });
        if (pin && sender.pin !== pin.toString().trim()) return res.status(401).json({ error: 'Incorrect UPI PIN' });
        if (sender.balance < amount) return res.status(400).json({ error: 'Insufficient funds' });

        let recipient = null;
        let busId = null;
        let dummyContact = null;

        if (recipientIdentifier) {
            const rawId = recipientIdentifier.toString().trim();

            // 1. Direct match by ObjectId
            if (mongoose.Types.ObjectId.isValid(rawId)) {
                recipient = await User.findById(rawId);
            }

            // 2. Exact match by phone, UPI ID, or name excluding sender
            if (!recipient || recipient._id.toString() === sender._id.toString()) {
                recipient = await User.findOne({
                    _id: { $ne: sender._id },
                    $or: [
                        { phone: rawId },
                        { upi_id: rawId },
                        { name: { $regex: new RegExp(`^${rawId}$`, 'i') } }
                    ]
                });
            }

            // 3. Case-insensitive name match excluding sender
            if (!recipient) {
                const escaped = rawId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                recipient = await User.findOne({
                    _id: { $ne: sender._id },
                    name: { $regex: new RegExp(escaped, 'i') }
                });
            }

            // 4. Check Business
            if (!recipient) {
                const escaped = rawId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const bus = await Business.findOne({ name: { $regex: new RegExp(escaped, 'i') } });
                if (bus) busId = bus._id;
            }

            // 5. Check dummy Contacts collection
            if (!recipient && !busId) {
                const escaped = rawId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                dummyContact = await Contact.findOne({
                    $or: [
                        { _id: mongoose.Types.ObjectId.isValid(rawId) ? rawId : null },
                        { name: { $regex: new RegExp(escaped, 'i') } }
                    ]
                });
            }

            // Fallback to random business if none matched
            if (!recipient && !busId && !dummyContact) {
                const buses = await Business.find();
                if (buses.length > 0) busId = buses[Math.floor(Math.random() * buses.length)]._id;
            }
        }

        if (recipient && recipient._id.toString() === sender._id.toString()) {
            return res.status(400).json({ error: 'Cannot pay yourself' });
        }

        // Deduct from sender and add random reward (₹1 to ₹15)
        sender.balance -= amount;
        const earnedReward = Math.floor(Math.random() * 15) + 1;
        sender.rewards_earned = (sender.rewards_earned || 0) + earnedReward;
        await sender.save();

        // Also sync primary bank balance for sender
        await BankAccount.findOneAndUpdate(
            { user_id: sender._id, is_primary: true },
            { balance: sender.balance }
        );

        let recipientDisplayName = 'Merchant';
        let targetId = null;
        let targetType = 'Business';

        if (recipient) {
            recipientDisplayName = recipient.name;
            targetId = recipient._id;
            targetType = 'User';
        } else if (dummyContact) {
            recipientDisplayName = dummyContact.name;
            targetId = dummyContact._id;
            targetType = 'User';
        } else if (busId) {
            const b = await Business.findById(busId);
            recipientDisplayName = b ? b.name : (recipientIdentifier || 'Business');
            targetId = busId;
            targetType = 'Business';
        }

        const txTitle = recipientDisplayName ? `Paid to ${recipientDisplayName}` : (title || 'Payment');

        const senderTx = new Transaction({
            user_id: sender._id,
            target_id: targetId,
            target_type: targetType,
            type: 'paid',
            amount: amount,
            title: txTitle
        });
        await senderTx.save();

        // Add to recipient if registered user
        if (recipient) {
            recipient.balance += amount;
            await recipient.save();

            // Sync recipient's primary bank account
            await BankAccount.findOneAndUpdate(
                { user_id: recipient._id, is_primary: true },
                { balance: recipient.balance }
            );

            const receiverTx = new Transaction({
                user_id: recipient._id,
                target_id: sender._id,
                target_type: 'User',
                type: 'received',
                amount: amount,
                title: `Received from ${sender.name}`
            });
            await receiverTx.save();

            // Real-time Push Notification via SSE
            const recipientRes = activeClients[recipient._id.toString()];
            if (recipientRes) {
                recipientRes.write(`data: ${JSON.stringify({
                    type: 'PAYMENT_RECEIVED',
                    amount: amount,
                    senderName: sender.name,
                    newBalance: recipient.balance
                })}\n\n`);
            }
        }

        res.json({
            success: true,
            newBalance: sender.balance,
            reward: earnedReward,
            recipientName: recipientDisplayName,
            transactionId: senderTx.transaction_id,
            date: senderTx.date
        });
    } catch (err) {
        console.error('Pay error:', err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/recharge', async (req, res) => {
    try {
        const { amount, title, pin, mobile, biller } = req.body;
        const userId = getUserId(req);
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ error: 'User not found' });
        if (pin && user.pin !== pin) return res.status(401).json({ error: 'Incorrect UPI PIN' });
        if (user.balance < amount) return res.status(400).json({ error: 'Insufficient funds' });

        user.balance -= amount;
        user.rewards_earned += Math.floor(Math.random() * 10) + 1; // Reward for recharge
        await user.save();

        let bId = req.body.biller_id;
        if (!bId) {
            const billers = await Biller.find();
            if (billers.length > 0) {
                bId = billers[Math.floor(Math.random() * billers.length)]._id;
            }
        }

        const rechargeTitle = title || (mobile ? `${biller || 'Mobile Recharge'} (+91 ${mobile})` : 'Mobile recharge');

        const tx = new Transaction({
            user_id: user._id,
            target_id: bId || null,
            target_type: 'Biller',
            type: 'recharge',
            amount: amount,
            title: rechargeTitle
        });
        await tx.save();

        res.json({ success: true, newBalance: user.balance, mobile });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==== CREDIT & LOANS APIs ====

app.get('/api/credit/status', async (req, res) => {
    try {
        const userId = getUserId(req);
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ error: 'User not found' });

        res.json({
            flex: {
                active: !!user.flex_active,
                limit: user.flex_limit || 50000,
                available: user.flex_available !== undefined ? user.flex_available : 50000,
                cardNumber: user.flex_card_number || "4215 8892 3140 8842"
            },
            pocketMoney: {
                active: !!user.pocket_money_active,
                balance: user.pocket_money_balance || 0,
                allowance: user.pocket_money_allowance || 2000,
                dailyLimit: user.pocket_money_daily_limit || 500
            },
            userBalance: user.balance,
            userName: user.name
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/credit/flex/activate', async (req, res) => {
    try {
        const userId = getUserId(req);
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ error: 'User not found' });

        user.flex_active = true;
        user.flex_limit = 50000;
        user.flex_available = 50000;
        user.flex_card_number = "4215 8892 3140 8842";
        await user.save();

        // Also ensure linked as BankAccount for UPI credit card access
        const existingCard = await BankAccount.findOne({ user_id: user._id, bank_name: 'Arya Bank Flex' });
        if (!existingCard) {
            const flexCardAccount = new BankAccount({
                user_id: user._id,
                type: 'RuPay Credit Card',
                bank_name: 'Arya Bank Flex',
                account_number: '•••• 8842',
                balance: 50000,
                pin: user.pin || '1234',
                status: 'linked'
            });
            await flexCardAccount.save();
        }

        const tx = new Transaction({
            user_id: user._id,
            target_type: 'Biller',
            type: 'received',
            amount: 50000,
            title: 'Arya Flex Credit Card Activated (₹50,000 Credit Line)'
        });
        await tx.save();

        res.json({
            success: true,
            message: 'Flex by Arya Bank activated successfully',
            flex: {
                active: true,
                limit: 50000,
                available: 50000,
                cardNumber: user.flex_card_number
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/credit/loan/apply', async (req, res) => {
    try {
        const { amount, tenureMonths, pin } = req.body;
        const userId = getUserId(req);
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ error: 'User not found' });
        if (pin && user.pin !== pin) return res.status(401).json({ error: 'Incorrect UPI PIN' });

        const loanAmount = Math.min(Math.max(parseFloat(amount) || 50000, 10000), 1000000);
        const tenure = parseInt(tenureMonths) || 12;

        const monthlyRate = 0.115 / 12;
        const emi = Math.round((loanAmount * monthlyRate * Math.pow(1 + monthlyRate, tenure)) / (Math.pow(1 + monthlyRate, tenure) - 1));

        // Disburse loan into user's account balance immediately
        user.balance += loanAmount;
        await user.save();

        // Record credit transaction
        const tx = new Transaction({
            user_id: user._id,
            target_type: 'Biller',
            type: 'received',
            amount: loanAmount,
            title: `Instant Personal Loan Disbursed (${tenure} Mo @ ₹${emi.toLocaleString('en-IN')}/mo)`
        });
        await tx.save();

        res.json({
            success: true,
            loanAmount,
            tenure,
            emi,
            newBalance: user.balance,
            message: `₹${loanAmount.toLocaleString('en-IN')} disbursed into your account successfully!`
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/credit/pocket-money/setup', async (req, res) => {
    try {
        const { allowance, dailyLimit, initialTransfer, pin } = req.body;
        const userId = getUserId(req);
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ error: 'User not found' });
        if (pin && user.pin !== pin) return res.status(401).json({ error: 'Incorrect UPI PIN' });

        const transferAmt = parseFloat(initialTransfer) || 0;
        if (transferAmt > 0) {
            if (user.balance < transferAmt) return res.status(400).json({ error: 'Insufficient funds for initial wallet transfer' });
            user.balance -= transferAmt;
            user.pocket_money_balance = (user.pocket_money_balance || 0) + transferAmt;
        }

        user.pocket_money_active = true;
        user.pocket_money_allowance = parseFloat(allowance) || 2000;
        user.pocket_money_daily_limit = parseFloat(dailyLimit) || 500;
        await user.save();

        if (transferAmt > 0) {
            const tx = new Transaction({
                user_id: user._id,
                target_type: 'Biller',
                type: 'paid',
                amount: transferAmt,
                title: `Pocket Money Setup (Transferred to Sub-Wallet)`
            });
            await tx.save();
        }

        res.json({
            success: true,
            pocketMoney: {
                active: true,
                balance: user.pocket_money_balance,
                allowance: user.pocket_money_allowance,
                dailyLimit: user.pocket_money_daily_limit
            },
            newBalance: user.balance
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`---------------------------------------------------------`);
    console.log(`🚀 Arya Pay Server is live!`);
    console.log(`📡 Listening on Port: ${PORT}`);
    console.log(`🔗 URL: http://localhost:${PORT}`);
    console.log(`---------------------------------------------------------`);
});
