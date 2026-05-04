require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/bharatpay';
mongoose.connect(MONGODB_URI, {
    serverSelectionTimeoutMS: 5000 // Stop trying after 5 seconds
})
    .then(() => {
        console.log('Connected to MongoDB Atlas. Booting Schema.');
        seedDatabase();
    })
    .catch(err => {
        console.error('❌ MONGODB ERROR:', err.message);
        console.log('TIP: Make sure you added MONGODB_URI to your Render Environment Variables.');
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
    rewards_earned: { type: Number, default: 0 }
});
const User = mongoose.model('User', userSchema);

const transactionSchema = new mongoose.Schema({
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    target_id: { type: mongoose.Schema.Types.ObjectId }, // Can refer to User, Biller, or Business
    target_type: { type: String, enum: ['User', 'Biller', 'Business'], default: 'User' },
    type: String, // 'paid', 'recharge', 'received'
    amount: Number,
    title: String,
    date: { type: Date, default: Date.now }
});
const Transaction = mongoose.model('Transaction', transactionSchema);

const bankAccountSchema = new mongoose.Schema({
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    type: String,
    bank_name: String,
    account_number: String,
    balance: Number,
    pin: String,
    status: { type: String, default: 'linked' }
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
                return res.json(allUsers.map(u => ({ id: u._id, name: u.name, initials: u.name.charAt(0).toUpperCase(), color: '#'+Math.floor(Math.random()*16777215).toString(16).padStart(6, '0'), phone: u.phone, upi_id: u.upi_id })));
            } else {
                const dummy = await Contact.find();
                return res.json(dummy.map(d => ({ id: d._id, name: d.name, initials: d.initials, color: d.color, phone: '1234567890', upi_id: 'dummy@bharat' })));
            }
        }

        const recentUsers = await User.find({ _id: { $in: contactIds } });
        res.json(recentUsers.map(u => ({ id: u._id, name: u.name, initials: u.name.charAt(0).toUpperCase(), color: '#'+Math.floor(Math.random()*16777215).toString(16).padStart(6, '0'), phone: u.phone, upi_id: u.upi_id })));
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

        const banks = await BankAccount.find({ user_id: userId });
        res.json(banks.map(b => ({ id: b._id, type: b.type, bank_name: b.bank_name, account_number: b.account_number, status: b.status })));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/banks', async (req, res) => {
    try {
        const { type, bank_name, account_number, pin } = req.body;
        const userId = getUserId(req);
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });

        const fakeBalance = Math.floor(Math.random() * 50000) + 500;
        
        const newBank = new BankAccount({
            user_id: userId, type: type || 'Bank', bank_name, account_number, balance: fakeBalance, pin, status: 'linked'
        });
        await newBank.save();
        res.json({ success: true, id: newBank._id, balance: fakeBalance });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/banks/balance', async (req, res) => {
    try {
        const { bank_id, pin } = req.body;
        const userId = getUserId(req);
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });

        const bank = await BankAccount.findOne({ _id: bank_id, user_id: userId });
        if (!bank) return res.status(404).json({ error: 'Account not found' });
        if (bank.pin !== pin) return res.status(401).json({ error: 'Incorrect UPI PIN' });

        res.json({ success: true, balance: bank.balance });
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
        if (pin && sender.pin !== pin) return res.status(401).json({ error: 'Incorrect UPI PIN' });
        if (sender.balance < amount) return res.status(400).json({ error: 'Insufficient funds' });

        let recipient = null;
        let busId = null;
        if (recipientIdentifier) {
            recipient = await User.findOne({ $or: [{ phone: recipientIdentifier }, { upi_id: recipientIdentifier }, { name: recipientIdentifier }] });
            if (!recipient) {
                const bus = await Business.findOne({ name: { $regex: new RegExp(recipientIdentifier, "i") } });
                if (bus) busId = bus._id;
                else {
                    const buses = await Business.find();
                    if (buses.length > 0) busId = buses[Math.floor(Math.random() * buses.length)]._id;
                }
            }
        }

        if (recipient && recipient._id.toString() === sender._id.toString()) {
             return res.status(400).json({ error: 'Cannot pay yourself' });
        }

        // Deduct from sender and add random reward (₹1 to ₹15)
        sender.balance -= amount;
        const earnedReward = Math.floor(Math.random() * 15) + 1;
        sender.rewards_earned += earnedReward;
        await sender.save();

        const txTitle = recipient ? `Paid to ${recipient.name}` : title;

        const senderTx = new Transaction({
            user_id: sender._id,
            target_id: recipient ? recipient._id : (busId || null),
            target_type: recipient ? 'User' : 'Business',
            type: 'paid',
            amount: amount,
            title: txTitle
        });
        await senderTx.save();

        // Add to recipient
        if (recipient) {
            recipient.balance += amount;
            await recipient.save();

            const receiverTx = new Transaction({
                user_id: recipient._id,
                target_id: sender._id,
                target_type: 'User',
                type: 'received',
                amount: amount,
                title: `Received from ${sender.name}`
            });
            await receiverTx.save();
        }

        res.json({ success: true, newBalance: sender.balance, reward: earnedReward, recipientName: recipient ? recipient.name : 'Unknown' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/recharge', async (req, res) => {
    try {
        const { amount, title, pin } = req.body;
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

        const tx = new Transaction({
            user_id: user._id,
            target_id: bId || null,
            target_type: 'Biller',
            type: 'recharge',
            amount: amount,
            title: title
        });
        await tx.save();

        res.json({ success: true, newBalance: user.balance });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`MongoDB Auth-enabled Server running on http://localhost:${PORT}`);
});
