const RENDER_BACKEND_URL = 'https://bharatpay-final-4.onrender.com';
const API_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? '/api'
    : `${RENDER_BACKEND_URL}/api`;

const currencyFormatter = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
});

// App State
let currentUserToken = localStorage.getItem('bharatToken');
let currentUserUpi = localStorage.getItem('bharatUpi');
let currentUserName = localStorage.getItem('bharatName');
let currentUserPhoto = localStorage.getItem('bharatPhoto') || '';

document.addEventListener('DOMContentLoaded', () => {
    initTheme();
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
        showToast("Biometric not supported. Use PIN.");
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
                rp: { name: "Arya Pay", id: window.location.hostname || "localhost" },
                user: {
                    id: userID,
                    name: "user@aryapay.com",
                    displayName: "Arya Pay User"
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
            saveSession("demo-token-123", "guest@aryapay", "Demo User");
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

    // Biometric Registration (Optional)
    if (window.PublicKeyCredential) {
        try {
            const challenge = new Uint8Array(32);
            window.crypto.getRandomValues(challenge);
            const userID = new Uint8Array(16);
            window.crypto.getRandomValues(userID);

            await navigator.credentials.create({
                publicKey: {
                    challenge: challenge,
                    rp: { name: "Arya Pay", id: window.location.hostname || "localhost" },
                    user: { id: userID, name: phone, displayName: name },
                    pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
                    authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required" },
                    timeout: 60000,
                    attestation: "none"
                }
            });
            showToast("Biometric security enabled! ✅");
        } catch (err) {
            console.log("Biometric skipped or not supported.");
            // We just proceed without blocking the user
        }
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

function saveSession(token, upi, name, photo = '') {
    currentUserToken = token;
    currentUserUpi = upi;
    currentUserName = name;
    currentUserPhoto = photo;
    localStorage.setItem('bharatToken', token);
    localStorage.setItem('bharatUpi', upi);
    localStorage.setItem('bharatName', name);
    localStorage.setItem('bharatPhoto', photo);
}

function unlockApp() {
    const loginScreen = document.getElementById('login-screen');
    const mainApp = document.getElementById('main-app');
    
    loginScreen.classList.remove('active');
    loginScreen.classList.add('hidden');
    
    setTimeout(() => {
        mainApp.classList.add('active');
        initAppData(); // Initialize dynamic info once inside
        startEventSource(); // Start SSE events for real-time payments
    }, 400);
}

function logout() {
    localStorage.removeItem('bharatToken');
    localStorage.removeItem('bharatUpi');
    localStorage.removeItem('bharatName');
    localStorage.removeItem('bharatPhoto');
    if (window.eventSource) {
        window.eventSource.close();
    }
    window.location.reload();
}

function startEventSource() {
    if (!currentUserToken) return;
    if (window.eventSource) {
        window.eventSource.close();
    }

    // Connect to Server-Sent Events endpoint
    window.eventSource = new EventSource(`${API_URL}/events?token=${currentUserToken}`);

    window.eventSource.onmessage = function(event) {
        try {
            const data = JSON.parse(event.data);
            if (data.type === 'PAYMENT_RECEIVED') {
                // Show a nice in-app notification and update balance
                showToast(`🎉 Received ₹${data.amount} from ${data.senderName}!`);
                
                // Update balance and refresh data
                loadBanks();
                initAppData();
            }
        } catch (err) {
            console.error("Error parsing event data:", err);
        }
    };

    window.eventSource.onerror = function(err) {
        console.error("EventSource failed:", err);
    };
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
            const avatarUrl = user.profile_photo || `https://ui-avatars.com/api/?name=${nameEscaped}&background=FF9933&color=fff`;
            
            document.getElementById('user-avatar-home').src = avatarUrl;
            document.getElementById('profile-avatar').src = avatarUrl;
            document.getElementById('nav-avatar-img').src = avatarUrl;
            
            document.getElementById('profile-name').textContent = user.name;
            document.getElementById('profile-upi').textContent = user.upi_id;
            document.getElementById('profile-phone').textContent = user.phone;
            document.getElementById('profile-rewards').textContent = `₹${user.rewards_earned}`;
            document.getElementById('profile-friends').textContent = user.friends_count || 0;
            
            // Save details to local session
            saveSession(currentUserToken, user.upi_id, user.name, user.profile_photo);
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
        container.innerHTML = contacts.map(c => {
            const avatarHtml = c.profile_photo 
                ? `<img src="${c.profile_photo}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`
                : c.initials;
            return `
                <div class="person-item card-3d" onclick="openChat(${JSON.stringify(c).replace(/"/g,'&quot;')})">
                    <div class="person-avatar" style="background-color: ${c.profile_photo ? 'transparent' : c.color}; display:flex; align-items:center; justify-content:center; overflow:hidden;">
                        ${avatarHtml}
                    </div>
                    <span>${c.name.split(' ')[0]}</span>
                </div>
            `;
        }).join('');
    } catch (err) {
        console.error('Failed to load contacts');
    }
}

let currentPaymentTarget = null;

async function loadBanks() {
    try {
        const res = await fetch(`${API_URL}/banks`, { headers: authHeaders() });
        const banks = await res.json();
        
        // Update account count badge on 'You' tab
        const pmCount = document.getElementById('pm-bank-count');
        if (pmCount && Array.isArray(banks)) {
            pmCount.textContent = `${banks.length} account${banks.length === 1 ? '' : 's'}`;
        }

        const container = document.getElementById('banks-container');
        if(!container) return;

        let html = '';
        if (Array.isArray(banks) && banks.length > 0) {
            html += banks.map(b => {
                const emblem = getBankEmblem(b.bank_name);
                const bankId = b.id || b._id;
                const maskedAcc = b.account_number ? b.account_number.slice(-4) : '••••';
                return `
                    <div class="bank-item" style="border-bottom: 1px solid #f0f0f0; padding-bottom: 15px;">
                        <div class="bank-logo" style="background:#f8f9fa; color:#1a73e8; border:1px solid #e8eaed;"><i class="${b.type === 'Credit Card' ? 'far fa-credit-card' : emblem.icon}"></i></div>
                        <div class="bank-details" style="flex:1;">
                            <h4 style="margin:0; font-size:1rem; color:#1f1f1f; display:inline-block; padding:2px 6px; background:#1a73e8; color:white; font-weight:600; font-size:0.8rem; border-radius:4px; margin-bottom:4px;">${b.bank_name}</h4>
                            <p style="margin:0; font-size:0.85rem; color:#1a73e8; font-weight:500;">${b.type || 'Savings'} •••• ${maskedAcc}</p>
                        </div>
                        <button class="text-btn" style="background:#1a73e8; color:white; padding:6px 12px; border-radius:20px; font-weight:600; font-size:0.85rem; border:none; cursor:pointer;" onclick="promptBankBalanceCheck('${bankId}', '${b.bank_name.replace(/'/g, "\\'")}', '${maskedAcc}')">
                            <i class="fas fa-eye" style="margin-right:4px;"></i> Check balance
                        </button>
                    </div>
                `;
            }).join('');
        }

        container.innerHTML = html;
    } catch (err) {}
}


// ================= MODALS & PAYMENTS ================= //

function closeModal() {
    const modal = document.getElementById('dynamic-modal');
    if(modal) modal.classList.remove('active');
}

function openPaymentModal(recipient, type, contactObj = null) {
    if (!recipient) return;
    const modal = document.getElementById('dynamic-modal');
    const modalTitle = document.getElementById('modal-title');
    const modalBody = document.getElementById('modal-body');
    
    let displayName = recipient;
    if (typeof recipient === 'object' && recipient !== null) {
        currentPaymentTarget = recipient;
        displayName = recipient.name || 'Recipient';
    } else if (contactObj) {
        currentPaymentTarget = contactObj;
        displayName = contactObj.name || recipient;
    } else {
        currentPaymentTarget = { name: recipient, id: recipient };
        displayName = recipient;
    }

    modalTitle.textContent = `Paying ${displayName}`;
    modalBody.innerHTML = `
        <div class="payment-form">
            <div class="amount-wrapper">
                <span class="rupee-symbol">₹</span>
                <input type="number" class="amount-input" id="pay-amount" placeholder="0" autofocus oninput="validateAmount(this)">
            </div>
            <input type="text" class="custom-input" id="pay-note" placeholder="Add a note (optional)" style="margin-bottom:10px;">
            <input type="password" class="custom-input" id="pay-pin" placeholder="Enter 4-Digit UPI PIN" maxlength="4" style="text-align:center; font-size:1.4rem; letter-spacing:8px; font-family:monospace;">
            <button class="payment-btn" id="pay-btn" onclick="processPayment()" disabled>Pay securely</button>
        </div>
    `;
    modal.classList.add('active');
    setTimeout(() => {
        const amt = document.getElementById('pay-amount');
        if (amt) amt.focus();
    }, 100);
}

function validateAmount(input) {
    const btn = document.getElementById('pay-btn');
    if (btn) btn.disabled = !(input.value && parseFloat(input.value) > 0);
}

async function processPayment() {
    const amount = parseFloat(document.getElementById('pay-amount').value);
    const note = document.getElementById('pay-note')?.value || '';
    const pin = document.getElementById('pay-pin')?.value?.trim();
    
    if(!pin) return alert('4-digit UPI PIN is required');
    if(!currentPaymentTarget) return alert('Recipient details missing');

    const recipientIdentifier = currentPaymentTarget.id || currentPaymentTarget._id || currentPaymentTarget.phone || currentPaymentTarget.upi_id || currentPaymentTarget.name;
    const recipientDisplayName = currentPaymentTarget.name || 'Recipient';

    const btn = document.getElementById('pay-btn');
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Processing Payment...';
    }
    
    try {
        const res = await fetch(`${API_URL}/pay`, {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({ amount, pin, recipientIdentifier, title: note ? note : 'Payment' })
        });
        
        const data = await res.json();
        
        if (data.success) {
            closeModal();
            showSuccess(amount, recipientDisplayName);

            // If chat screen is open with this contact, add transaction card to chat feed in real time
            const chatBody = document.getElementById('chat-body');
            if (chatBody && activeChatContact) {
                const bubble = document.createElement('div');
                bubble.className = 'chat-tx-bubble sent';
                bubble.innerHTML = `
                    <div class="tx-top">
                        <span class="tx-amount">₹${amount.toLocaleString('en-IN')}</span>
                        <span class="tx-badge"><i class="fas fa-check-circle"></i> Paid</span>
                    </div>
                    ${note ? `<div style="font-size:0.85rem;color:var(--text-secondary);">${note}</div>` : ''}
                    <div class="tx-meta">
                        <span>Just now</span>
                        <span style="font-size:0.7rem;color:#1a73e8;"><i class="fas fa-shield-alt"></i> Arya Pay</span>
                    </div>
                `;
                chatBody.appendChild(bubble);
                chatBody.scrollTop = chatBody.scrollHeight;
            }

            // Updating balances on screen like Google Pay automatically
            initAppData();
            loadBanks(); 
            loadContacts();
        } else {
            alert(data.error || 'Payment failed');
            if (btn) {
                btn.disabled = false;
                btn.textContent = 'Pay securely';
            }
        }
    } catch (err) {
        alert('Server error processing payment');
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Pay securely';
        }
    }
}

async function processRecharge() {
    const phoneInput = document.getElementById('recharge-phone');
    const phone = phoneInput ? phoneInput.value.replace(/\D/g, '') : '';
    const amount = parseFloat(document.getElementById('recharge-amount').value);
    const biller = document.getElementById('biller-input').value || 'Mobile Recharge';
    const pin = document.getElementById('recharge-pin').value;
    
    if (!phone || phone.length !== 10) {
        return alert('Please enter a valid 10-digit mobile number to recharge.');
    }
    if (!amount || amount <= 0) {
        return alert('Please enter a valid recharge amount.');
    }
    if (!pin) {
        return alert('UPI PIN is required.');
    }

    const btn = document.getElementById('pay-btn');
    btn.disabled = true;
    btn.textContent = 'Processing Recharge...';
    
    try {
        const res = await fetch(`${API_URL}/recharge`, {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({ 
                amount, 
                pin, 
                mobile: phone,
                biller: biller,
                title: `${biller} (+91 ${phone})` 
            })
        });
        
        const data = await res.json();
        
        if (data.success) {
            closeModal();
            showSuccess(amount, `${biller} (+91 ${phone})`);
            loadBanks();
        } else {
            alert(data.error || 'Recharge failed');
            btn.disabled = false;
            btn.textContent = 'Recharge Now';
        }
    } catch (err) {
        alert('Server error while processing recharge');
        btn.disabled = false;
        btn.textContent = 'Recharge Now';
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
                const txDataStr = JSON.stringify(tx).replace(/"/g, '&quot;');
                return `
                    <div class="tx-item card-3d" style="box-shadow: 0 4px 10px rgba(0,0,0,0.02); cursor: pointer;" onclick="openReceiptDetails(${txDataStr})">
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

            <!-- Buttons row (Switch Camera & Scan from Gallery) -->
            <div style="display:flex;gap:10px;justify-content:center;">
                <button onclick="switchScannerCamera()" style="background:transparent;border:1px solid var(--card-border);color:var(--navy);padding:8px 16px;border-radius:20px;font-size:0.85rem;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:6px;">
                    <i class="fas fa-sync-alt"></i> Switch
                </button>
                <button onclick="document.getElementById('qr-file-input').click()" style="background:transparent;border:1px solid var(--card-border);color:var(--navy);padding:8px 16px;border-radius:20px;font-size:0.85rem;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:6px;">
                    <i class="fas fa-file-image"></i> Gallery
                </button>
            </div>
            <input type="file" id="qr-file-input" accept="image/*" style="display:none;" onchange="scanQRFromFile(this)">

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
        const userPhone = (currentUserUpi ? currentUserUpi.split('@')[0] : '') || localStorage.getItem('bharatPhone') || '';
        const opValue = (title && title.toLowerCase().includes('vi')) ? 'Vi Prepaid' 
            : (title && title.toLowerCase().includes('airtel')) ? 'Airtel Prepaid'
            : (title && title.toLowerCase().includes('bsnl')) ? 'BSNL' : 'Jio Prepaid';

        modalBody.innerHTML = `
            <div style="display:flex;flex-direction:column;gap:12px;">
                <div>
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                        <label style="color:var(--navy); font-weight:600; font-size:0.85rem;">Mobile Number to Recharge</label>
                        ${userPhone ? `<span onclick="setRechargeSelfNumber('${userPhone}')" style="color:var(--saffron); font-size:0.75rem; font-weight:600; cursor:pointer; background:rgba(255,153,51,0.12); padding:3px 9px; border-radius:12px; transition:all 0.2s;"><i class="fas fa-user-check"></i> Fill My Number</span>` : ''}
                    </div>
                    <div class="phone-input-group" id="recharge-phone-box">
                        <span class="phone-country-code"><span style="font-size:1.1rem;">🇮🇳</span> +91</span>
                        <input type="tel" id="recharge-phone" maxlength="10" placeholder="10-digit mobile number" oninput="onRechargePhoneInput(this)" autocomplete="tel-national">
                        <i class="fas fa-address-book phone-icon" onclick="pickPhoneContactForRecharge()" style="cursor:pointer; color:var(--saffron); padding:4px 6px; font-size:1.1rem;" title="Pick contact from phone"></i>
                    </div>
                    <small id="recharge-phone-hint" style="color:var(--text-secondary); font-size:0.75rem; display:block; margin-top:2px;">Enter 10-digit mobile number across India</small>
                </div>

                <div>
                    <label style="color:var(--navy); font-weight:600; font-size:0.85rem; margin-bottom:6px; display:block;">Select Operator & Circle</label>
                    <select class="custom-input" id="biller-input" style="padding:13px 14px; margin-bottom:0;" onchange="this.dataset.manual='true'; validateRechargeBtn();">
                        <option value="Jio Prepaid" ${opValue === 'Jio Prepaid' ? 'selected' : ''}>Jio Prepaid</option>
                        <option value="Airtel Prepaid" ${opValue === 'Airtel Prepaid' ? 'selected' : ''}>Airtel Prepaid</option>
                        <option value="Vi Prepaid" ${opValue === 'Vi Prepaid' ? 'selected' : ''}>Vi Prepaid</option>
                        <option value="BSNL" ${opValue === 'BSNL' ? 'selected' : ''}>BSNL Prepaid</option>
                    </select>
                </div>

                <div>
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                        <label style="color:var(--navy); font-weight:600; font-size:0.85rem;">Popular Plans</label>
                        <span style="font-size:0.75rem; color:var(--text-secondary);">Tap to select</span>
                    </div>
                    <div class="recharge-chips-wrapper">
                        <button type="button" class="recharge-plan-chip active" onclick="selectRechargePlan(299, this)">
                            <span class="plan-amt">₹299</span>
                            <span class="plan-detail">1.5 GB/d • 28 Days</span>
                        </button>
                        <button type="button" class="recharge-plan-chip" onclick="selectRechargePlan(199, this)">
                            <span class="plan-amt">₹199</span>
                            <span class="plan-detail">1.0 GB/d • 24 Days</span>
                        </button>
                        <button type="button" class="recharge-plan-chip" onclick="selectRechargePlan(666, this)">
                            <span class="plan-amt">₹666</span>
                            <span class="plan-detail">1.5 GB/d • 84 Days</span>
                        </button>
                        <button type="button" class="recharge-plan-chip" onclick="selectRechargePlan(29, this)">
                            <span class="plan-amt">₹29</span>
                            <span class="plan-detail">2 GB Data Booster</span>
                        </button>
                    </div>
                </div>

                <div>
                    <label style="color:var(--navy); font-weight:600; font-size:0.85rem; margin-bottom:6px; display:block;">Recharge Amount (₹)</label>
                    <input type="number" class="custom-input" id="recharge-amount" value="299" placeholder="Enter Amount (₹)" oninput="onRechargeAmtCustom(this)" style="margin-bottom:0;">
                </div>

                <div>
                    <label style="color:var(--navy); font-weight:600; font-size:0.85rem; margin-bottom:6px; display:block;">UPI PIN</label>
                    <input type="password" class="custom-input" id="recharge-pin" maxlength="4" placeholder="Enter 4-Digit UPI PIN" oninput="validateRechargeBtn()" style="margin-bottom:0;">
                </div>

                <button class="payment-btn" id="pay-btn" onclick="processRecharge()" disabled style="margin-top:6px;">Recharge Now</button>
            </div>`;
        modal.classList.add('active');
        setTimeout(validateRechargeBtn, 60);
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
    } else if (type === 'promo' || type === 'flex_credit' || type === 'personal_loan' || type === 'pocket_money') {
        const t = (title || '').toLowerCase();
        if (type === 'flex_credit' || t.includes('flex')) {
            renderFlexCreditModal(modalBody, modal);
        } else if (type === 'personal_loan' || t.includes('loan')) {
            renderPersonalLoanModal(modalBody, modal);
        } else if (type === 'pocket_money' || t.includes('pocket')) {
            renderPocketMoneyModal(modalBody, modal);
        } else {
            modalBody.innerHTML = `
                <div style="display:flex;flex-direction:column;align-items:center;padding:20px;gap:15px;text-align:center;">
                    <div style="width:80px;height:80px;border-radius:50%;background:#e8f0fe;display:flex;justify-content:center;align-items:center;">
                        <i class="fas fa-star" style="font-size:2.5rem;color:#1a73e8;"></i>
                    </div>
                    <h3 style="color:var(--navy);font-size:1.4rem;">${title}</h3>
                    <p style="color:var(--text-secondary);font-size:0.95rem;line-height:1.5;">Special pre-approved offer for Arya Pay users.</p>
                    <button class="payment-btn" style="width:100%;" onclick="closeModal();">Close</button>
                </div>`;
            modal.classList.add('active');
        }
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
            promptBankBalanceCheck(entityId, entityName);
        } else if (type === 'add_bank') {
            openAddBankFlow();
        } else if (type === 'contacts') {
            modalBody.innerHTML = `
                <div style="display:flex;flex-direction:column;gap:14px;">
                    <button class="payment-btn" style="margin-top:0; display:flex; align-items:center; justify-content:center; gap:8px;" onclick="pickPhoneContact()">
                        <i class="fas fa-address-book" style="font-size:1.1rem;"></i> Pick from Phone Contacts
                    </button>
                    <div style="display:flex;align-items:center;gap:10px;color:var(--text-secondary);font-size:0.8rem;">
                        <div style="flex:1;height:1px;background:var(--card-border);"></div>
                        or enter manually
                        <div style="flex:1;height:1px;background:var(--card-border);"></div>
                    </div>
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
                    <p style="color:var(--text-secondary);text-align:center;">Invite your friends to join Arya Pay and earn ₹601 for every successful referral!</p>
                    <div style="background:#e8f0fe;border-radius:16px;padding:15px;width:100%;border:1px solid #c5d9f8;text-align:center;">
                        <p style="font-size:0.8rem;color:#1a73e8;margin-bottom:8px;">Your referral code</p>
                        <p style="font-size:1.4rem;font-weight:700;color:var(--navy);letter-spacing:4px;">ARYA${currentUserUpi?.slice(0,4).toUpperCase() || 'PAY'}</p>
                    </div>
                    <p style="color:var(--text-secondary);font-size:0.85rem;">Friends invited: <strong>${friendCount}</strong></p>
                    <button class="payment-btn" style="width:100%;margin-top:0;" onclick="copyReferralLink();closeModal();">Share Referral Link <i class="fas fa-share-alt"></i></button>
                </div>`;
        } else if (type === 'payment_methods') {
            modalBody.innerHTML = `
                <div style="display:flex;flex-direction:column;gap:12px;padding:10px 0;">
                    <p style="color:var(--text-secondary);font-size:0.9rem;text-align:center;">Complete all 3 steps to unlock all features</p>
                    <div style="background:#e8f5e9;border-radius:12px;padding:15px;display:flex;align-items:center;gap:12px;border:1px solid #a5d6a7;cursor:pointer;" onclick="closeModal();openModal('bank_accounts','Bank Accounts')">
                        <i class="fas fa-check-circle" style="color:#34a853;font-size:1.5rem;"></i>
                        <div style="flex:1"><h4 style="margin:0;color:var(--navy);">Bank account</h4><p style="margin:0;font-size:0.8rem;color:#34a853;">View & Manage accounts →</p></div>
                        <i class="fas fa-chevron-right" style="color:#34a853;"></i>
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
            renderBankAccountsModal(modalBody);
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
            const avatarUrl = document.getElementById('profile-avatar')?.src || '';
            modalBody.innerHTML = `
                <div style="display:flex;flex-direction:column;gap:12px;padding:10px 0;">
                    <div style="display:flex;align-items:center;gap:15px;background:#f8f9fa;border-radius:16px;padding:15px;position:relative;">
                        <div style="position:relative;width:60px;height:60px;cursor:pointer;" onclick="document.getElementById('profile-photo-input').click()">
                            <img src="${avatarUrl}" style="width:60px;height:60px;border-radius:50%;object-fit:cover;" alt="Avatar">
                            <div style="position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,0.6);color:white;font-size:0.5rem;padding:2px 0;text-align:center;border-radius:0 0 50px 50px;"><i class="fas fa-camera"></i></div>
                        </div>
                        <div>
                            <h3 style="margin:0;color:var(--navy);">${name}</h3>
                            <p style="margin:0;color:var(--text-secondary);font-size:0.85rem;">${upi}</p>
                        </div>
                    </div>
                    
                    <div style="display:flex;flex-direction:column;gap:10px;background:white;border-radius:12px;border:1px solid #e0e0e0;padding:15px;">
                        <h4 style="margin:0 0 5px;color:var(--navy);font-size:0.95rem;">Edit Profile Details</h4>
                        
                        <div style="display:flex;flex-direction:column;gap:4px;">
                            <label style="font-size:0.75rem;color:var(--text-secondary);font-weight:600;">Display Name</label>
                            <input type="text" class="custom-input" id="edit-name" value="${name}" style="margin:0;padding:10px 14px;">
                        </div>
                        
                        <div style="display:flex;flex-direction:column;gap:4px;">
                            <label style="font-size:0.75rem;color:var(--text-secondary);font-weight:600;">UPI PIN (4-Digit login/transfer PIN)</label>
                            <input type="password" class="custom-input" id="edit-pin" placeholder="Enter new PIN to update" style="margin:0;padding:10px 14px;">
                        </div>

                        <div style="display:flex;flex-direction:column;gap:4px;">
                            <label style="font-size:0.75rem;color:var(--text-secondary);font-weight:600;">Primary Bank Name</label>
                            <input type="text" class="custom-input" id="edit-bank" placeholder="e.g. State Bank of India" style="margin:0;padding:10px 14px;">
                        </div>

                        <div style="display:flex;flex-direction:column;gap:4px;">
                            <label style="font-size:0.75rem;color:var(--text-secondary);font-weight:600;">ATM Card Number (Last 6 digits)</label>
                            <input type="number" class="custom-input" id="edit-atm" placeholder="e.g. 123456" style="margin:0;padding:10px 14px;">
                        </div>

                        <button class="payment-btn" style="width:100%;margin-top:10px;" onclick="saveProfileDetails()">Save Profile Details</button>
                    </div>

                    <button class="payment-btn" style="width:100%;margin-top:0;background:#f8f9fa;color:#d93025;border:1px solid #fde8e8;" onclick="closeModal();logout()"><i class="fas fa-sign-out-alt"></i> Log Out</button>
                </div>`;
            fetchUserDataPrefill();
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

function setRechargeSelfNumber(num) {
    const el = document.getElementById('recharge-phone');
    if (el) {
        el.value = num;
        onRechargePhoneInput(el);
    }
}

function onRechargePhoneInput(el) {
    let val = el.value.replace(/\D/g, '');
    if (val.length > 10) val = val.substring(0, 10);
    el.value = val;

    const hint = document.getElementById('recharge-phone-hint');
    if (hint) {
        if (val.length === 10) {
            hint.textContent = '✓ 10-digit mobile number entered';
            hint.style.color = '#16a34a';
        } else if (val.length > 0) {
            hint.textContent = `${val.length}/10 digits entered`;
            hint.style.color = 'var(--text-secondary)';
        } else {
            hint.textContent = 'Enter 10-digit mobile number across India';
            hint.style.color = 'var(--text-secondary)';
        }
    }

    const opSelect = document.getElementById('biller-input');
    if (opSelect && val.length >= 2 && !opSelect.dataset.manual) {
        const p2 = val.substring(0, 2);
        if (['60','62','63','70','79','89'].includes(p2)) {
            opSelect.value = 'Jio Prepaid';
        } else if (['98','97','99','80','81','90'].includes(p2)) {
            opSelect.value = 'Airtel Prepaid';
        } else if (['91','92','93','94'].includes(p2)) {
            opSelect.value = 'BSNL';
        } else if (['95','96','88','87','84'].includes(p2)) {
            opSelect.value = 'Vi Prepaid';
        }
    }

    validateRechargeBtn();
}

function selectRechargePlan(amt, chipEl) {
    const amtInput = document.getElementById('recharge-amount');
    if (amtInput) {
        amtInput.value = amt;
    }
    const chips = document.querySelectorAll('.recharge-plan-chip');
    chips.forEach(c => c.classList.remove('active'));
    if (chipEl) chipEl.classList.add('active');
    validateRechargeBtn();
}

function onRechargeAmtCustom(input) {
    const val = parseFloat(input.value);
    const chips = document.querySelectorAll('.recharge-plan-chip');
    chips.forEach(c => {
        const amt = parseFloat(c.querySelector('.plan-amt')?.textContent.replace('₹', ''));
        if (amt === val) {
            c.classList.add('active');
        } else {
            c.classList.remove('active');
        }
    });
    validateRechargeBtn();
}

function validateRechargeBtn(input) {
    const btn = document.getElementById('pay-btn');
    if (!btn) return;
    const phoneInput = document.getElementById('recharge-phone');
    const amtInput = document.getElementById('recharge-amount');
    const pinInput = document.getElementById('recharge-pin');

    if (phoneInput && amtInput) {
        const phone = phoneInput.value.replace(/\D/g, '');
        const amt = parseFloat(amtInput.value);
        const pin = pinInput ? pinInput.value.trim() : '';
        btn.disabled = !(phone.length === 10 && amt > 0 && pin.length >= 4);
    } else if (input) {
        btn.disabled = !(input.value && parseFloat(input.value) > 0);
    }
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

// ================= REAL-TIME BANK ACCOUNTS & PIN BALANCE CHECK ================= //

function getBankEmblem(bankName) {
    const name = (bankName || '').toLowerCase();
    if (name.includes('sbi') || name.includes('state bank')) return { class: 'sbi', short: 'SBI', icon: 'fas fa-university' };
    if (name.includes('hdfc')) return { class: 'hdfc', short: 'HDFC', icon: 'fas fa-building' };
    if (name.includes('icici')) return { class: 'icici', short: 'ICICI', icon: 'fas fa-university' };
    if (name.includes('axis')) return { class: 'axis', short: 'AXIS', icon: 'fas fa-landmark' };
    if (name.includes('kotak')) return { class: 'kotak', short: 'KOTAK', icon: 'fas fa-university' };
    if (name.includes('pnb') || name.includes('punjab')) return { class: 'pnb', short: 'PNB', icon: 'fas fa-university' };
    if (name.includes('baroda') || name.includes('bob')) return { class: 'bob', short: 'BOB', icon: 'fas fa-university' };
    if (name.includes('uco')) return { class: 'sbi', short: 'UCO', icon: 'fas fa-university' };
    if (name.includes('canara')) return { class: 'bob', short: 'CANARA', icon: 'fas fa-university' };
    return { class: 'default', short: (bankName || 'Bank').slice(0,4).toUpperCase(), icon: 'fas fa-university' };
}

// Render the Bank Accounts screen (Pic 4)
async function renderBankAccountsModal(container) {
    const modalTitle = document.getElementById('modal-title');
    if (modalTitle) modalTitle.textContent = 'Bank Accounts';
    
    container.innerHTML = `
        <div style="display:flex; justify-content:center; align-items:center; padding:30px; color:var(--text-secondary); gap:8px;">
            <i class="fas fa-spinner fa-spin"></i> Loading bank accounts...
        </div>
    `;

    try {
        const res = await fetch(`${API_URL}/banks`, { headers: authHeaders() });
        const banks = await res.json();

        // Update count badge on 'You' tab
        const pmCount = document.getElementById('pm-bank-count');
        if (pmCount && Array.isArray(banks)) {
            pmCount.textContent = `${banks.length} account${banks.length === 1 ? '' : 's'}`;
        }

        if (!Array.isArray(banks) || banks.length === 0) {
            container.innerHTML = `
                <div style="text-align:center; padding: 25px 15px;">
                    <div style="width:70px; height:70px; border-radius:50%; background:#f1f5f9; color:var(--navy); font-size:2rem; display:flex; align-items:center; justify-content:center; margin:0 auto 15px;">
                        <i class="fas fa-university"></i>
                    </div>
                    <h3 style="color:var(--navy); margin-bottom:6px;">No Bank Accounts Linked</h3>
                    <p style="color:var(--text-secondary); font-size:0.85rem; margin-bottom:20px;">Link your bank account to send and receive payments directly using UPI.</p>
                    <div class="btn-add-bank" onclick="openAddBankFlow()">
                        <i class="fas fa-plus"></i>
                        <span>Add bank account</span>
                    </div>
                </div>
            `;
            return;
        }

        let cardsHtml = banks.map((b, idx) => {
            const emblem = getBankEmblem(b.bank_name);
            const isPrimary = b.is_primary || idx === 0;
            const bankId = b.id || b._id;
            const maskedAcc = b.account_number ? b.account_number.slice(-4) : '••••';
            return `
                <div class="bank-card-modern" id="bank-card-${bankId}">
                    <div class="bank-card-header">
                        <div class="bank-emblem ${emblem.class}">
                            <i class="${emblem.icon}"></i>
                        </div>
                        <div class="bank-card-titles">
                            <h3>
                                ${b.bank_name}
                                ${isPrimary ? '<span class="bank-badge-primary">Primary</span>' : ''}
                            </h3>
                            <p>${b.type || 'Savings Account'} •••• ${maskedAcc}</p>
                        </div>
                    </div>
                    <div class="bank-card-footer">
                        <span style="font-size:0.8rem; color:var(--text-secondary); display:flex; align-items:center; gap:5px;">
                            <i class="fas fa-check-circle" style="color:#10b981;"></i> Linked to Arya UPI
                        </span>
                        <button class="bank-check-btn" onclick="promptBankBalanceCheck('${bankId}', '${b.bank_name.replace(/'/g, "\\'")}', '${maskedAcc}')">
                            <i class="fas fa-lock"></i> Check balance
                        </button>
                    </div>
                    <div id="balance-box-${bankId}"></div>
                </div>
            `;
        }).join('');

        container.innerHTML = `
            <div style="margin-bottom:12px; display:flex; align-items:center; justify-content:space-between;">
                <p style="margin:0; font-size:0.85rem; color:var(--text-secondary); font-weight:600;">ACCOUNTS LINKED FOR UPI</p>
                <span style="font-size:0.8rem; color:#1a73e8; font-weight:600;">${banks.length} Active</span>
            </div>
            <div class="bank-cards-container">
                ${cardsHtml}
            </div>
            <div class="btn-add-bank" onclick="openAddBankFlow()">
                <i class="fas fa-plus"></i>
                <span>Add another bank account</span>
            </div>
        `;
    } catch (err) {
        container.innerHTML = `
            <div style="text-align:center; padding:20px; color:#ef4444;">
                <p>Failed to load bank accounts.</p>
                <button class="payment-btn" onclick="renderBankAccountsModal(document.getElementById('modal-body'))">Retry</button>
            </div>
        `;
    }
}

// Prompt for 4-digit UPI PIN to check bank balance
function promptBankBalanceCheck(bankId, bankName, accountNumber = '••••') {
    const modal = document.getElementById('dynamic-modal');
    const modalTitle = document.getElementById('modal-title');
    const modalBody = document.getElementById('modal-body');
    if (modalTitle) modalTitle.textContent = 'Check Bank Balance';
    if (modal) modal.classList.add('active');

    modalBody.innerHTML = `
        <div style="display:flex; flex-direction:column; align-items:center; padding:10px 0 20px; gap:16px;">
            <div style="width:65px; height:65px; border-radius:50%; background:#e8f0fe; display:flex; align-items:center; justify-content:center; color:#1a73e8; font-size:1.8rem; box-shadow:0 4px 12px rgba(26,115,232,0.15);">
                <i class="fas fa-shield-alt"></i>
            </div>
            <div style="text-align:center;">
                <h3 style="margin:0; color:var(--navy); font-size:1.25rem; font-weight:700;">Enter 4-Digit UPI PIN</h3>
                <p style="margin:5px 0 0; color:var(--text-secondary); font-size:0.85rem;">
                    Checking balance for <strong>${bankName}</strong> (•••• ${accountNumber.slice(-4)})
                </p>
            </div>
            
            <div style="width:100%; max-width:260px; margin: 10px auto 0;">
                <input type="password" id="pin-check-input" maxlength="4" placeholder="••••" 
                    style="width:100%; text-align:center; font-size:2rem; letter-spacing:12px; padding:12px; border-radius:14px; border:2px solid #cbd5e1; outline:none; background:#f8fafc; font-family:monospace; box-sizing:border-box;" 
                    autofocus oninput="this.value = this.value.replace(/[^0-9]/g, '')" onkeypress="if(event.key==='Enter') verifyBankPin('${bankId}')">
            </div>

            <div id="pin-error-msg" style="color:#d93025; font-size:0.85rem; font-weight:600; display:none; text-align:center; padding: 4px 12px; background: #fef2f2; border-radius: 8px; border: 1px solid #fecaca;"></div>
            
            <div style="display:flex; gap:10px; width:100%; margin-top:10px;">
                <button class="payment-btn" style="flex:1; margin-top:0; background:#f1f5f9; color:var(--navy); border:1px solid #cbd5e1;" onclick="openModal('bank_accounts', 'Bank Accounts')">Cancel</button>
                <button class="payment-btn" id="btn-verify-pin" style="flex:2; margin-top:0;" onclick="verifyBankPin('${bankId}')">
                    <i class="fas fa-lock" style="margin-right:6px;"></i> Verify PIN
                </button>
            </div>
        </div>
    `;
    setTimeout(() => {
        const inp = document.getElementById('pin-check-input');
        if (inp) inp.focus();
    }, 100);
}

// Verify UPI PIN against backend and display balance
async function verifyBankPin(bankId) {
    const pinInput = document.getElementById('pin-check-input');
    const errorMsg = document.getElementById('pin-error-msg');
    const btn = document.getElementById('btn-verify-pin');

    if (!pinInput) return;
    const pin = pinInput.value.trim();

    if (!pin || pin.length !== 4) {
        if (errorMsg) {
            errorMsg.textContent = 'Please enter a valid 4-digit UPI PIN';
            errorMsg.style.display = 'block';
        }
        return;
    }

    if (errorMsg) errorMsg.style.display = 'none';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verifying...';
    }

    try {
        const res = await fetch(`${API_URL}/banks/balance`, {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({ bank_id: bankId, pin })
        });
        const data = await res.json();

        if (data.success) {
            const modalTitle = document.getElementById('modal-title');
            const modalBody = document.getElementById('modal-body');
            if (modalTitle) modalTitle.textContent = 'Bank Balance';

            const formattedBal = Number(data.balance).toLocaleString('en-IN', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            });

            modalBody.innerHTML = `
                <div style="text-align:center; padding: 15px 0 10px;">
                    <div style="width:75px; height:75px; border-radius:50%; background:#dcfce7; color:#15803d; font-size:2.4rem; display:flex; align-items:center; justify-content:center; margin:0 auto 15px; box-shadow:0 4px 15px rgba(22,101,52,0.15);">
                        <i class="fas fa-check"></i>
                    </div>
                    <p style="color:var(--text-secondary); font-size:0.9rem; margin-bottom:4px; font-weight:500;">Available Balance</p>
                    <h2 style="color:var(--navy); font-size:2.4rem; font-weight:800; margin:0; letter-spacing:-0.5px;">₹${formattedBal}</h2>
                    <p style="color:var(--text-secondary); font-size:0.85rem; margin-top:8px;">
                        ${data.bank_name} •••• ${(data.account_number || '').slice(-4)}
                    </p>
                    <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:14px; padding:12px; margin-top:18px; font-size:0.85rem; color:#166534; display:flex; align-items:center; justify-content:center; gap:8px;">
                        <i class="fas fa-shield-alt" style="color:#15803d;"></i> Verified securely via Arya Pay UPI
                    </div>
                    <button class="payment-btn" style="width:100%; margin-top:20px;" onclick="openModal('bank_accounts', 'Bank Accounts')">
                        <i class="fas fa-arrow-left" style="margin-right:6px;"></i> Back to Bank Accounts
                    </button>
                </div>
            `;
        } else {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-lock" style="margin-right:6px;"></i> Verify PIN';
            }
            if (errorMsg) {
                errorMsg.textContent = data.error || 'Incorrect UPI PIN. Please try again.';
                errorMsg.style.display = 'block';
            }
            pinInput.value = '';
            pinInput.focus();
        }
    } catch (err) {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-lock" style="margin-right:6px;"></i> Verify PIN';
        }
        if (errorMsg) {
            errorMsg.textContent = 'Server error. Please check connection.';
            errorMsg.style.display = 'block';
        }
    }
}

// Open real-time Add Bank Account selection flow
function openAddBankFlow() {
    const modalTitle = document.getElementById('modal-title');
    const modalBody = document.getElementById('modal-body');
    if (modalTitle) modalTitle.textContent = 'Add Bank Account';

    const popularBanks = [
        { name: 'State Bank of India', short: 'SBI', icon: 'fas fa-university' },
        { name: 'HDFC Bank', short: 'HDFC', icon: 'fas fa-building' },
        { name: 'ICICI Bank', short: 'ICICI', icon: 'fas fa-university' },
        { name: 'Axis Bank', short: 'AXIS', icon: 'fas fa-landmark' },
        { name: 'Kotak Mahindra Bank', short: 'Kotak', icon: 'fas fa-university' },
        { name: 'Punjab National Bank', short: 'PNB', icon: 'fas fa-university' },
        { name: 'Bank of Baroda', short: 'BOB', icon: 'fas fa-university' },
        { name: 'Canara Bank', short: 'Canara', icon: 'fas fa-university' },
        { name: 'Union Bank of India', short: 'UBI', icon: 'fas fa-university' }
    ];

    const tilesHtml = popularBanks.map(b => `
        <div class="popular-bank-tile" onclick="selectPopularBank('${b.name}', this)">
            <div style="width:36px; height:36px; border-radius:10px; background:#e8f0fe; color:#1a73e8; display:flex; align-items:center; justify-content:center; font-size:1rem;">
                <i class="${b.icon}"></i>
            </div>
            <span>${b.short}</span>
        </div>
    `).join('');

    modalBody.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:14px;">
            <p style="margin:0; font-size:0.85rem; color:var(--text-secondary); font-weight:600;">SELECT POPULAR BANK</p>
            <div class="popular-banks-grid">
                ${tilesHtml}
            </div>

            <div style="display:flex; flex-direction:column; gap:10px; margin-top:5px;">
                <p style="margin:0; font-size:0.85rem; color:var(--text-secondary); font-weight:600;">OR ENTER DETAILS MANUALLY</p>
                <input type="text" class="custom-input" id="new-bank-name" placeholder="Bank Name (e.g. HDFC Bank, SBI)">
                <input type="number" class="custom-input" id="new-bank-acc" placeholder="Account Number (10 to 16 digits)">
                <select class="custom-input" id="new-bank-type" style="padding:14px;">
                    <option value="Savings Account">Savings Account</option>
                    <option value="Current Account">Current Account</option>
                </select>
                <input type="password" class="custom-input" id="new-bank-pin" placeholder="Set 4-Digit UPI PIN" maxlength="4" style="letter-spacing:4px; font-size:1.1rem; text-align:center;">
            </div>

            <div style="display:flex; gap:10px; margin-top:8px;">
                <button class="payment-btn" style="flex:1; margin-top:0; background:#f1f5f9; color:var(--navy); border:1px solid #cbd5e1;" onclick="openModal('bank_accounts', 'Bank Accounts')">Back</button>
                <button class="payment-btn" id="btn-link-bank" style="flex:2; margin-top:0;" onclick="processAddBankNew()">
                    <i class="fas fa-link" style="margin-right:6px;"></i> Link Bank Account
                </button>
            </div>
        </div>
    `;
}

function selectPopularBank(bankName, tileEl) {
    document.querySelectorAll('.popular-bank-tile').forEach(el => el.classList.remove('selected'));
    if (tileEl) tileEl.classList.add('selected');
    const input = document.getElementById('new-bank-name');
    if (input) {
        input.value = bankName;
        document.getElementById('new-bank-acc')?.focus();
    }
}

async function processAddBankNew() {
    const bank_name = document.getElementById('new-bank-name')?.value.trim();
    const account_number = document.getElementById('new-bank-acc')?.value.trim();
    const type = document.getElementById('new-bank-type')?.value || 'Savings Account';
    const pin = document.getElementById('new-bank-pin')?.value.trim();
    const btn = document.getElementById('btn-link-bank');

    if (!bank_name) return alert('Please select or enter your bank name');
    if (!account_number || account_number.length < 4) return alert('Please enter a valid account number');
    if (!pin || pin.length !== 4) return alert('Please set a 4-digit UPI PIN');

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Linking Account...';
    }

    try {
        const res = await fetch(`${API_URL}/banks`, {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({ bank_name, account_number, type, pin })
        });
        const data = await res.json();

        if (data.success) {
            showToast(`${bank_name} linked successfully! 🎉`);
            loadBanks(); // update background state
            renderBankAccountsModal(document.getElementById('modal-body')); // return to updated accounts list
        } else {
            alert(data.error || 'Failed to link bank account');
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-link" style="margin-right:6px;"></i> Link Bank Account';
            }
        }
    } catch (err) {
        alert('Server error linking bank account');
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-link" style="margin-right:6px;"></i> Link Bank Account';
        }
    }
}

// ================= CHAT SCREEN ================= //
let activeChatContact = null;

async function openChat(contact) {
    activeChatContact = contact;
    const screen = document.getElementById('chat-screen');
    document.getElementById('chat-title').textContent = contact.name;
    const avatar = document.getElementById('chat-avatar');
    avatar.style.background = contact.color || '#FF9933';
    avatar.innerHTML = contact.profile_photo 
        ? `<img src="${contact.profile_photo}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`
        : (contact.initials || contact.name[0]);

    const chatBody = document.getElementById('chat-body');
    chatBody.innerHTML = `
        <div style="text-align:center;color:var(--text-secondary);font-size:0.75rem;padding:8px;background:rgba(255,255,255,0.7);border-radius:12px;align-self:center;margin-bottom:5px;display:flex;align-items:center;gap:5px;box-shadow:0 1px 2px rgba(0,0,0,0.05);">
            <i class="fas fa-lock" style="color:#fbbc04;"></i> Payments are 100% secure with Arya Pay
        </div>
        <div style="text-align:center;color:var(--text-secondary);font-size:0.75rem;padding:5px;">Today</div>
        <div style="align-self:center;background:#e8f0fe;padding:12px 20px;border-radius:20px;font-size:0.95rem;color:#1a73e8;max-width:85%;text-align:center;box-shadow:0 2px 5px rgba(0,0,0,0.05);margin-top:10px;">
            👋 Say hi to ${contact.name.split(' ')[0]}! Tap <strong>Pay</strong> or <strong>Request</strong> below to get started.
        </div>`;
    screen.style.transform = 'translateX(0)';

    // Load past transactions between user and this contact
    try {
        const res = await fetch(`${API_URL}/transactions`, { headers: authHeaders() });
        const txs = await res.json();
        if (Array.isArray(txs)) {
            const relevantTxs = txs.filter(t => 
                (contact.id && t.target_id === contact.id) ||
                (contact._id && t.target_id === contact._id) ||
                (t.title && t.title.toLowerCase().includes(contact.name.toLowerCase()))
            );
            relevantTxs.reverse().forEach(t => {
                const bubble = document.createElement('div');
                const isSent = t.type === 'paid';
                bubble.className = `chat-tx-bubble ${isSent ? 'sent' : 'received'}`;
                const txDate = new Date(t.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                bubble.innerHTML = `
                    <div class="tx-top">
                        <span class="tx-amount">₹${Number(t.amount).toLocaleString('en-IN')}</span>
                        <span class="tx-badge">${isSent ? '<i class="fas fa-check-circle"></i> Paid' : '<i class="fas fa-arrow-down"></i> Received'}</span>
                    </div>
                    <div style="font-size:0.85rem;color:var(--text-secondary);">${t.title || (isSent ? 'Payment sent' : 'Payment received')}</div>
                    <div class="tx-meta">
                        <span>${txDate}</span>
                        <span style="font-size:0.7rem;color:#1a73e8;"><i class="fas fa-shield-alt"></i> Arya Pay</span>
                    </div>
                `;
                chatBody.appendChild(bubble);
            });
            chatBody.scrollTop = chatBody.scrollHeight;
        }
    } catch(e) {}
}

function closeChat() {
    const screen = document.getElementById('chat-screen');
    screen.style.transform = 'translateX(100%)';
    activeChatContact = null;
}

function startPaymentFromChat() {
    if (!activeChatContact) return;
    openPaymentModal(activeChatContact, 'contact');
}

// ================= NEW WORKFLOW FUNCTIONS ================= //

async function uploadProfilePhoto(input) {
    if (!input.files || !input.files[0]) return;
    const file = input.files[0];
    const reader = new FileReader();

    reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
            // Compress/resize photo to 150x150 on canvas to keep base64 payload small
            const canvas = document.createElement('canvas');
            canvas.width = 150;
            canvas.height = 150;
            const ctx = canvas.getContext('2d');
            
            // Draw cropped to square
            const size = Math.min(img.width, img.height);
            const x = (img.width - size) / 2;
            const y = (img.height - size) / 2;
            ctx.drawImage(img, x, y, size, size, 0, 0, 150, 150);
            
            const base64 = canvas.toDataURL('image/jpeg', 0.85);
            
            // Upload to server
            savePhotoToServer(base64);
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

async function savePhotoToServer(base64) {
    showToast("Uploading profile photo...");
    try {
        const res = await fetch(`${API_URL}/user/update`, {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({ profile_photo: base64 })
        });
        const data = await res.json();
        if (data.success) {
            showToast("Profile photo updated! ✅");
            initAppData(); // Refresh all avatar displays
            
            // If the manage account modal is currently open, refresh the avatar in it
            const modalAvatar = document.querySelector("#modal-body img[alt='Avatar']");
            if (modalAvatar) {
                modalAvatar.src = base64;
            }
        } else {
            alert(data.error || "Upload failed");
        }
    } catch(err) {
        alert("Upload error");
    }
}

async function fetchUserDataPrefill() {
    try {
        const res = await fetch(`${API_URL}/user`, { headers: authHeaders() });
        const user = await res.json();
        if (user && !user.error) {
            if (document.getElementById('edit-bank')) document.getElementById('edit-bank').value = user.bank_name || '';
            if (document.getElementById('edit-atm')) document.getElementById('edit-atm').value = user.atm_card || '';
        }
    } catch(e) {}
}

async function saveProfileDetails() {
    const name = document.getElementById('edit-name').value.trim();
    const pin = document.getElementById('edit-pin').value.trim();
    const bank_name = document.getElementById('edit-bank').value.trim();
    const atm_card = document.getElementById('edit-atm').value.trim();

    if (!name) return alert('Name cannot be empty');

    const updateData = { name };
    if (pin) {
        if (!/^\d{4}$/.test(pin)) {
            return alert('UPI PIN must be exactly 4 digits');
        }
        updateData.pin = pin;
    }
    if (bank_name) updateData.bank_name = bank_name;
    if (atm_card) updateData.atm_card = atm_card;

    showToast("Saving details...");
    try {
        const res = await fetch(`${API_URL}/user/update`, {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify(updateData)
        });
        const data = await res.json();
        if (data.success) {
            showToast("Account details updated! ✅");
            closeModal();
            initAppData(); // Refresh dashboard user details
        } else {
            alert(data.error || "Failed to update profile");
        }
    } catch (err) {
        alert("Server error");
    }
}

function scanQRFromFile(input) {
    if (!input.files || !input.files[0]) return;
    const file = input.files[0];
    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            
            try {
                const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const code = jsQR(imgData.data, imgData.width, imgData.height);
                if (code) {
                    closeModal();
                    handleScannedQR(code.data);
                } else {
                    showToast("⚠️ Could not find a valid UPI QR code in this image.");
                }
            } catch (err) {
                showToast("⚠️ Scan failed: Error reading image data.");
            }
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

// ================= NEW FEATURES (THEME, REFERRALS, RECEIPTS) ================= //

function initTheme() {
    const cachedTheme = localStorage.getItem('theme');
    const label = document.getElementById('current-theme-label');
    const toggleBtn = document.getElementById('theme-toggle-btn');
    
    if (cachedTheme === 'dark') {
        document.body.classList.add('dark-theme');
        if (label) label.textContent = 'Dark Mode';
        if (toggleBtn) toggleBtn.innerHTML = '<i class="fas fa-sun"></i>';
    } else {
        document.body.classList.remove('dark-theme');
        if (label) label.textContent = 'Light Mode';
        if (toggleBtn) toggleBtn.innerHTML = '<i class="fas fa-moon"></i>';
    }
}

function toggleTheme() {
    const isDark = document.body.classList.toggle('dark-theme');
    const label = document.getElementById('current-theme-label');
    const toggleBtn = document.getElementById('theme-toggle-btn');
    
    if (isDark) {
        localStorage.setItem('theme', 'dark');
        if (label) label.textContent = 'Dark Mode';
        if (toggleBtn) toggleBtn.innerHTML = '<i class="fas fa-sun"></i>';
        showToast('Dark Mode Activated');
    } else {
        localStorage.setItem('theme', 'light');
        if (label) label.textContent = 'Light Mode';
        if (toggleBtn) toggleBtn.innerHTML = '<i class="fas fa-moon"></i>';
        showToast('Light Mode Activated');
    }
}

function copyReferralLink() {
    const refCode = 'BHARAT' + (currentUserUpi ? currentUserUpi.slice(0, 4).toUpperCase() : 'PAY');
    const refLink = `${window.location.origin}/?ref=${refCode}`;
    navigator.clipboard.writeText(refLink).then(() => {
        showToast('Referral link copied: ' + refCode);
    }).catch(err => {
        showToast('Failed to copy. Link: ' + refLink);
    });
}

function openReceiptDetails(tx) {
    const txId = tx.transaction_id || ('BHARAT' + Math.floor(100000000000 + Math.random() * 900000000000).toString());
    const refNo = txId.replace('BHARAT', '');
    const dateStr = new Date(tx.date).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const formattedAmount = currencyFormatter.format(tx.amount);
    const isPaid = tx.type !== 'received';
    
    const modal = document.getElementById('dynamic-modal');
    const modalTitle = document.getElementById('modal-title');
    const modalBody = document.getElementById('modal-body');
    if (!modalTitle || !modalBody) return;
    
    modalTitle.textContent = "Transaction Receipt";
    modalBody.innerHTML = `
        <div class="receipt-card" style="text-align: center; padding: 15px 10px;">
            <div style="width: 64px; height: 64px; background: rgba(19, 136, 8, 0.1); color: var(--green); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 2.2rem; margin: 0 auto 15px;">
                <i class="fas fa-check-circle"></i>
            </div>
            <h4 style="margin: 0; font-size: 1.1rem; color: var(--text-secondary);">Payment Completed</h4>
            <h2 style="font-size: 2.2rem; font-weight: 700; color: var(--text-primary); margin: 10px 0;">${formattedAmount}</h2>
            
            <hr style="border: none; border-top: 1px dashed var(--card-border); margin: 15px 0;">
            
            <div style="display: flex; flex-direction: column; gap: 12px; text-align: left; font-size: 0.9rem;">
                <div style="display: flex; justify-content: space-between;">
                    <span style="color: var(--text-secondary);">Transaction</span>
                    <strong style="color: var(--text-primary);">${tx.title}</strong>
                </div>
                <div style="display: flex; justify-content: space-between;">
                    <span style="color: var(--text-secondary);">Type</span>
                    <strong style="color: var(--text-primary);">${isPaid ? 'Sent / Debited' : 'Received / Credited'}</strong>
                </div>
                <div style="display: flex; justify-content: space-between;">
                    <span style="color: var(--text-secondary);">Date & Time</span>
                    <strong style="color: var(--text-primary);">${dateStr}</strong>
                </div>
                <div style="display: flex; justify-content: space-between;">
                    <span style="color: var(--text-secondary);">UPI Transaction ID</span>
                    <strong style="color: var(--text-primary); font-family: monospace; font-size: 0.85rem;">${txId}</strong>
                </div>
                <div style="display: flex; justify-content: space-between;">
                    <span style="color: var(--text-secondary);">UPI Ref No.</span>
                    <strong style="color: var(--text-primary); font-family: monospace; font-size: 0.85rem;">${refNo}</strong>
                </div>
                <div style="display: flex; justify-content: space-between;">
                    <span style="color: var(--text-secondary);">Status</span>
                    <strong style="color: var(--green);"><i class="fas fa-shield-alt"></i> SUCCESSFUL</strong>
                </div>
            </div>
            
            <hr style="border: none; border-top: 1px dashed var(--card-border); margin: 20px 0;">
            
            <button class="btn-primary" style="width: 100%; border-radius: 12px; display: flex; align-items: center; justify-content: center; gap: 8px; padding: 12px;" onclick="shareTransactionReceipt('${txId}', '${tx.title.replace(/'/g, "\\'")}', '${formattedAmount}', '${dateStr}')">
                <i class="fas fa-share-alt"></i> Share Receipt
            </button>
        </div>
    `;
    modal.classList.add('active');
}

function shareTransactionReceipt(txId, title, amount, date) {
    const text = `💸 Arya Pay Transaction Receipt\n---------------------------\nStatus: SUCCESSFUL\nType: ${title}\nAmount: ${amount}\nDate: ${date}\nRef ID: ${txId}\n---------------------------\nProcessed securely via Arya Pay.`;
    
    if (navigator.share) {
        navigator.share({
            title: 'Arya Pay Receipt',
            text: text
        }).catch(err => {
            navigator.clipboard.writeText(text);
            showToast('Receipt copied to clipboard!');
        });
    } else {
        navigator.clipboard.writeText(text);
        showToast('Receipt copied to clipboard!');
    }
}

// ================= CREDIT FOR YOU (FLEX, PERSONAL LOAN, POCKET MONEY) ================= //

let activeLoanTenure = 12;

async function renderFlexCreditModal(modalBody, modal) {
    modalBody.innerHTML = `<div style="text-align:center; padding:30px;"><i class="fas fa-spinner fa-spin" style="font-size:2rem; color:var(--saffron);"></i><p style="margin-top:10px; color:var(--text-secondary);">Loading Flex Credit details...</p></div>`;
    modal.classList.add('active');

    try {
        const res = await fetch(`${API_URL}/credit/status`, { headers: authHeaders() });
        const data = await res.json();
        const flex = data.flex || { active: false, limit: 50000, available: 50000, cardNumber: "4215 8892 3140 8842" };
        const userName = (data.userName || currentUserName || 'ARYA PAY USER').toUpperCase();

        if (flex.active) {
            modalBody.innerHTML = `
                <div style="display:flex; flex-direction:column; gap:16px;">
                    <!-- Virtual RuPay Credit Card -->
                    <div class="virtual-credit-card">
                        <div class="card-top-row">
                            <span style="font-weight:800; font-size:1.1rem; letter-spacing:1px; background:linear-gradient(135deg,#FF9933,#fff,#138808); -webkit-background-clip:text; -webkit-text-fill-color:transparent;">Arya Pay</span>
                            <span style="font-size:0.75rem; background:rgba(34,197,94,0.2); border:1px solid rgba(34,197,94,0.4); color:#4ade80; padding:3px 8px; border-radius:12px; font-weight:600;"><i class="fas fa-check-circle"></i> ACTIVE & UPI LINKED</span>
                        </div>
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                            <div class="emv-chip"></div>
                            <i class="fas fa-wifi" style="transform:rotate(90deg); font-size:1.2rem; color:#94a3b8;"></i>
                        </div>
                        <div class="virtual-card-number">${flex.cardNumber || '4215 8892 3140 8842'}</div>
                        <div class="virtual-card-bottom">
                            <div class="virtual-card-holder">
                                <label>Cardholder</label>
                                <span>${userName}</span>
                            </div>
                            <div class="virtual-card-valid">
                                <label>Valid Thru</label>
                                <span>09/31</span>
                            </div>
                            <div style="font-weight:800; font-size:1.2rem; color:#f59e0b; font-style:italic;">RuPay</div>
                        </div>
                    </div>

                    <!-- Credit Limit Summary -->
                    <div style="background:#f8fafc; border-radius:16px; padding:16px; border:1px solid var(--card-border);">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                            <span style="color:var(--text-secondary); font-size:0.9rem;">Available Credit Limit</span>
                            <span style="color:#16a34a; font-weight:800; font-size:1.25rem;">₹${(flex.available || 50000).toLocaleString('en-IN')}</span>
                        </div>
                        <div style="width:100%; height:8px; background:#e2e8f0; border-radius:4px; overflow:hidden;">
                            <div style="width:100%; height:100%; background:linear-gradient(90deg, #16a34a, #22c55e);"></div>
                        </div>
                        <div style="display:flex; justify-content:space-between; margin-top:10px; font-size:0.8rem; color:var(--text-secondary);">
                            <span>Total Limit: ₹${(flex.limit || 50000).toLocaleString('en-IN')}</span>
                            <span>Interest-free: 45 Days</span>
                        </div>
                    </div>

                    <!-- Feature Highlights -->
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                        <div style="background:rgba(26,115,232,0.08); border-radius:12px; padding:12px; border:1px solid rgba(26,115,232,0.15);">
                            <div style="color:#1a73e8; font-weight:700; font-size:0.9rem; margin-bottom:2px;"><i class="fas fa-qrcode"></i> Scan & Pay</div>
                            <span style="font-size:0.75rem; color:var(--text-secondary);">Accepted at any UPI QR code</span>
                        </div>
                        <div style="background:rgba(234,179,8,0.1); border-radius:12px; padding:12px; border:1px solid rgba(234,179,8,0.2);">
                            <div style="color:#b45309; font-weight:700; font-size:0.9rem; margin-bottom:2px;"><i class="fas fa-gift"></i> 2% Cashback</div>
                            <span style="font-size:0.75rem; color:var(--text-secondary);">On every merchant payment</span>
                        </div>
                    </div>

                    <button class="payment-btn" style="width:100%; margin-top:5px; background:var(--navy);" onclick="closeModal(); openScanner();">
                        <i class="fas fa-qrcode" style="margin-right:8px;"></i> Scan & Pay with Flex
                    </button>
                </div>
            `;
        } else {
            modalBody.innerHTML = `
                <div style="display:flex; flex-direction:column; gap:14px;">
                    <!-- Card Preview -->
                    <div class="virtual-credit-card" style="margin-bottom:10px;">
                        <div class="card-top-row">
                            <span style="font-weight:800; font-size:1.1rem; letter-spacing:1px; background:linear-gradient(135deg,#FF9933,#fff,#138808); -webkit-background-clip:text; -webkit-text-fill-color:transparent;">Arya Pay</span>
                            <span style="font-size:0.75rem; background:rgba(255,153,51,0.2); border:1px solid rgba(255,153,51,0.4); color:#fbbf24; padding:3px 8px; border-radius:12px; font-weight:600;">PRE-APPROVED</span>
                        </div>
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                            <div class="emv-chip"></div>
                            <i class="fas fa-wifi" style="transform:rotate(90deg); font-size:1.2rem; color:#94a3b8;"></i>
                        </div>
                        <div class="virtual-card-number">4215 •••• •••• 8842</div>
                        <div class="virtual-card-bottom">
                            <div class="virtual-card-holder">
                                <label>Cardholder</label>
                                <span>${userName}</span>
                            </div>
                            <div class="virtual-card-valid">
                                <label>Valid Thru</label>
                                <span>09/31</span>
                            </div>
                            <div style="font-weight:800; font-size:1.2rem; color:#f59e0b; font-style:italic;">RuPay</div>
                        </div>
                    </div>

                    <!-- Pre-approved Callout -->
                    <div style="background:linear-gradient(135deg, rgba(26,115,232,0.1), rgba(245,158,11,0.1)); border-radius:14px; padding:14px; border:1px solid rgba(26,115,232,0.2);">
                        <div style="font-weight:700; color:var(--navy); font-size:0.95rem; margin-bottom:4px;">
                            🎉 Pre-Approved Limit: ₹50,000
                        </div>
                        <p style="font-size:0.8rem; color:var(--text-secondary); margin:0;">
                            Lifetime Free (₹0 Annual Fee) • 45 Days Interest-Free Credit • Instant UPI Linking
                        </p>
                    </div>

                    <!-- Quick Verification Fields -->
                    <div>
                        <label style="font-weight:600; font-size:0.85rem; color:var(--navy); margin-bottom:4px; display:block;">Confirm PAN Number</label>
                        <input type="text" id="flex-pan" class="custom-input" value="ABCDE1234F" style="margin-bottom:8px; text-transform:uppercase; letter-spacing:1px;" maxlength="10">
                    </div>

                    <div>
                        <label style="font-weight:600; font-size:0.85rem; color:var(--navy); margin-bottom:4px; display:block;">Enter 4-Digit UPI PIN to Confirm</label>
                        <input type="password" id="flex-pin" class="custom-input" placeholder="Enter 4-Digit UPI PIN" style="margin-bottom:8px;" maxlength="4">
                    </div>

                    <div style="display:flex; align-items:center; gap:8px; font-size:0.8rem; color:var(--text-secondary);">
                        <input type="checkbox" id="flex-terms" checked style="accent-color:var(--navy);">
                        <label for="flex-terms">I agree to Arya Bank Credit Card T&C and UPI auto-link</label>
                    </div>

                    <button class="payment-btn" id="flex-activate-btn" onclick="activateFlexCredit()" style="width:100%; margin-top:6px; background:linear-gradient(135deg, #1e3a8a, #1d4ed8);">
                        Activate Flex Credit Line Instantly
                    </button>
                </div>
            `;
        }
    } catch (err) {
        modalBody.innerHTML = `<div style="text-align:center; color:var(--danger); padding:20px;">Failed to load Flex details. Please try again.</div>`;
    }
}

async function activateFlexCredit() {
    const pin = document.getElementById('flex-pin')?.value.trim();
    if (!pin || pin.length !== 4) return alert('Please enter your 4-digit UPI PIN');

    const btn = document.getElementById('flex-activate-btn');
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Activating Credit Line...';
    }

    try {
        const res = await fetch(`${API_URL}/credit/flex/activate`, {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({ pin })
        });
        const data = await res.json();
        if (data.success) {
            showToast('🎉 Flex Credit Card Activated! ₹50,000 limit ready.');
            loadBanks(); // Refresh accounts count on You tab
            const modal = document.getElementById('dynamic-modal');
            const modalBody = document.getElementById('modal-body');
            renderFlexCreditModal(modalBody, modal);
        } else {
            alert(data.error || 'Failed to activate Flex credit');
            if (btn) {
                btn.disabled = false;
                btn.textContent = 'Activate Flex Credit Line Instantly';
            }
        }
    } catch (err) {
        alert('Server error while activating Flex');
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Activate Flex Credit Line Instantly';
        }
    }
}

async function renderPersonalLoanModal(modalBody, modal) {
    modalBody.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:14px;">
            <!-- Header Offer Badge -->
            <div style="background:linear-gradient(135deg, rgba(234,179,8,0.15), rgba(245,158,11,0.05)); border-radius:14px; padding:14px; border:1.5px solid rgba(245,158,11,0.3);">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span style="font-weight:700; color:#b45309; font-size:0.95rem;"><i class="fas fa-bolt" style="margin-right:4px;"></i> Instant Approval</span>
                    <span style="font-size:0.75rem; background:#d97706; color:#fff; padding:2px 8px; border-radius:10px; font-weight:600;">PRE-APPROVED</span>
                </div>
                <p style="font-size:0.8rem; color:var(--text-secondary); margin:4px 0 0;">
                    Disbursal directly to your linked bank account within 60 seconds.
                </p>
            </div>

            <!-- Loan Amount Slider -->
            <div>
                <div style="display:flex; justify-content:space-between; align-items:baseline; margin-bottom:8px;">
                    <label style="font-weight:600; color:var(--navy); font-size:0.9rem;">Loan Amount</label>
                    <span id="loan-amt-display" style="font-size:1.4rem; font-weight:800; color:var(--navy);">₹2,00,000</span>
                </div>
                <input type="range" id="loan-slider" min="25000" max="1000000" step="5000" value="200000" oninput="updateLoanCalculation()" style="width:100%; accent-color:var(--saffron); cursor:pointer;">
                <div style="display:flex; justify-content:space-between; font-size:0.75rem; color:var(--text-secondary); margin-top:4px;">
                    <span>₹25,000</span>
                    <span>Max ₹10,00,000</span>
                </div>
            </div>

            <!-- Repayment Tenure -->
            <div>
                <label style="font-weight:600; color:var(--navy); font-size:0.85rem; margin-bottom:8px; display:block;">Select Repayment Tenure</label>
                <div class="tenure-pills-row">
                    <button type="button" class="tenure-pill" onclick="setLoanTenure(6, this)">6 Mo</button>
                    <button type="button" class="tenure-pill active" onclick="setLoanTenure(12, this)">12 Mo</button>
                    <button type="button" class="tenure-pill" onclick="setLoanTenure(24, this)">24 Mo</button>
                    <button type="button" class="tenure-pill" onclick="setLoanTenure(36, this)">36 Mo</button>
                </div>
            </div>

            <!-- EMI Calculation Summary Box -->
            <div class="loan-summary-box">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                    <span style="font-size:0.85rem; color:var(--text-secondary);">Monthly EMI</span>
                    <span id="loan-emi-val" style="font-size:1.3rem; font-weight:800; color:var(--saffron);">₹17,725 / mo</span>
                </div>
                <hr style="border:none; border-top:1px dashed var(--card-border); margin:10px 0;">
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; font-size:0.8rem;">
                    <div>
                        <span style="color:var(--text-secondary); display:block;">Interest Rate</span>
                        <strong style="color:var(--navy);">11.5% p.a.</strong>
                    </div>
                    <div>
                        <span style="color:var(--text-secondary); display:block;">Processing Fee</span>
                        <strong style="color:#16a34a;">₹0 (Zero Fee)</strong>
                    </div>
                    <div>
                        <span style="color:var(--text-secondary); display:block;">Disbursal Account</span>
                        <strong style="color:var(--navy);">Primary Bank</strong>
                    </div>
                    <div>
                        <span style="color:var(--text-secondary); display:block;">Tenure</span>
                        <strong id="loan-tenure-summary" style="color:var(--navy);">12 Months</strong>
                    </div>
                </div>
            </div>

            <!-- 4-Digit UPI PIN -->
            <div>
                <label style="font-weight:600; font-size:0.85rem; color:var(--navy); margin-bottom:4px; display:block;">Enter 4-Digit UPI PIN to Confirm Disbursal</label>
                <input type="password" id="loan-pin" class="custom-input" placeholder="Enter 4-Digit UPI PIN" maxlength="4" style="margin-bottom:8px;">
            </div>

            <button class="payment-btn" id="loan-disburse-btn" onclick="applyPersonalLoan()" style="width:100%; margin-top:4px; background:linear-gradient(135deg, #f59e0b, #d97706);">
                Disburse ₹2,00,000 Instantly
            </button>
        </div>
    `;
    modal.classList.add('active');
    activeLoanTenure = 12;
    updateLoanCalculation();
}

function setLoanTenure(months, btn) {
    activeLoanTenure = months;
    const pills = document.querySelectorAll('.tenure-pill');
    pills.forEach(p => p.classList.remove('active'));
    if (btn) btn.classList.add('active');
    const summary = document.getElementById('loan-tenure-summary');
    if (summary) summary.textContent = `${months} Months`;
    updateLoanCalculation();
}

function updateLoanCalculation() {
    const slider = document.getElementById('loan-slider');
    if (!slider) return;
    const amount = parseFloat(slider.value) || 200000;
    const tenure = activeLoanTenure || 12;

    const monthlyRate = 0.115 / 12;
    const emi = Math.round((amount * monthlyRate * Math.pow(1 + monthlyRate, tenure)) / (Math.pow(1 + monthlyRate, tenure) - 1));

    const amtDisplay = document.getElementById('loan-amt-display');
    const emiDisplay = document.getElementById('loan-emi-val');
    const btn = document.getElementById('loan-disburse-btn');

    if (amtDisplay) amtDisplay.textContent = `₹${amount.toLocaleString('en-IN')}`;
    if (emiDisplay) emiDisplay.textContent = `₹${emi.toLocaleString('en-IN')} / mo`;
    if (btn) btn.textContent = `Disburse ₹${amount.toLocaleString('en-IN')} Instantly`;
}

async function applyPersonalLoan() {
    const slider = document.getElementById('loan-slider');
    const amount = parseFloat(slider?.value) || 200000;
    const pin = document.getElementById('loan-pin')?.value.trim();

    if (!pin || pin.length !== 4) return alert('Please enter your 4-digit UPI PIN to confirm loan disbursal');

    const btn = document.getElementById('loan-disburse-btn');
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Processing Disbursal...';
    }

    try {
        const res = await fetch(`${API_URL}/credit/loan/apply`, {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({
                amount,
                tenureMonths: activeLoanTenure,
                pin
            })
        });
        const data = await res.json();
        if (data.success) {
            closeModal();
            showSuccess(amount, 'Personal Loan Disbursal (Direct Deposit)');
            loadBanks(); // Updates live balance
        } else {
            alert(data.error || 'Loan application failed');
            if (btn) {
                btn.disabled = false;
                btn.textContent = `Disburse ₹${amount.toLocaleString('en-IN')} Instantly`;
            }
        }
    } catch (err) {
        alert('Server error during loan disbursal');
        if (btn) {
            btn.disabled = false;
            btn.textContent = `Disburse ₹${amount.toLocaleString('en-IN')} Instantly`;
        }
    }
}

async function renderPocketMoneyModal(modalBody, modal) {
    modalBody.innerHTML = `<div style="text-align:center; padding:30px;"><i class="fas fa-spinner fa-spin" style="font-size:2rem; color:#db2777;"></i><p style="margin-top:10px; color:var(--text-secondary);">Loading Pocket Money status...</p></div>`;
    modal.classList.add('active');

    try {
        const res = await fetch(`${API_URL}/credit/status`, { headers: authHeaders() });
        const data = await res.json();
        const pm = data.pocketMoney || { active: false, balance: 0, allowance: 2000, dailyLimit: 500 };

        if (pm.active) {
            modalBody.innerHTML = `
                <div style="display:flex; flex-direction:column; gap:16px;">
                    <!-- Pocket Money Active Wallet Card -->
                    <div class="pocket-money-card">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                            <span style="font-weight:700; font-size:1.1rem; letter-spacing:0.5px;"><i class="fas fa-wallet" style="margin-right:6px;"></i> Pocket Money Sub-Wallet</span>
                            <span style="font-size:0.75rem; background:rgba(255,255,255,0.25); color:#fff; padding:2px 8px; border-radius:10px; font-weight:600;">ACTIVE</span>
                        </div>
                        <div style="font-size:0.8rem; color:rgba(255,255,255,0.85); margin-bottom:2px;">Wallet Balance</div>
                        <div style="font-size:2rem; font-weight:800; margin-bottom:15px;">₹${(pm.balance || 0).toLocaleString('en-IN')}.00</div>
                        <div style="background:rgba(0,0,0,0.15); border-radius:12px; padding:10px 14px; display:flex; justify-content:space-between; font-size:0.85rem;">
                            <span>Daily Limit Remaining</span>
                            <strong>₹${(pm.dailyLimit || 500).toLocaleString('en-IN')}</strong>
                        </div>
                    </div>

                    <!-- Allowance & Spend Stats -->
                    <div style="background:#f8fafc; border-radius:16px; padding:16px; border:1px solid var(--card-border);">
                        <div style="display:flex; justify-content:space-between; margin-bottom:8px; font-size:0.9rem;">
                            <span style="color:var(--text-secondary);">Monthly Allowance</span>
                            <strong style="color:var(--navy);">₹${(pm.allowance || 2000).toLocaleString('en-IN')}/mo</strong>
                        </div>
                        <div style="display:flex; justify-content:space-between; font-size:0.9rem;">
                            <span style="color:var(--text-secondary);">Auto Refill</span>
                            <strong style="color:#16a34a;">1st of Every Month</strong>
                        </div>
                    </div>

                    <div style="display:flex; gap:10px;">
                        <button class="payment-btn" style="flex:1; margin-top:0; background:linear-gradient(135deg, #ec4899, #db2777);" onclick="closeModal(); openModal('pay', 'Pay via Pocket Money')">
                            <i class="fas fa-paper-plane" style="margin-right:6px;"></i> Pay from Wallet
                        </button>
                        <button class="payment-btn" style="flex:1; margin-top:0; background:#f1f5f9; color:var(--navy); border:1px solid #cbd5e1;" onclick="renderPocketMoneySetupForm(document.getElementById('modal-body'))">
                            <i class="fas fa-sliders-h" style="margin-right:6px;"></i> Adjust Limit
                        </button>
                    </div>
                </div>
            `;
        } else {
            renderPocketMoneySetupForm(modalBody);
        }
    } catch (err) {
        modalBody.innerHTML = `<div style="text-align:center; color:var(--danger); padding:20px;">Failed to load Pocket Money. Please try again.</div>`;
    }
}

function renderPocketMoneySetupForm(modalBody) {
    modalBody.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:14px;">
            <!-- Intro Banner -->
            <div style="background:linear-gradient(135deg, rgba(236,72,153,0.12), rgba(219,39,119,0.05)); border-radius:14px; padding:14px; border:1px solid rgba(236,72,153,0.25);">
                <div style="font-weight:700; color:#be185d; font-size:0.95rem; margin-bottom:4px;">
                    <i class="fas fa-piggy-bank" style="margin-right:6px;"></i> Pay for it Yourself — Pocket Money
                </div>
                <p style="font-size:0.8rem; color:var(--text-secondary); margin:0;">
                    Your dedicated daily spending sub-wallet. Set a monthly allowance and daily limit so you never overspend or need payment links!
                </p>
            </div>

            <!-- Monthly Allowance -->
            <div>
                <label style="font-weight:600; color:var(--navy); font-size:0.85rem; margin-bottom:6px; display:block;">Monthly Allowance</label>
                <div class="pm-chips-row">
                    <button type="button" class="pm-chip" onclick="selectPmAllowance(1000, this)">₹1,000</button>
                    <button type="button" class="pm-chip active" onclick="selectPmAllowance(2000, this)">₹2,000</button>
                    <button type="button" class="pm-chip" onclick="selectPmAllowance(5000, this)">₹5,000</button>
                </div>
                <input type="number" id="pm-allowance-input" class="custom-input" value="2000" placeholder="Enter Monthly Allowance (₹)" style="margin-bottom:4px;">
            </div>

            <!-- Daily Spend Limit -->
            <div>
                <label style="font-weight:600; color:var(--navy); font-size:0.85rem; margin-bottom:6px; display:block;">Daily Spending Limit</label>
                <div class="pm-chips-row">
                    <button type="button" class="pm-chip" onclick="selectPmDaily(200, this)">₹200/day</button>
                    <button type="button" class="pm-chip active" onclick="selectPmDaily(500, this)">₹500/day</button>
                    <button type="button" class="pm-chip" onclick="selectPmDaily(1000, this)">₹1,000/day</button>
                </div>
                <input type="number" id="pm-dailylimit-input" class="custom-input" value="500" placeholder="Daily Spend Limit (₹)" style="margin-bottom:4px;">
            </div>

            <!-- Initial Load from Main Account -->
            <div>
                <label style="font-weight:600; color:var(--navy); font-size:0.85rem; margin-bottom:4px; display:block;">Initial Wallet Transfer from Bank (₹)</label>
                <input type="number" id="pm-initial-load" class="custom-input" value="500" placeholder="Amount to transfer now (₹)" style="margin-bottom:8px;">
            </div>

            <!-- 4-Digit UPI PIN -->
            <div>
                <label style="font-weight:600; font-size:0.85rem; color:var(--navy); margin-bottom:4px; display:block;">Enter 4-Digit UPI PIN</label>
                <input type="password" id="pm-pin" class="custom-input" placeholder="Enter 4-Digit UPI PIN" maxlength="4" style="margin-bottom:8px;">
            </div>

            <button class="payment-btn" id="pm-setup-btn" onclick="setupPocketMoney()" style="width:100%; margin-top:4px; background:linear-gradient(135deg, #ec4899, #db2777);">
                Activate Pocket Money Wallet
            </button>
        </div>
    `;
}

function selectPmAllowance(amt, btn) {
    const input = document.getElementById('pm-allowance-input');
    if (input) input.value = amt;
    const chips = btn.parentElement.querySelectorAll('.pm-chip');
    chips.forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
}

function selectPmDaily(amt, btn) {
    const input = document.getElementById('pm-dailylimit-input');
    if (input) input.value = amt;
    const chips = btn.parentElement.querySelectorAll('.pm-chip');
    chips.forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
}

async function setupPocketMoney() {
    const allowance = parseFloat(document.getElementById('pm-allowance-input')?.value) || 2000;
    const dailyLimit = parseFloat(document.getElementById('pm-dailylimit-input')?.value) || 500;
    const initialTransfer = parseFloat(document.getElementById('pm-initial-load')?.value) || 0;
    const pin = document.getElementById('pm-pin')?.value.trim();

    if (!pin || pin.length !== 4) return alert('Please enter your 4-digit UPI PIN');

    const btn = document.getElementById('pm-setup-btn');
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Setting up Pocket Money...';
    }

    try {
        const res = await fetch(`${API_URL}/credit/pocket-money/setup`, {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({ allowance, dailyLimit, initialTransfer, pin })
        });
        const data = await res.json();
        if (data.success) {
            showToast('🎉 Pocket Money Wallet Activated!');
            loadBanks(); // Refresh main balance
            const modal = document.getElementById('dynamic-modal');
            const modalBody = document.getElementById('modal-body');
            renderPocketMoneyModal(modalBody, modal);
        } else {
            alert(data.error || 'Failed to setup Pocket Money');
            if (btn) {
                btn.disabled = false;
                btn.textContent = 'Activate Pocket Money Wallet';
            }
        }
    } catch (err) {
        alert('Server error setting up Pocket Money');
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Activate Pocket Money Wallet';
        }
    }
}

