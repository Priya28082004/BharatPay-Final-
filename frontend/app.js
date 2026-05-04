const API_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:3000/api'
    : 'https://bharatpay-final.onrender.com/api';

const currencyFormatter = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
});

// App State
let currentUserToken = localStorage.getItem('bharatToken');
let currentUserUpi = localStorage.getItem('bharatUpi');
let currentUserName = localStorage.getItem('bharatName');

document.addEventListener('DOMContentLoaded', () => {
    if (currentUserToken) {
        unlockApp();
    }
});

// ================= AUTHENTICATION ================= //

function toggleAuth(type) {
    if (type === 'signup') {
        document.getElementById('login-form').style.display = 'none';
        document.getElementById('signup-form').style.display = 'block';
    } else {
        document.getElementById('signup-form').style.display = 'none';
        document.getElementById('login-form').style.display = 'block';
    }
}

async function loginUser() {
    console.log("DEBUG: Manual login button clicked");
    const phone = document.getElementById('login-phone').value;
    const pin = document.getElementById('login-pin').value;
    
    if(!phone || !pin) return alert('Enter phone and 4-Digit PIN');
    console.log("DEBUG: Sending login request for:", phone);

    const btn = document.querySelector('#login-form .btn-primary');
    btn.textContent = 'Logging in...';

    try {
        const res = await fetch(`${API_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone, pin })
        });
        const data = await res.json();
        
        btn.textContent = 'Log In';
        if (data.success) {
            saveSession(data.token, data.upi_id, data.name);
            unlockApp();
        } else {
            alert(data.error);
        }
    } catch (err) {
        btn.textContent = 'Log In';
        alert('Server dead. Is Node server.js running?');
    }
}

async function biometricLogin() {
    if (!window.PublicKeyCredential) {
        alert("Biometric login is not supported on this device/browser. Please use your PIN to log in.");
        return;
    }

    try {
        const challenge = new Uint8Array(32);
        window.crypto.getRandomValues(challenge);
        const userID = new Uint8Array(16);
        window.crypto.getRandomValues(userID);

        // Trigger the native OS fingerprint / Windows Hello dialog!
        await navigator.credentials.create({
            publicKey: {
                challenge: challenge,
                rp: { name: "Bharat Pay", id: window.location.hostname || "localhost" },
                user: {
                    id: userID,
                    name: "user@bharatpay.com",
                    displayName: "Bharat Pay User"
                },
                pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
                authenticatorSelection: {
                    authenticatorAttachment: "platform",
                    userVerification: "required"
                },
                timeout: 60000,
                attestation: "none"
            }
        });

        // If promise resolves, biometric scan was successful!
        if (!localStorage.getItem('bharatToken')) {
            saveSession("demo-token-123", "guest@bharatpay", "Demo User");
        }
        unlockApp();
        showToast("Biometric verification successful!");
    } catch (err) {
        console.error("Biometric Error:", err);
        if (err.name !== 'NotAllowedError') {
            alert("Biometric verification failed or was cancelled.");
        }
    }
}

async function signupUser() {
    const name = document.getElementById('signup-name').value;
    const phone = document.getElementById('signup-phone').value;
    const pin = document.getElementById('signup-pin').value;
    const bank_name = document.getElementById('signup-bank').value;
    const atm_card = document.getElementById('signup-atm').value;
    
    if(!name || !phone || !pin || !bank_name || !atm_card) return alert('All fields required');

    // Biometric Registration
    if (window.PublicKeyCredential) {
        try {
            const challenge = new Uint8Array(32);
            window.crypto.getRandomValues(challenge);
            const userID = new Uint8Array(16);
            window.crypto.getRandomValues(userID);

            await navigator.credentials.create({
                publicKey: {
                    challenge: challenge,
                    rp: { name: "Bharat Pay", id: window.location.hostname || "localhost" },
                    user: {
                        id: userID,
                        name: phone,
                        displayName: name
                    },
                    pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
                    authenticatorSelection: {
                        authenticatorAttachment: "platform",
                        userVerification: "required"
                    },
                    timeout: 60000,
                    attestation: "none"
                }
            });
        } catch (err) {
            console.error("Biometric Setup Error:", err);
            if (err.name !== 'NotAllowedError') {
                alert("Biometric security setup failed. This is required for secure payments.");
                return;
            } else {
                alert("Biometric security is mandatory to protect your account.");
                return;
            }
        }
    } else {
        // Optional: If you want to allow signup without biometrics on old devices, 
        // you could remove this alert. But for a "real" app, we keep it strict.
        alert("Warning: Your device does not support biometric security. Your account will rely only on PIN.");
    }

    const btn = document.querySelector('#signup-form .btn-primary');
    btn.textContent = 'Creating...';

    try {
        const res = await fetch(`${API_URL}/signup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, phone, pin, bank_name, atm_card })
        });
        const data = await res.json();
        btn.textContent = 'Sign Up';
        
        if (data.success) {
            saveSession(data.token, data.upi_id, name);
            unlockApp();
        } else {
            alert(data.error);
        }
    } catch (err) {
        btn.textContent = 'Sign Up';
        alert('Server dead. Is server.js running?');
    }
}

function saveSession(token, upi, name) {
    currentUserToken = token;
    currentUserUpi = upi;
    currentUserName = name;
    localStorage.setItem('bharatToken', token);
    localStorage.setItem('bharatUpi', upi);
    localStorage.setItem('bharatName', name);
}

function unlockApp() {
    const loginScreen = document.getElementById('login-screen');
    const mainApp = document.getElementById('main-app');
    
    loginScreen.classList.remove('active');
    loginScreen.classList.add('hidden');
    
    setTimeout(() => {
        mainApp.classList.add('active');
        initAppData(); // Initialize dynamic info once inside
    }, 400);
}

function logout() {
    localStorage.removeItem('bharatToken');
    localStorage.removeItem('bharatUpi');
    localStorage.removeItem('bharatName');
    window.location.reload();
}

