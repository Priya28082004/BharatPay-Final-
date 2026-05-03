const mongoose = require('mongoose');

mongoose.connect('mongodb://127.0.0.1:27017/bharatpay')
    .then(async () => {
        const User = mongoose.model('User', new mongoose.Schema({
            phone: String, name: String, upi_id: String
        }));
        const Transaction = mongoose.model('Transaction', new mongoose.Schema({
            user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
            target_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        }));
        const Contact = mongoose.model('Contact', new mongoose.Schema({
            name: String, initials: String, color: String
        }));

        const users = await User.find();
        if (users.length > 0) {
            const userId = users[0]._id.toString();
            try {
                const dummy = await Contact.find();
                const res = dummy.map(d => ({
                    id: d._id,
                    name: d.name,
                    initials: d.initials,
                    color: d.color,
                    phone: '1234567890',
                    upi_id: 'dummy@bharat'
                }));
                console.log("Dummy result:", res);
            } catch (err) {
                console.error("Error:", err);
            }
        }
        process.exit(0);
    })
    .catch(err => {
        console.error(err);
        process.exit(1);
    });