// ================= PHONE CONTACT PICKER ================= //

async function pickPhoneContact() {
    const contactInput = document.getElementById('contact-input');

    // 1. Check if W3C Web Contact Picker API is available (Chrome on Android / Edge mobile)
    if ('contacts' in navigator && 'select' in navigator.contacts) {
        try {
            const props = ['name', 'tel'];
            const opts = { multiple: false };
            const contacts = await navigator.contacts.select(props, opts);

            if (contacts && contacts.length > 0) {
                const selected = contacts[0];
                const name = (selected.name && selected.name.length > 0) ? selected.name[0] : '';
                const tel = (selected.tel && selected.tel.length > 0) ? selected.tel[0] : '';

                // Extract 10-digit phone number if present
                const digits = tel.replace(/\D/g, '');
                const cleanPhone = digits.length >= 10 ? digits.slice(-10) : digits;
                const chosenTarget = cleanPhone || name || tel;

                if (chosenTarget) {
                    if (contactInput) {
                        contactInput.value = chosenTarget;
                    }
                    // Immediately open payment modal with the picked contact
                    openPaymentModal(chosenTarget, 'contact');
                    return;
                }
            }
        } catch (err) {
            console.warn('Native Contact Picker error/cancelled:', err);
            // If the user cancelled the native contact picker dialog, return silently
            if (err.name === 'AbortError') {
                return;
            }
            // For SecurityError, NotSupportedError or permission issues, fall back to in-app contact book
            showInAppContactPicker();
            return;
        }
    } else {
        // Fallback for desktop or browsers without native contact picker API
        showInAppContactPicker();
    }
}