function switchTab(tabId) {
    document.querySelectorAll('.view-content').forEach(view => view.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
    
    const view = document.getElementById(`view-${tabId}`);
    if(view) view.classList.add('active');
    const navItem = document.getElementById(`nav-${tabId}`);
    if(navItem) navItem.classList.add('active');
}


// ================= MAIN APP DATA LOGIC ================= //

function authHeaders() {
    return {
        'Content-Type': 'application/json',
        'Authorization': currentUserToken
    };
}

async function initAppData() {
    loadContacts();
    loadBanks();
    loadBillers();
    loadBusinesses();
    
    try {
        const res = await fetch(`${API_URL}/user`, { headers: authHeaders() });
        const user = await res.json();
        if(user && !user.error) {
            const nameEscaped = user.name.replace(/ /g, '+');
            document.getElementById('user-avatar-home').src = `https://ui-avatars.com/api/?name=${nameEscaped}&background=FF9933&color=fff`;
            document.getElementById('profile-avatar').src = `https://ui-avatars.com/api/?name=${nameEscaped}&background=FF9933&color=fff`;
            document.getElementById('nav-avatar-img').src = `https://ui-avatars.com/api/?name=${nameEscaped}&background=FF9933&color=fff`;
            
            document.getElementById('profile-name').textContent = user.name;
            document.getElementById('profile-upi').textContent = user.upi_id;
            document.getElementById('profile-phone').textContent = user.phone;
            document.getElementById('profile-rewards').textContent = `₹${user.rewards_earned}`;
            document.getElementById('profile-friends').textContent = user.friends_count || 0;
        }
    } catch (err) {}
}

async function loadBillers() {
    try {
        const res = await fetch(`${API_URL}/recent_billers`, { headers: authHeaders() });
        const billers = await res.json();
        const container = document.getElementById('dynamic-bills');
        if(!container) return;
        
        if (billers.length === 0) {
            container.innerHTML = '<p style="color:#5f6368; font-size:0.9rem; padding:10px 20px;">No recent bills. Recharge your mobile or pay a bill to see it here.</p>';
            return;
        }

        container.innerHTML = billers.map(b => `
            <div class="bill-badge ${b.status}" onclick="openModal('recharge', '${b.name}')" style="cursor: pointer;">
                ${b.status ? `<span class="badge-tag" style="${b.status === 'expiring' ? 'background:#FF9933;' : ''}">${b.status.charAt(0).toUpperCase() + b.status.slice(1)}</span>` : ''}
                <div class="badge-icon" style="background:${b.bg_color}; color:${b.icon_color}; ${b.status === 'overdue' ? 'border:1px solid #ccc;' : ''}; box-shadow: 0 2px 4px rgba(0,0,0,0.1);"><i class="fas ${b.icon}"></i></div>
                <span>${b.name}</span>
            </div>
        `).join('');
    } catch (err) {}
}

async function loadBusinesses() {
    try {
        const res = await fetch(`${API_URL}/recent_businesses`, { headers: authHeaders() });
        const businesses = await res.json();
        const container = document.getElementById('dynamic-businesses');
        if(!container) return;
        
        if (businesses.length === 0) {
            container.innerHTML = '<p style="color:#5f6368; font-size:0.9rem; padding:10px 20px;">No recent businesses. Pay a merchant to see them here.</p>';
            return;
        }

        container.innerHTML = businesses.map(b => `
            <div class="business-item" onclick="openModal('pay', 'Pay ${b.name}')" style="cursor: pointer;">
                <div class="bus-icon" style="background:${b.color}; ${b.name === 'More' ? 'color:#000080; border:1px solid #ccc;' : ''}; ${b.initials === 'Jio' ? 'font-size:11px;' : ''}; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                    ${b.icon_type === 'icon' ? `<i class="fas ${b.initials}"></i>` : b.initials}
                </div>
                <span>${b.name}</span>
            </div>
        `).join('') + `<div class="business-item" onclick="alert('Simulation: Explore more businesses.')" style="cursor: pointer;"><div class="bus-icon" style="background:white; color:#000080; border:1px solid #ccc; box-shadow: 0 2px 4px rgba(0,0,0,0.1);"><i class="fas fa-chevron-down"></i></div><span>More</span></div>`;
    } catch (err) {}
}

async function loadContacts() {
    try {
        const res = await fetch(`${API_URL}/recent_contacts`, { headers: authHeaders() });
        const contacts = await res.json();
        
        const container = document.getElementById('contacts-container');
        if(!container) return;
        container.innerHTML = contacts.map(c => `
            <div class="person-item card-3d" onclick="openChat(${JSON.stringify(c).replace(/"/g,'&quot;')})">
                <div class="person-avatar" style="background-color: ${c.color}">
                    ${c.initials}
                </div>
                <span>${c.name.split(' ')[0]}</span>
            </div>
        `).join('');
    } catch (err) {
        console.error('Failed to load contacts');
    }
}

async function loadBanks() {
    try {
        const res = await fetch(`${API_URL}/banks`, { headers: authHeaders() });
        const banks = await res.json();
        
        const container = document.getElementById('banks-container');
        if(!container) return;

        let html = '';
        if (!banks.error && banks.length > 0) {
            html += banks.map(b => `
                <div class="bank-item" style="border-bottom: 1px solid #f0f0f0; padding-bottom: 15px;">
                    <div class="bank-logo" style="background:#f8f9fa; color:#1a73e8; border:1px solid #e8eaed;"><i class="${b.type === 'Credit Card' ? 'far fa-credit-card' : 'fas fa-university'}"></i></div>
                    <div class="bank-details" style="flex:1;">
                        <h4 style="margin:0; font-size:1rem; color:#1f1f1f; display:inline-block; padding:2px 4px; background:#1a73e8; color:white; font-weight:600; font-size:0.8rem; border-radius:4px; margin-bottom:4px;">${b.bank_name}</h4>
                        <p style="margin:0; font-size:0.85rem; color:#1a73e8; font-weight:500;">${b.type} •••• ${b.account_number.slice(-4)}</p>
                    </div>
                    <button class="text-btn" style="background:#1a73e8; color:white; padding:5px 10px; border-radius:4px; font-weight:600; font-size:0.85rem;" onclick="openModal('balance', 'Check Balance', '${b._id}', '${b.bank_name}')">Check balance</button>
                </div>
            `).join('');
        }

        container.innerHTML = html;
    } catch (err) {}
}


// ================= MODALS & PAYMENTS ================= //

function closeModal() {
    const modal = document.getElementById('dynamic-modal');
    if(modal) modal.classList.remove('active');
}

async function processBalanceCheck(bankId, bankName) {
    const pin = document.getElementById('check-balance-pin').value;
    if(!pin) return alert("PIN is required");

    try {
        const res = await fetch(`${API_URL}/banks/balance`, {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({ bank_id: bankId, pin })
        });
        const data = await res.json();
        if(data.success) {
            document.getElementById('balance-result').innerHTML = `Balance: ${currencyFormatter.format(data.balance)}`;
        } else {
            alert(data.error);
        }
    } catch(err) {
        alert("Server error verifying PIN.");
    }
}

async function processAddBank() {
    const type = document.getElementById('add-bank-type').value;
    const bank_name = document.getElementById('add-bank-name').value;
    const account_number = document.getElementById('add-bank-acc').value;
    const pin = document.getElementById('add-bank-pin').value;

    if(!bank_name || !account_number || !pin) return alert("Fill all fields");

    try {
        const res = await fetch(`${API_URL}/banks`, {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({ type, bank_name, account_number, pin })
        });
        const data = await res.json();
        if(data.success) {
            closeModal();
            showToast(`Linked! Start Balance is ${currencyFormatter.format(data.balance)}`);
            loadBanks(); // re-render the list dynamically!
        } else {
            alert(data.error);
        }
    } catch(err) {
        alert("Error creating link");
    }
}

function openPaymentModal(recipient, type) {
    if (!recipient) return;
    const modal = document.getElementById('dynamic-modal');
    const modalTitle = document.getElementById('modal-title');
    const modalBody = document.getElementById('modal-body');
    
    modalTitle.textContent = `Paying ${recipient}`;
    modalBody.innerHTML = `
        <div class="payment-form">
            <div class="amount-wrapper">
                <span class="rupee-symbol">₹</span>
                <input type="number" class="amount-input" id="pay-amount" placeholder="0" autofocus oninput="validateAmount(this)">
            </div>
            <input type="text" class="custom-input" id="pay-note" placeholder="Add a note (optional)" style="margin-bottom:10px;">
            <input type="password" class="custom-input" id="pay-pin" placeholder="Enter Primary 4-Digit UPI PIN">
            <button class="payment-btn" id="pay-btn" onclick="processPayment('${recipient}')" disabled>Pay securely</button>
        </div>
    `;
    modal.classList.add('active');
}

function validateAmount(input) {
    const btn = document.getElementById('pay-btn');
    btn.disabled = !(input.value && parseFloat(input.value) > 0);
}

async function processPayment(recipient) {
    const amount = parseFloat(document.getElementById('pay-amount').value);
    const note = document.getElementById('pay-note').value;
    const pin = document.getElementById('pay-pin').value;
    
    if(!pin) return alert('UPI PIN is required');

    const btn = document.getElementById('pay-btn');
    btn.disabled = true;
    btn.textContent = 'Processing...';
    
    try {
        const res = await fetch(`${API_URL}/pay`, {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({ amount, pin, recipientIdentifier: recipient, title: note ? note : 'Payment' })
        });
        
        const data = await res.json();
        
        if (data.success) {
            closeModal();
            showSuccess(amount, recipient);
            // Updating balances on screen like Google Pay automatically
            loadBanks(); 
        } else {
            alert(data.error || 'Payment failed');
            btn.disabled = false;
            btn.textContent = 'Pay securely';
        }
    } catch (err) {
        alert('Server error');
        btn.disabled = false;
        btn.textContent = 'Pay securely';
    }
}

async function processRecharge() {
    const amount = parseFloat(document.getElementById('recharge-amount').value);
    const biller = document.getElementById('biller-input').value || 'Recharge';
    const pin = document.getElementById('recharge-pin').value;
    
    if(!amount || amount <= 0) return;
    if(!pin) return alert('UPI PIN is required');

    const btn = document.getElementById('pay-btn');
    btn.disabled = true;
    btn.textContent = 'Processing...';
    
    try {
        const res = await fetch(`${API_URL}/recharge`, {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({ amount, pin, title: `${biller} payment` })
        });
        
        const data = await res.json();
        
        if (data.success) {
            closeModal();
            showSuccess(amount, biller);
            loadBanks();
        } else {
            alert(data.error || 'Payment failed');
            btn.disabled = false;
        }
    } catch (err) {
        alert('Server error');
        btn.disabled = false;
    }
}

async function loadHistory(container) {
    container.innerHTML = '<p style="text-align:center; padding: 20px;">Loading...</p>';
    try {
        const res = await fetch(`${API_URL}/transactions`, { headers: authHeaders() });
        const txs = await res.json();
        
        if (txs.error) return container.innerHTML = `<p style="text-align:center; color:var(--danger); padding: 20px;">${txs.error}</p>`;
        if (txs.length === 0) return container.innerHTML = '<p style="text-align:center; color:var(--text-secondary); padding: 20px;">No transactions found.</p>';
        
        container.innerHTML = `<div class="tx-list">
            ${txs.map(tx => {
                const isPaid = tx.type !== 'received';
                const prefix = isPaid ? '-' : '+';
                const date = new Date(tx.date).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute:'2-digit' });
                return `
                    <div class="tx-item card-3d" style="box-shadow: 0 4px 10px rgba(0,0,0,0.02);">
                        <div class="tx-info">
                            <h4>${tx.title}</h4>
                            <p>${date}</p>
                        </div>
                        <div class="tx-amount ${isPaid ? 'paid' : 'received'}">
                            ${prefix}${currencyFormatter.format(tx.amount)}
                        </div>
                    </div>
                `;
            }).join('')}
        </div>`;
    } catch (err) {
        container.innerHTML = '<p style="text-align:center; color:var(--danger);">Failed to load history.</p>';
    }
}

function showSuccess(amount, recipient) {
    const screen = document.getElementById('success-screen');
    document.getElementById('success-amount').textContent = currencyFormatter.format(amount);
    document.getElementById('success-details').innerHTML = `To ${recipient}<br><span style="color:var(--text-secondary); font-size:0.85rem">Bank Connected</span>`;
    screen.classList.add('active');
}

function closeSuccess() {
    const screen = document.getElementById('success-screen');
    if(screen) screen.classList.remove('active');
}

function showToast(msg) {
    const toast = document.getElementById('toast');
    document.getElementById('toast-msg').textContent = msg;
    toast.classList.add('show');
    setTimeout(() => { toast.classList.remove('show'); }, 4000);
}

// ================= REAL CAMERA QR SCANNER ================= //
let scannerStream = null;
let scannerAnimFrame = null;

function openScanner() {
    const modal = document.getElementById('dynamic-modal');
    document.getElementById('modal-title').textContent = 'Scan & Pay';
    document.getElementById('modal-body').innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;gap:16px;padding:10px 20px 20px;">

            <!-- Camera Viewfinder -->
            <div id="qr-viewport" style="width:100%;max-width:320px;aspect-ratio:1;border-radius:20px;overflow:hidden;position:relative;background:#000;box-shadow:0 8px 30px rgba(0,0,0,0.3);">
                <video id="qr-video" autoplay playsinline muted style="width:100%;height:100%;object-fit:cover;"></video>
                <canvas id="qr-canvas" style="display:none;"></canvas>

                <!-- Scanning Overlay Frame -->
                <div style="position:absolute;inset:0;pointer-events:none;">
                    <!-- Corner brackets -->
                    <div style="position:absolute;top:20px;left:20px;width:40px;height:40px;border-top:3px solid var(--saffron);border-left:3px solid var(--saffron);border-radius:4px 0 0 0;"></div>
                    <div style="position:absolute;top:20px;right:20px;width:40px;height:40px;border-top:3px solid var(--saffron);border-right:3px solid var(--saffron);border-radius:0 4px 0 0;"></div>
                    <div style="position:absolute;bottom:20px;left:20px;width:40px;height:40px;border-bottom:3px solid var(--saffron);border-left:3px solid var(--saffron);border-radius:0 0 0 4px;"></div>
                    <div style="position:absolute;bottom:20px;right:20px;width:40px;height:40px;border-bottom:3px solid var(--saffron);border-right:3px solid var(--saffron);border-radius:0 0 4px 0;"></div>
                    <!-- Scan line animation -->
                    <div id="scan-line" style="position:absolute;left:20px;right:20px;height:2px;background:linear-gradient(90deg,transparent,var(--saffron),transparent);animation:scanLine 2s ease-in-out infinite;top:50%;"></div>
                </div>

                <!-- Status badge -->
                <div id="scan-status" style="position:absolute;bottom:14px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.6);color:#fff;font-size:0.75rem;font-weight:600;padding:5px 14px;border-radius:20px;white-space:nowrap;">
                    🔍 Scanning for QR code...
                </div>
            </div>

            <p style="color:var(--text-secondary);font-size:0.85rem;text-align:center;margin:0;">
                Point camera at any UPI QR code<br>to pay instantly
            </p>

            <!-- Camera switch button -->
            <button onclick="switchScannerCamera()" style="background:transparent;border:1px solid var(--card-border);color:var(--navy);padding:8px 20px;border-radius:20px;font-size:0.85rem;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:6px;">
                <i class="fas fa-sync-alt"></i> Switch Camera
            </button>

            <div style="width:100%;display:flex;align-items:center;gap:10px;color:var(--text-secondary);font-size:0.8rem;">
                <div style="flex:1;height:1px;background:var(--card-border);"></div>
                or enter manually
                <div style="flex:1;height:1px;background:var(--card-border);"></div>
            </div>

            <input type="text" class="custom-input" id="manual-upi" placeholder="Enter UPI ID (e.g. name@okaxis)" style="width:100%;margin:0;">
            <button class="payment-btn" style="margin-top:0;width:100%;" onclick="payManualUpi()">
                Pay via UPI ID
            </button>
        </div>`;

    modal.classList.add('active');
    startCameraScanner('environment'); // open back camera by default
}

let currentCameraFacing = 'environment';

function switchScannerCamera() {
    const status = document.getElementById('scan-status');
    if (status) status.textContent = '🔄 Switching camera...';
    
    stopCameraScanner();
    // Toggle between 'environment' (back) and 'user' (front)
    currentCameraFacing = currentCameraFacing === 'environment' ? 'user' : 'environment';
    
    // Small delay helps mobile hardware release the lens correctly
    setTimeout(() => {
        startCameraScanner(currentCameraFacing);
    }, 300);
}

async function startCameraScanner(facing = 'environment') {
    stopCameraScanner(); 

    const video = document.getElementById('qr-video');
    const status = document.getElementById('scan-status');
    if (!video) return;

    try {
        // Simplified constraints for maximum mobile compatibility
        const constraints = {
            video: { 
                facingMode: facing,
                width: { ideal: 640 },
                height: { ideal: 480 }
            }
        };
        
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        scannerStream = stream;
        video.srcObject = stream;
        video.setAttribute('playsinline', true); // Critical for iOS
        
        // Use a promise to ensure video is actually playing
        await video.play();
        scanQRFrame(); 
    } catch (err) {
        console.error('Camera error:', err);
        if (status) {
            if (err.name === 'NotAllowedError') {
                status.textContent = '⚠️ Permission denied by user';
            } else if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
                status.textContent = '⚠️ Security: HTTPS required for camera';
            } else {
                status.textContent = '⚠️ Camera error: ' + err.name;
            }
            status.style.background = 'rgba(220,38,38,0.8)';
        }
    }
}

function scanQRFrame() {
    const video = document.getElementById('qr-video');
    const canvas = document.getElementById('qr-canvas');
    if (!video || !canvas || video.readyState < 2) {
        scannerAnimFrame = requestAnimationFrame(scanQRFrame);
        return;
    }

    const ctx = canvas.getContext('2d');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    // Only run if jsQR is available
    if (typeof jsQR !== 'undefined') {
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: 'dontInvert'
        });

        if (code) {
            // QR code detected!
            stopCameraScanner();
            handleScannedQR(code.data);
            return;
        }
    }

    scannerAnimFrame = requestAnimationFrame(scanQRFrame);
}

function stopCameraScanner() {
    if (scannerAnimFrame) {
        cancelAnimationFrame(scannerAnimFrame);
        scannerAnimFrame = null;
    }
    if (scannerStream) {
        scannerStream.getTracks().forEach(track => track.stop());
        scannerStream = null;
    }
}

function handleScannedQR(data) {
    // Parse UPI QR code: upi://pay?pa=recipient@upi&pn=Name&am=100
    const status = document.getElementById('scan-status');
    let upiId = null;
    let name = null;

    try {
        if (data.startsWith('upi://')) {
            const url = new URL(data);
            upiId = url.searchParams.get('pa');
            name = url.searchParams.get('pn') || upiId;
        } else if (data.includes('@')) {
            // Raw UPI ID
            upiId = data.trim();
            name = upiId;
        }
    } catch (e) {
        upiId = data.trim();
        name = upiId;
    }

    if (upiId) {
        showToast(`✅ QR Detected: ${upiId}`);
        closeModal();
        setTimeout(() => openPaymentModal(name || upiId, 'upi', upiId), 300);
    } else {
        showToast('⚠️ Not a valid UPI QR code. Try again.');
        startCameraScanner(currentCameraFacing); // restart
    }
}

function payManualUpi() {
    const val = document.getElementById('manual-upi')?.value?.trim();
    if (!val) return showToast('⚠️ Please enter a UPI ID');
    stopCameraScanner();
    closeModal();
    setTimeout(() => openPaymentModal(val, 'upi', val), 300);
}

// Stop camera when modal closes
const _origCloseModal = typeof closeModal === 'function' ? closeModal : null;
function closeModal() {
    stopCameraScanner();
    const modal = document.getElementById('dynamic-modal');
    if (modal) modal.classList.remove('active');
}

// ================= EXTENDED MODALS ================= //
function openModal(type, title, entityId = null, entityName = '') {
    const modal = document.getElementById('dynamic-modal');
    const modalTitle = document.getElementById('modal-title');
    const modalBody = document.getElementById('modal-body');
    if (!modalTitle || !modalBody) return;
    modalTitle.textContent = title;

    if (type === 'recharge') {
        modalBody.innerHTML = `
            <div style="display:flex;flex-direction:column;gap:10px;">
                <p style="color:var(--text-secondary);font-size:0.9rem;margin-bottom:5px;">Choose operator & plan</p>
                <select class="custom-input" id="biller-input" style="padding:14px;">
                    <option value="Jio Prepaid">Jio Prepaid</option>
                    <option value="Airtel Prepaid">Airtel Prepaid</option>
                    <option value="Vi Prepaid">Vi Prepaid</option>
                    <option value="BSNL">BSNL</option>
                </select>
                <input type="number" class="custom-input" id="recharge-amount" placeholder="Amount (₹)" oninput="validateRechargeBtn(this)">
                <input type="password" class="custom-input" id="recharge-pin" placeholder="Enter 4-Digit UPI PIN">
                <button class="payment-btn" id="pay-btn" onclick="processRecharge()" disabled>Recharge Now</button>
            </div>`;
        modal.classList.add('active');
    } else if (type === 'bank') {
        modalBody.innerHTML = `
            <div style="display:flex;flex-direction:column;gap:10px;">
                <p style="color:var(--text-secondary);font-size:0.9rem;">Transfer to bank account via NEFT/IMPS</p>
                <input type="text" class="custom-input" id="bank-ifsc" placeholder="IFSC Code">
                <input type="number" class="custom-input" id="bank-accno" placeholder="Account Number">
                <input type="text" class="custom-input" id="bank-beneficiary" placeholder="Beneficiary Name">
                <input type="number" class="custom-input" id="bank-amt" placeholder="Amount (₹)" oninput="validateBankBtn(this)">
                <input type="password" class="custom-input" id="bank-pin" placeholder="Enter 4-Digit UPI PIN">
                <button class="payment-btn" id="pay-btn" onclick="processBankTransfer()" disabled>Transfer Money</button>
            </div>`;
        modal.classList.add('active');
    } else if (type === 'nfc') {
        modalBody.innerHTML = `
            <div style="display:flex;flex-direction:column;align-items:center;padding:20px;gap:15px;">
                <div style="width:100px;height:100px;border-radius:50%;background:linear-gradient(135deg,var(--saffron),var(--green));display:flex;justify-content:center;align-items:center;animation:pulse 1.5s infinite;">
                    <i class="fas fa-wifi" style="font-size:2.5rem;color:white;transform:rotate(90deg);"></i>
                </div>
                <style>@keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.08)}}</style>
                <h3 style="color:var(--navy);font-size:1.2rem;">Tap & Pay Ready</h3>
                <p style="color:var(--text-secondary);text-align:center;font-size:0.9rem;">Hold your phone near any NFC-enabled terminal to pay contactlessly.</p>
                <div style="background:#f8faf9;border-radius:16px;padding:15px;width:100%;border:1px solid var(--card-border);">
                    <p style="font-size:0.85rem;color:var(--text-secondary);">Default card: <strong style="color:var(--navy);">Bharat UPI</strong></p>
                </div>
            </div>`;
        modal.classList.add('active');
    } else if (type === 'upi') {
        modalBody.innerHTML = `
            <div style="display:flex;flex-direction:column;align-items:center;padding:20px;gap:15px;">
                <div style="width:80px;height:80px;border-radius:50%;background:linear-gradient(135deg,#FF9933,#138808);display:flex;justify-content:center;align-items:center;">
                    <i class="fas fa-rocket" style="font-size:2rem;color:white;"></i>
                </div>
                <h3 style="color:var(--navy);">UPI Lite</h3>
                <p style="color:var(--text-secondary);text-align:center;font-size:0.9rem;">Pay up to ₹500 without entering PIN. Fast & secure small payments.</p>
                <div style="background:#fff8e1;border-radius:16px;padding:15px;width:100%;border:1px solid #ffe082;">
                    <p style="font-size:0.9rem;color:#b45309;font-weight:600;">UPI Lite Balance: ₹0.00</p>
                    <p style="font-size:0.8rem;color:#b45309;margin-top:4px;">Add money to activate</p>
                </div>
                <input type="number" class="custom-input" placeholder="Add money to UPI Lite (₹)" style="width:100%;">
                <button class="payment-btn" style="width:100%;margin-top:0;" onclick="showToast('UPI Lite activated! ₹200 added.');closeModal();">Activate UPI Lite</button>
            </div>`;
        modal.classList.add('active');
    } else if (type === 'promo') {
        let details = '';
        if (title === 'Flex by Bharat Bank') {
            details = 'Get a credit line up to ₹50,000 to use anywhere UPI is accepted. No annual fees for the first year!';
        } else if (title === 'Personal Loan') {
            details = 'Instant personal loan up to ₹10 Lakhs. Zero paperwork, 100% digital process with flexible EMIs.';
        } else if (title === 'Pocket Money') {
            details = 'Manage recurring allowances or request funds from parents instantly. Keep track of daily pocket money effortlessly.';
        }
        modalBody.innerHTML = `
            <div style="display:flex;flex-direction:column;align-items:center;padding:20px;gap:15px;text-align:center;">
                <div style="width:80px;height:80px;border-radius:50%;background:#e8f0fe;display:flex;justify-content:center;align-items:center;">
                    <i class="fas fa-star" style="font-size:2.5rem;color:#1a73e8;"></i>
                </div>
                <h3 style="color:var(--navy);font-size:1.4rem;">${title}</h3>
                <p style="color:var(--text-secondary);font-size:0.95rem;line-height:1.5;">${details}</p>
                <div style="background:#f8f9fa;border-radius:12px;padding:15px;width:100%;border:1px solid #e0e0e0;margin-top:10px;">
                    <p style="font-size:0.85rem;color:var(--navy);font-weight:600;">Exclusive pre-approved offer for you</p>
                </div>
                <button class="payment-btn" style="width:100%;" onclick="showToast('Application started for ${title}');closeModal();">Continue</button>
            </div>`;
        modal.classList.add('active');
    } else if (type === 'bills') {
        modalBody.innerHTML = `
            <div style="display:flex;flex-direction:column;gap:12px;">
                <p style="color:var(--text-secondary);font-size:0.9rem;">Pay your ${entityName} bill</p>
                <input type="text" class="custom-input" id="bill-account" placeholder="Account / Consumer Number">
                <input type="number" class="custom-input" id="bill-amount" placeholder="Amount (₹)" oninput="validateBillBtn(this)">
                <input type="password" class="custom-input" id="bill-pin" placeholder="Enter 4-Digit UPI PIN">
                <button class="payment-btn" id="pay-btn" onclick="processBillPayment('${entityName}')" disabled>Pay Bill</button>
            </div>`;
        modal.classList.add('active');
    } else {
        // delegate to original logic for balance, add_bank, contacts, number, history, qr
        const modal2 = document.getElementById('dynamic-modal');
        modalTitle.textContent = title;
        if (type === 'balance') {
            modalBody.innerHTML = `
                <p style="text-align:center;color:var(--text-secondary);margin-bottom:15px;">Check balance for ${entityName}</p>
                <input type="password" class="custom-input" id="check-balance-pin" placeholder="Enter 4-Digit UPI PIN">
                <button class="payment-btn" onclick="processBalanceCheck(${entityId},'${entityName}')">Check</button>
                <div id="balance-result" style="text-align:center;font-size:1.5rem;color:var(--navy);font-weight:700;margin-top:20px;"></div>`;
        } else if (type === 'add_bank') {
            modalBody.innerHTML = `
                <select class="custom-input" id="add-bank-type" style="padding:15px;">
                    <option value="Savings Bank">Savings Bank Account</option>
                    <option value="Credit Card">Credit Card</option>
                    <option value="Debit Card">Debit Card</option>
                </select>
                <input type="text" class="custom-input" id="add-bank-name" placeholder="Bank/Card Provider Name (e.g. HDFC)">
                <input type="number" class="custom-input" id="add-bank-acc" placeholder="Account / Card Number">
                <input type="password" class="custom-input" id="add-bank-pin" placeholder="Set a 4-Digit UPI PIN">
                <button class="payment-btn" onclick="processAddBank()">Link Payment Method</button>`;
        } else if (type === 'contacts') {
            const hasContactPicker = ('contacts' in navigator && 'ContactsManager' in window);
            modalBody.innerHTML = `
                <div style="display:flex;flex-direction:column;gap:14px;">
                    ${hasContactPicker ? `
                    <button class="payment-btn" style="margin-top:0;background:linear-gradient(135deg,var(--navy),#1a237e);" onclick="pickPhoneContact()">
                        <i class="fas fa-address-book" style="margin-right:8px;"></i> Pick from Phone Contacts
                    </button>
                    <div style="display:flex;align-items:center;gap:10px;color:var(--text-secondary);font-size:0.8rem;">
                        <div style="flex:1;height:1px;background:var(--card-border);"></div>
                        or enter manually
                        <div style="flex:1;height:1px;background:var(--card-border);"></div>
                    </div>
                    ` : ''}
                    <p style="margin:0;color:var(--text-secondary);font-size:0.9rem;">Enter name, phone number, or UPI ID:</p>
                    <input type="text" class="custom-input" id="contact-input" placeholder="Name, phone or UPI ID" onkeypress="if(event.key==='Enter') openPaymentModal(this.value,'contact')">
                    <button class="payment-btn" style="margin-top:0;" onclick="openPaymentModal(document.getElementById('contact-input').value,'contact')">Continue</button>
                </div>`;
        } else if (type === 'number') {
            modalBody.innerHTML = `
                <input type="number" class="custom-input" id="number-input" placeholder="Enter mobile number" onkeypress="if(event.key==='Enter') openPaymentModal(this.value,'number')">
                <button class="payment-btn" onclick="openPaymentModal(document.getElementById('number-input').value,'number')">Pay</button>`;
        } else if (type === 'history') {
            loadHistory(modalBody);
        } else if (type === 'qr') {
            modalBody.innerHTML = `
                <div style="display:flex;flex-direction:column;align-items:center;padding:20px;">
                    <p style="color:var(--text-secondary);margin-bottom:20px;">Scan to pay me</p>
                    <div style="background:white;padding:20px;border-radius:20px;box-shadow:0 10px 30px rgba(0,0,0,0.1);">
                        <img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=upi://pay?pa=${encodeURIComponent(currentUserUpi||'user@bharat')}&pn=${encodeURIComponent(currentUserName||'User')}&cu=INR" alt="QR Code">
                    </div>
                    <p style="margin-top:20px;font-weight:700;color:var(--navy);font-size:1.2rem;">${currentUserUpi || 'user@bharat'}</p>
                    <p style="color:var(--text-secondary);font-size:0.9rem;">${currentUserName || 'User'}</p>
                </div>`;
        } else if (type === 'rewards') {
            const rewardsAmt = document.getElementById('profile-rewards')?.textContent || '₹0';
            modalBody.innerHTML = `
                <div style="display:flex;flex-direction:column;align-items:center;padding:20px;gap:15px;">
                    <div style="width:80px;height:80px;border-radius:50%;background:linear-gradient(135deg,#fbbc04,#f59f00);display:flex;justify-content:center;align-items:center;">
                        <i class="fas fa-trophy" style="font-size:2.5rem;color:white;"></i>
                    </div>
                    <h2 style="color:var(--navy);font-size:2rem;font-weight:700;">${rewardsAmt}</h2>
                    <p style="color:var(--text-secondary);text-align:center;">Rewards earned from transactions</p>
                    <div style="background:#fff8e1;border-radius:16px;padding:15px;width:100%;border:1px solid #ffe082;">
                        <p style="font-size:0.9rem;color:#b45309;font-weight:600;">🎉 Earn ₹1–₹15 cashback on every payment!</p>
                        <p style="font-size:0.8rem;color:#b45309;margin-top:4px;">Rewards are auto-credited after each successful transaction.</p>
                    </div>
                    <button class="payment-btn" style="width:100%;margin-top:0;" onclick="closeModal()">Close</button>
                </div>`;
        } else if (type === 'refer') {
            const friendCount = document.getElementById('profile-friends')?.textContent || '0';
            modalBody.innerHTML = `
                <div style="display:flex;flex-direction:column;align-items:center;padding:20px;gap:15px;">
                    <div style="width:80px;height:80px;border-radius:50%;background:linear-gradient(135deg,#1a73e8,#0d47a1);display:flex;justify-content:center;align-items:center;">
                        <i class="fas fa-user-friends" style="font-size:2rem;color:white;"></i>
                    </div>
                    <h2 style="color:var(--navy);">Invite Friends</h2>
                    <p style="color:var(--text-secondary);text-align:center;">Invite your friends to join Bharat Pay and earn ₹601 for every successful referral!</p>
                    <div style="background:#e8f0fe;border-radius:16px;padding:15px;width:100%;border:1px solid #c5d9f8;text-align:center;">
                        <p style="font-size:0.8rem;color:#1a73e8;margin-bottom:8px;">Your referral code</p>
                        <p style="font-size:1.4rem;font-weight:700;color:var(--navy);letter-spacing:4px;">BHARAT${currentUserUpi?.slice(0,4).toUpperCase() || 'PAY'}</p>
                    </div>
                    <p style="color:var(--text-secondary);font-size:0.85rem;">Friends invited: <strong>${friendCount}</strong></p>
                    <button class="payment-btn" style="width:100%;margin-top:0;" onclick="showToast('Referral link copied!');closeModal();">Share Referral Link <i class="fas fa-share-alt"></i></button>
                </div>`;
        } else if (type === 'payment_methods') {
            modalBody.innerHTML = `
                <div style="display:flex;flex-direction:column;gap:12px;padding:10px 0;">
                    <p style="color:var(--text-secondary);font-size:0.9rem;text-align:center;">Complete all 3 steps to unlock all features</p>
                    <div style="background:#e8f5e9;border-radius:12px;padding:15px;display:flex;align-items:center;gap:12px;border:1px solid #a5d6a7;">
                        <i class="fas fa-check-circle" style="color:#34a853;font-size:1.5rem;"></i>
                        <div><h4 style="margin:0;color:var(--navy);">Bank account</h4><p style="margin:0;font-size:0.8rem;color:#34a853;">Linked ✓</p></div>
                    </div>
                    <div style="background:#e8f0fe;border-radius:12px;padding:15px;display:flex;align-items:center;gap:12px;border:1px solid #c5d9f8;cursor:pointer;" onclick="closeModal();openModal('rupay','RuPay Credit Card')">
                        <i class="far fa-credit-card" style="color:#1a73e8;font-size:1.5rem;"></i>
                        <div style="flex:1"><h4 style="margin:0;color:var(--navy);">RuPay credit card</h4><p style="margin:0;font-size:0.8rem;color:#1a73e8;">Set up → Pay with UPI</p></div>
                        <i class="fas fa-chevron-right" style="color:#1a73e8;"></i>
                    </div>
                    <div style="background:#e8f0fe;border-radius:12px;padding:15px;display:flex;align-items:center;gap:12px;border:1px solid #c5d9f8;cursor:pointer;" onclick="closeModal();openModal('upi_lite','UPI Lite')">
                        <i class="fas fa-bolt" style="color:#1a73e8;font-size:1.5rem;"></i>
                        <div style="flex:1"><h4 style="margin:0;color:var(--navy);">UPI Lite</h4><p style="margin:0;font-size:0.8rem;color:#1a73e8;">Set up → Pay PIN-free</p></div>
                        <i class="fas fa-chevron-right" style="color:#1a73e8;"></i>
                    </div>
                </div>`;
        } else if (type === 'bank_accounts') {
            loadHistory(modalBody);
            modalBody.innerHTML = `<p style="text-align:center;color:var(--text-secondary);padding:20px;">Loading bank accounts...</p>`;
            loadBanks();
            modalBody.innerHTML = `<p style="color:var(--text-secondary);text-align:center;padding:20px;">Go to the <strong>Money</strong> tab to view and manage your linked bank accounts.</p><button class="payment-btn" onclick="closeModal();switchTab('money')" style="width:100%;margin-top:0;">Open Money Tab</button>`;
        } else if (type === 'rupay') {
            modalBody.innerHTML = `
                <div style="display:flex;flex-direction:column;align-items:center;padding:20px;gap:15px;">
                    <div style="width:80px;height:80px;border-radius:50%;background:linear-gradient(135deg,#1a73e8,var(--navy));display:flex;justify-content:center;align-items:center;">
                        <i class="far fa-credit-card" style="font-size:2rem;color:white;"></i>
                    </div>
                    <h3 style="color:var(--navy);">Link RuPay Credit Card</h3>
                    <p style="color:var(--text-secondary);text-align:center;font-size:0.9rem;">Link your RuPay credit card to pay via UPI without sharing card details.</p>
                    <input type="number" class="custom-input" placeholder="16-Digit Card Number" style="width:100%;">
                    <input type="text" class="custom-input" placeholder="Card Holder Name" style="width:100%;">
                    <input type="password" class="custom-input" placeholder="Set UPI PIN" style="width:100%;">
                    <button class="payment-btn" style="width:100%;margin-top:0;" onclick="showToast('RuPay card linked successfully!');closeModal();">Link Card</button>
                </div>`;
        } else if (type === 'upi_lite') {
            modalBody.innerHTML = `
                <div style="display:flex;flex-direction:column;align-items:center;padding:20px;gap:15px;">
                    <div style="width:80px;height:80px;border-radius:50%;background:linear-gradient(135deg,#FF9933,#138808);display:flex;justify-content:center;align-items:center;">
                        <i class="fas fa-bolt" style="font-size:2.5rem;color:white;"></i>
                    </div>
                    <h3 style="color:var(--navy);">Activate UPI Lite</h3>
                    <p style="color:var(--text-secondary);text-align:center;font-size:0.9rem;">Pay up to ₹500 without entering PIN. Fast & secure for small purchases.</p>
                    <div style="background:#fff8e1;border-radius:16px;padding:15px;width:100%;border:1px solid #ffe082;text-align:center;">
                        <p style="font-size:0.9rem;color:#b45309;font-weight:600;">UPI Lite Balance: ₹0</p>
                    </div>
                    <input type="number" class="custom-input" placeholder="Add money to UPI Lite (₹)" style="width:100%;">
                    <button class="payment-btn" style="width:100%;margin-top:0;" onclick="showToast('UPI Lite activated! Balance added.');closeModal();">Activate UPI Lite</button>
                </div>`;
        } else if (type === 'autopay') {
            modalBody.innerHTML = `
                <div style="display:flex;flex-direction:column;align-items:center;padding:20px;gap:15px;">
                    <div style="width:70px;height:70px;border-radius:50%;background:#e8f0fe;display:flex;justify-content:center;align-items:center;">
                        <i class="fas fa-sync-alt" style="font-size:2rem;color:#1a73e8;"></i>
                    </div>
                    <h3 style="color:var(--navy);">Autopay</h3>
                    <div style="background:#f8f9fa;border-radius:16px;padding:20px;width:100%;text-align:center;border:1px solid #e0e0e0;">
                        <i class="fas fa-check-circle" style="font-size:2rem;color:#34a853;margin-bottom:10px;"></i>
                        <p style="color:var(--text-secondary);font-size:0.9rem;">No pending autopay requests</p>
                    </div>
                    <p style="color:var(--text-secondary);font-size:0.8rem;text-align:center;">Autopay lets services automatically collect recurring payments from your UPI.</p>
                    <button class="payment-btn" style="width:100%;margin-top:0;background:#f8f9fa;color:var(--navy);border:1px solid #e0e0e0;" onclick="closeModal()">Close</button>
                </div>`;
        } else if (type === 'upi_circle') {
            modalBody.innerHTML = `
                <div style="display:flex;flex-direction:column;align-items:center;padding:20px;gap:15px;">
                    <div style="width:80px;height:80px;border-radius:50%;background:linear-gradient(135deg,#34a853,#137333);display:flex;justify-content:center;align-items:center;">
                        <i class="fas fa-hands-helping" style="font-size:2rem;color:white;"></i>
                    </div>
                    <h3 style="color:var(--navy);">UPI Circle <span style="background:var(--navy);color:white;font-size:0.65rem;padding:2px 7px;border-radius:10px;vertical-align:middle;margin-left:4px;">New</span></h3>
                    <p style="color:var(--text-secondary);text-align:center;font-size:0.9rem;">Help people you trust — like family members — make UPI payments directly from your account.</p>
                    <div style="background:#e8f5e9;border-radius:12px;padding:15px;width:100%;border:1px solid #a5d6a7;">
                        <p style="font-size:0.85rem;color:#137333;font-weight:600;">✅ You are in full control. Set spending limits and revoke access anytime.</p>
                    </div>
                    <input type="number" class="custom-input" placeholder="Delegate's Mobile Number" style="width:100%;">
                    <button class="payment-btn" style="width:100%;margin-top:0;" onclick="showToast('UPI Circle invite sent!');closeModal();">Send Invite</button>
                </div>`;
        } else if (type === 'manage_account') {
            const name = document.getElementById('profile-name')?.textContent || 'User';
            const phone = document.getElementById('profile-phone')?.textContent || '';
            const upi = document.getElementById('profile-upi')?.textContent || '';
            modalBody.innerHTML = `
                <div style="display:flex;flex-direction:column;gap:15px;padding:10px 0;">
                    <div style="display:flex;align-items:center;gap:15px;background:#f8f9fa;border-radius:16px;padding:15px;">
                        <img src="https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=FF9933&color=fff" style="width:60px;height:60px;border-radius:50%;" alt="Avatar">
                        <div>
                            <h3 style="margin:0;color:var(--navy);">${name}</h3>
                            <p style="margin:0;color:var(--text-secondary);font-size:0.85rem;">${phone}</p>
                        </div>
                    </div>
                    <div style="background:white;border-radius:12px;border:1px solid #e0e0e0;overflow:hidden;">
                        <div style="padding:15px;border-bottom:1px solid #f0f0f0;"><p style="margin:0;font-size:0.75rem;color:#9aa0a6;">UPI ID</p><p style="margin:4px 0 0;font-weight:600;color:var(--navy);">${upi}</p></div>
                        <div style="padding:15px;border-bottom:1px solid #f0f0f0;"><p style="margin:0;font-size:0.75rem;color:#9aa0a6;">Mobile Number</p><p style="margin:4px 0 0;font-weight:600;color:var(--navy);">${phone}</p></div>
                        <div style="padding:15px;"><p style="margin:0;font-size:0.75rem;color:#9aa0a6;">Account Type</p><p style="margin:4px 0 0;font-weight:600;color:var(--navy);">Personal UPI Account</p></div>
                    </div>
                    <button class="payment-btn" style="width:100%;margin-top:0;background:#f8f9fa;color:#d93025;border:1px solid #fde8e8;" onclick="closeModal();logout()"><i class="fas fa-sign-out-alt"></i> Log Out</button>
                </div>`;
        } else if (type === 'help') {
            modalBody.innerHTML = `
                <div style="display:flex;flex-direction:column;gap:12px;padding:10px 0;">
                    <p style="color:var(--text-secondary);font-size:0.9rem;text-align:center;">How can we help you today?</p>
                    <div style="background:#f8f9fa;border-radius:12px;overflow:hidden;border:1px solid #e0e0e0;">
                        <div style="padding:15px;border-bottom:1px solid #f0f0f0;cursor:pointer;" onclick="showToast('Support team will contact you shortly.')"><p style="margin:0;font-weight:500;color:var(--navy);">🔒 Payment not completed</p><p style="margin:2px 0 0;font-size:0.8rem;color:var(--text-secondary);">Get help with a failed transaction</p></div>
                        <div style="padding:15px;border-bottom:1px solid #f0f0f0;cursor:pointer;" onclick="showToast('Your account is secure. No issues found.')"><p style="margin:0;font-weight:500;color:var(--navy);">🛡️ Account security issues</p><p style="margin:2px 0 0;font-size:0.8rem;color:var(--text-secondary);">Recover or secure your account</p></div>
                        <div style="padding:15px;cursor:pointer;" onclick="showToast('Refund request submitted successfully!')"><p style="margin:0;font-weight:500;color:var(--navy);">↩️ Request a refund</p><p style="margin:2px 0 0;font-size:0.8rem;color:var(--text-secondary);">For incorrect or duplicate payments</p></div>
                    </div>
                    <div style="background:#e8f0fe;border-radius:12px;padding:15px;text-align:center;">
                        <p style="color:#1a73e8;font-weight:600;font-size:0.9rem;">📞 Customer Care: 1800-XXX-XXXX</p>
                        <p style="color:#5f6368;font-size:0.8rem;margin-top:4px;">Available 24/7 — Toll Free</p>
                    </div>
                </div>`;
        } else if (type === 'language') {
            const langs = ['English','हिंदी (Hindi)','বাংলা (Bengali)','தமிழ் (Tamil)','తెలుగు (Telugu)','मराठी (Marathi)','ਪੰਜਾਬੀ (Punjabi)','ગુજરાતી (Gujarati)','ಕನ್ನಡ (Kannada)','മലയാളം (Malayalam)'];
            modalBody.innerHTML = `
                <div style="display:flex;flex-direction:column;gap:8px;padding:5px 0;">
                    ${langs.map((l,i) => `
                        <div style="padding:14px 15px;border-radius:10px;cursor:pointer;background:${i===0?'#e8f0fe':'#f8f9fa'};border:${i===0?'2px solid #1a73e8':'1px solid #e0e0e0'};display:flex;align-items:center;justify-content:space-between;" onclick="document.getElementById('current-language').textContent='${l.split(' ')[0]}';showToast('Language changed to ${l.split(' ')[0]}');closeModal();">
                            <span style="font-weight:${i===0?'600':'400'};color:${i===0?'#1a73e8':'var(--navy)'};">${l}</span>
                            ${i===0?'<i class="fas fa-check" style="color:#1a73e8;"></i>':''}
                        </div>`).join('')}
                </div>`;
        }
        modal2.classList.add('active');
    }
}

function validateRechargeBtn(input) {
    const btn = document.getElementById('pay-btn');
    if(btn) btn.disabled = !(input.value && parseFloat(input.value) > 0);
}
function validateBankBtn(input) {
    const btn = document.getElementById('pay-btn');
    if(btn) btn.disabled = !(input.value && parseFloat(input.value) > 0);
}
function validateBillBtn(input) {
    const btn = document.getElementById('pay-btn');
    if(btn) btn.disabled = !(input.value && parseFloat(input.value) > 0);
}

async function processBankTransfer() {
    const beneficiary = document.getElementById('bank-beneficiary').value || 'Bank Transfer';
    const amount = parseFloat(document.getElementById('bank-amt').value);
    const pin = document.getElementById('bank-pin').value;
    if(!pin) return alert('UPI PIN required');
    if(!amount || amount <= 0) return;
    const btn = document.getElementById('pay-btn');
    btn.disabled = true; btn.textContent = 'Processing...';
    try {
        const res = await fetch(`${API_URL}/pay`, { method:'POST', headers: authHeaders(), body: JSON.stringify({ amount, pin, title: `Bank Transfer to ${beneficiary}` }) });
        const data = await res.json();
        if(data.success) { closeModal(); showSuccess(amount, beneficiary); loadBanks(); }
        else { alert(data.error || 'Transfer failed'); btn.disabled = false; btn.textContent = 'Transfer Money'; }
    } catch(e) { alert('Server error'); btn.disabled = false; btn.textContent = 'Transfer Money'; }
}

async function processBillPayment(billName) {
    const amount = parseFloat(document.getElementById('bill-amount').value);
    const pin = document.getElementById('bill-pin').value;
    if(!pin) return alert('UPI PIN required');
    if(!amount || amount <= 0) return;
    const btn = document.getElementById('pay-btn');
    btn.disabled = true; btn.textContent = 'Processing...';
    try {
        const res = await fetch(`${API_URL}/pay`, { method:'POST', headers: authHeaders(), body: JSON.stringify({ amount, pin, title: `${billName} Bill Payment` }) });
        const data = await res.json();
        if(data.success) { closeModal(); showSuccess(amount, billName); loadBanks(); }
        else { alert(data.error || 'Payment failed'); btn.disabled = false; btn.textContent = 'Pay Bill'; }
    } catch(e) { alert('Server error'); btn.disabled = false; btn.textContent = 'Pay Bill'; }
}

// ================= CHAT SCREEN ================= //
let activeChatContact = null;

function openChat(contact) {
    activeChatContact = contact;
    const screen = document.getElementById('chat-screen');
    document.getElementById('chat-title').textContent = contact.name;
    const avatar = document.getElementById('chat-avatar');
    avatar.style.background = contact.color || '#FF9933';
    avatar.textContent = contact.initials || contact.name[0];
    document.getElementById('chat-body').innerHTML = `
        <div style="text-align:center;color:var(--text-secondary);font-size:0.75rem;padding:8px;background:rgba(255,255,255,0.7);border-radius:12px;align-self:center;margin-bottom:5px;display:flex;align-items:center;gap:5px;box-shadow:0 1px 2px rgba(0,0,0,0.05);">
            <i class="fas fa-lock" style="color:#fbbc04;"></i> Payments are 100% secure
        </div>
        <div style="text-align:center;color:var(--text-secondary);font-size:0.75rem;padding:5px;">Today</div>
        <div style="align-self:center;background:#e8f0fe;padding:12px 20px;border-radius:20px;font-size:0.95rem;color:#1a73e8;max-width:85%;text-align:center;box-shadow:0 2px 5px rgba(0,0,0,0.05);margin-top:10px;">
            👋 Say hi to ${contact.name.split(' ')[0]}! Tap <strong>Pay</strong> or <strong>Request</strong> below to get started.
        </div>`;
    screen.style.transform = 'translateX(0)';
}

function closeChat() {
    const screen = document.getElementById('chat-screen');
    screen.style.transform = 'translateX(100%)';
    activeChatContact = null;
}

function startPaymentFromChat() {
    if (!activeChatContact) return;
    closeChat();
    openPaymentModal(activeChatContact.name, 'contact');
}
