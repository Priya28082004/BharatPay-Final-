require('dotenv').config();
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/bharatpay';

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

mongoose.connect(MONGODB_URI)
    .then(async () => {
        console.log('Connected to MongoDB.');
        const count = await User.countDocuments();
        console.log(`Total Users: ${count}`);
        const users = await User.find().limit(5);
        console.log('Last 5 Users:', users.map(u => ({ name: u.name, phone: u.phone })));
        process.exit(0);
    })
    .catch(err => {
        console.error('Error:', err);
        process.exit(1);
    });