async function pickPhoneContactForRecharge() {
    const phoneInput = document.getElementById('recharge-phone');

    if ('contacts' in navigator && 'select' in navigator.contacts) {
        try {
            const contacts = await navigator.contacts.select(['name', 'tel'], { multiple: false });
            if (contacts && contacts.length > 0) {
                const selected = contacts[0];
                const tel = (selected.tel && selected.tel.length > 0) ? selected.tel[0] : '';
                const digits = tel.replace(/\D/g, '');
                const cleanPhone = digits.length >= 10 ? digits.slice(-10) : digits;

                if (cleanPhone && phoneInput) {
                    phoneInput.value = cleanPhone;
                    onRechargePhoneInput(phoneInput);
                }
            }
        } catch (err) {
            console.warn('Recharge contact pick error/cancelled:', err);
        }
    } else {
        showToast('Native contacts not supported on this browser. Enter number manually.');
    }
}

async function showInAppContactPicker() {
    const modalTitle = document.getElementById('modal-title');
    const modalBody = document.getElementById('modal-body');
    if (!modalTitle || !modalBody) return;

    modalTitle.textContent = 'Select Contact';
    modalBody.innerHTML = `<div style="text-align:center; padding:25px;"><i class="fas fa-spinner fa-spin" style="font-size:1.6rem; color:var(--saffron);"></i><p style="margin-top:10px; color:var(--text-secondary); font-size:0.9rem;">Loading contacts...</p></div>`;

    try {
        const res = await fetch(`${API_URL}/contacts`, { headers: authHeaders() });
        const contacts = await res.json();

        let contactsHtml = '';
        if (Array.isArray(contacts) && contacts.length > 0) {
            contactsHtml = contacts.map(c => `
                <div class="inapp-contact-row" onclick="openPaymentModal('${c.name.replace(/'/g, "\\'")}', 'contact')" style="display:flex; align-items:center; gap:12px; padding:12px 14px; background:#fff; border:1px solid var(--card-border); border-radius:14px; cursor:pointer; margin-bottom:8px; transition:all 0.2s;">
                    <div style="width:40px; height:40px; border-radius:50%; background:${c.color || 'var(--navy)'}; color:#fff; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:1rem;">
                        ${c.initials || c.name.charAt(0)}
                    </div>
                    <div style="flex:1;">
                        <h4 style="margin:0; font-size:0.95rem; color:var(--navy); font-weight:600;">${c.name}</h4>
                        <p style="margin:2px 0 0; font-size:0.75rem; color:var(--text-secondary);">Arya Pay Verified</p>
                    </div>
                    <span style="font-size:0.8rem; color:var(--saffron); font-weight:600;">Pay <i class="fas fa-chevron-right" style="font-size:0.7rem;"></i></span>
                </div>
            `).join('');
        } else {
            contactsHtml = `<p style="text-align:center; color:var(--text-secondary); padding:20px;">No saved contacts found.</p>`;
        }

        modalBody.innerHTML = `
            <div style="display:flex; flex-direction:column; gap:10px;">
                <input type="text" class="custom-input" placeholder="Search contacts..." oninput="filterInAppContacts(this.value)" style="margin-bottom:6px;">
                <div id="in-app-contacts-list" style="max-height:280px; overflow-y:auto;">
                    ${contactsHtml}
                </div>
                <button class="payment-btn" style="background:#f1f5f9; color:var(--navy); border:1px solid #cbd5e1; margin-top:4px;" onclick="openModal('contacts', 'Pay anyone')">
                    Back to Manual Input
                </button>
            </div>
        `;
    } catch (err) {
        modalBody.innerHTML = `<p style="text-align:center; color:var(--danger); padding:20px;">Failed to load contacts.</p>`;
    }
}

function filterInAppContacts(query) {
    const list = document.getElementById('in-app-contacts-list');
    if (!list) return;
    const q = (query || '').toLowerCase();
    const rows = list.querySelectorAll('.inapp-contact-row');
    rows.forEach(r => {
        const text = r.textContent.toLowerCase();
        r.style.display = text.includes(q) ? 'flex' : 'none';
    });
}



