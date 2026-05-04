require('dotenv').config();
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/bharatpay';

console.log('🔍 Connecting to:', MONGODB_URI.split('@')[1] || 'Local DB');

mongoose.connect(MONGODB_URI)
    .then(async () => {
        console.log('✅ Successfully connected to MongoDB Atlas!');
        
        // Define a simple User schema to check data
        const User = mongoose.models.User || mongoose.model('User', new mongoose.Schema({
            phone: String, 
            name: String, 
            upi_id: String,
            balance: Number
        }));

        const users = await User.find();
        console.log('------------------------------------');
        if (users.length === 0) {
            console.log('ℹ️  Your database is currently EMPTY.');
            console.log('💡 Try signing up in the app to see data appear here!');
        } else {
            console.log(`👤 Found ${users.length} user(s):`);
            users.forEach((u, i) => {
                console.log(`${i+1}. Name: ${u.name} | Phone: ${u.phone} | UPI: ${u.upi_id}`);
            });
        }
        console.log('------------------------------------');
        
        process.exit(0);
    })
    .catch(err => {
        console.error('❌ CONNECTION ERROR:', err.message);
        process.exit(1);
    });
