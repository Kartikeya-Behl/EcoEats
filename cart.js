let cart = [];
let discountAmount = 0;
let userLat = null, userLng = null;
let savedAddresses = [];
let searchTimeout = null;
let selectedPayment = 'COD';
const token = localStorage.getItem('ecoeats_token');

document.addEventListener('DOMContentLoaded', () => {
    if (!token) { window.location.href = 'login.html'; return; }
    const saved = localStorage.getItem('ecoeats_cart');
    if (saved) cart = JSON.parse(saved);

    // Check if returning from a PhonePe payment redirect
    checkPaymentReturn();

    renderCart();
    loadSavedAddresses();
});

// ====================================================================
// PAYMENT RETURN HANDLER — runs when user is redirected back from PhonePe
// ====================================================================
function checkPaymentReturn() {
    const params = new URLSearchParams(window.location.search);
    const paymentStatus = params.get('payment');

    if (!paymentStatus) return;

    const banner = document.getElementById('payment-result-banner');
    const orderId = params.get('order');
    const txn = params.get('txn');
    const reason = params.get('reason');

    if (paymentStatus === 'success' && orderId) {
        // Payment successful — clear cart and show success
        cart = [];
        localStorage.setItem('ecoeats_cart', '[]');

        banner.innerHTML = `
            <div class="payment-result-banner success">
                <i class="fa-solid fa-circle-check"></i>
                <div>
                    <strong>Payment Successful!</strong>
                    <p style="margin:0; font-size:0.88rem;">Order #${orderId} placed via UPI. Redirecting to tracking...</p>
                </div>
            </div>
        `;

        // Auto-redirect to tracking page after 2 seconds
        setTimeout(() => {
            window.location.href = `track.html?order=${orderId}`;
        }, 2000);

    } else if (paymentStatus === 'pending') {
        banner.innerHTML = `
            <div class="payment-result-banner pending">
                <i class="fa-solid fa-clock"></i>
                <div>
                    <strong>Payment Pending</strong>
                    <p style="margin:0; font-size:0.88rem;">Your payment is being processed. We'll update you once confirmed.${txn ? ' Txn: ' + txn : ''}</p>
                </div>
            </div>
        `;

        // Poll for status if we have a txnId
        if (txn) pollPaymentStatus(txn);

    } else if (paymentStatus === 'failed') {
        const reasonText = reason ? reason.replace(/_/g, ' ') : 'unknown error';
        banner.innerHTML = `
            <div class="payment-result-banner failed">
                <i class="fa-solid fa-circle-xmark"></i>
                <div>
                    <strong>Payment Failed</strong>
                    <p style="margin:0; font-size:0.88rem;">Reason: ${reasonText}. Please try again or use Cash on Delivery.</p>
                </div>
            </div>
        `;
    }

    // Clean the URL params without reloading
    window.history.replaceState({}, document.title, 'cart.html');
}

// Poll payment status for pending payments
async function pollPaymentStatus(txnId) {
    let attempts = 0;
    const maxAttempts = 15; // poll for ~30 seconds

    const poll = setInterval(async () => {
        attempts++;
        if (attempts >= maxAttempts) {
            clearInterval(poll);
            return;
        }
        try {
            const res = await fetch(`http://localhost:5000/api/payments/status/${txnId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();

            if (data.status === 'COMPLETED') {
                clearInterval(poll);
                const banner = document.getElementById('payment-result-banner');
                banner.innerHTML = `
                    <div class="payment-result-banner success">
                        <i class="fa-solid fa-circle-check"></i>
                        <div>
                            <strong>Payment Confirmed!</strong>
                            <p style="margin:0; font-size:0.88rem;">Your UPI payment was verified. Your order is on its way!</p>
                        </div>
                    </div>
                `;
                cart = [];
                localStorage.setItem('ecoeats_cart', '[]');
                renderCart();
            } else if (data.status === 'FAILED') {
                clearInterval(poll);
            }
        } catch(e) { /* silent */ }
    }, 2000);
}

// ====================================================================
// CART RENDER
// ====================================================================
function renderCart() {
    const container = document.getElementById('cart-items');
    if (cart.length === 0) {
        container.innerHTML = '<p style="text-align:center; color:#717171;">Your cart is empty.</p>';
        document.getElementById('checkout-btn').style.display = 'none';
        document.getElementById('restaurant-info').style.display = 'none';
        return;
    }

    // Show restaurant info
    const restInfo = document.getElementById('restaurant-info');
    restInfo.style.display = 'block';
    restInfo.innerHTML = `<i class="fa-solid fa-utensils" style="color:var(--primary-green);"></i> Ordering from <strong>${cart[0].kitchenName}</strong> &bull; ${cart[0].kitchenLocation}`;

    let html = '';
    let subtotal = 0;
    cart.forEach((item, i) => {
        subtotal += item.price * item.cartQty;
        html += `<div class="cart-page-item">
            <div>
                <h4 style="margin:0 0 0.2rem;">${item.name}</h4>
                <span style="color:#717171; font-size:0.9rem;">₹${item.price} × ${item.cartQty}</span>
            </div>
            <div style="display:flex; align-items:center; gap:0.8rem;">
                <button class="qty-btn" onclick="changeQty(${i},-1)">−</button>
                <strong>${item.cartQty}</strong>
                <button class="qty-btn" onclick="changeQty(${i},1)">+</button>
                <strong style="min-width:50px; text-align:right;">₹${item.price * item.cartQty}</strong>
                <button class="btn btn-outline" style="padding:0.2rem 0.5rem;" onclick="removeItem(${i})"><i class="fa-solid fa-trash"></i></button>
            </div>
        </div>`;
    });
    container.innerHTML = html;
    updateTotals(subtotal);
}

function changeQty(i, delta) {
    cart[i].cartQty += delta;
    if (cart[i].cartQty <= 0) cart.splice(i, 1);
    localStorage.setItem('ecoeats_cart', JSON.stringify(cart));
    discountAmount = 0;
    document.getElementById('discount-msg').innerText = '';
    renderCart();
}

function removeItem(i) {
    cart.splice(i, 1);
    localStorage.setItem('ecoeats_cart', JSON.stringify(cart));
    discountAmount = 0;
    document.getElementById('discount-msg').innerText = '';
    renderCart();
}

// === COUPON SYSTEM ===
async function applyCoupon() {
    const code = document.getElementById('coupon-code').value.toUpperCase().trim();
    const msg = document.getElementById('discount-msg');
    const subtotal = cart.reduce((s, i) => s + i.price * i.cartQty, 0);

    if (code === 'WELCOME50') {
        // Check if first-time user (no previous orders)
        try {
            const res = await fetch('http://localhost:5000/api/orders/my-orders', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const orders = await res.json();
            if (orders.length > 0) {
                discountAmount = 0;
                msg.innerText = '❌ WELCOME50 is only for first-time users';
                msg.style.color = 'red';
                renderCart();
                return;
            }
        } catch(e) {}
        discountAmount = Math.round(subtotal * 0.5);
        msg.innerText = `✅ WELCOME50 Applied: 50% off (−₹${discountAmount})`;
        msg.style.color = 'var(--primary-green)';

    } else if (code === 'SUPER500') {
        if (subtotal < 500) {
            discountAmount = 0;
            msg.innerText = `❌ SUPER500 requires minimum order of ₹500 (your cart: ₹${subtotal})`;
            msg.style.color = 'red';
            renderCart();
            return;
        }
        discountAmount = 100;
        msg.innerText = '✅ SUPER500 Applied: ₹100 off!';
        msg.style.color = 'var(--primary-green)';

    } else if (code === 'MEGA1000') {
        if (subtotal < 1000) {
            discountAmount = 0;
            msg.innerText = `❌ MEGA1000 requires minimum order of ₹1000 (your cart: ₹${subtotal})`;
            msg.style.color = 'red';
            renderCart();
            return;
        }
        discountAmount = 250;
        msg.innerText = '✅ MEGA1000 Applied: ₹250 off!';
        msg.style.color = 'var(--primary-green)';

    } else if (code === 'ORDER100') {
        // 50% off on every 100th order (100, 200, 300, ...)
        try {
            const res = await fetch('http://localhost:5000/api/orders/my-orders', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const orders = await res.json();
            const nextOrderNum = orders.length + 1;
            if (nextOrderNum % 100 !== 0) {
                const remaining = 100 - (nextOrderNum % 100);
                discountAmount = 0;
                msg.innerText = `❌ ORDER100 is for every 100th order. You need ${remaining} more order(s) to unlock this.`;
                msg.style.color = 'red';
                renderCart();
                return;
            }
        } catch(e) {}
        discountAmount = Math.round(subtotal * 0.5);
        msg.innerText = `🎉 ORDER100 Applied: 50% off your milestone order! (−₹${discountAmount})`;
        msg.style.color = 'var(--primary-green)';

    } else if (code === 'ORDER500') {
        // 100% off (free) on every 500th order (500, 1000, ...)
        try {
            const res = await fetch('http://localhost:5000/api/orders/my-orders', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const orders = await res.json();
            const nextOrderNum = orders.length + 1;
            if (nextOrderNum % 500 !== 0) {
                const remaining = 500 - (nextOrderNum % 500);
                discountAmount = 0;
                msg.innerText = `❌ ORDER500 is for every 500th order. You need ${remaining} more order(s) to unlock this.`;
                msg.style.color = 'red';
                renderCart();
                return;
            }
        } catch(e) {}
        discountAmount = subtotal; // 100% off = FREE
        msg.innerText = `🎁 ORDER500 Applied: Your order is completely FREE! (−₹${discountAmount})`;
        msg.style.color = 'var(--primary-green)';

    } else {
        discountAmount = 0;
        msg.innerText = '❌ Invalid coupon code';
        msg.style.color = 'red';
    }
    renderCart();
}

function updateTotals(subtotal) {
    const total = Math.max(0, subtotal - discountAmount);
    document.getElementById('subtotal').innerText = `₹${subtotal}`;
    document.getElementById('discount-amount').innerText = `-₹${discountAmount}`;
    document.getElementById('final-total').innerText = `₹${total}`;
}

// === SAVED ADDRESSES ===
async function loadSavedAddresses() {
    try {
        const res = await fetch('http://localhost:5000/api/addresses', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        savedAddresses = await res.json();
        const select = document.getElementById('address-select');
        // Clear existing options except first two (placeholder + custom)
        while (select.options.length > 2) select.remove(1);
        savedAddresses.forEach(a => {
            const opt = document.createElement('option');
            opt.value = JSON.stringify({ address: a.address, lat: a.lat, lng: a.lng });
            opt.innerText = `${a.label}: ${a.address}`;
            select.insertBefore(opt, select.options[select.options.length - 1]);
        });
    } catch (e) { console.error(e); }
}

function handleAddressChange() {
    const val = document.getElementById('address-select').value;
    if (val === 'custom') {
        document.getElementById('address-search-box').style.display = 'block';
        userLat = null; userLng = null;
        document.getElementById('eta-box').style.display = 'none';
    } else if (val) {
        document.getElementById('address-search-box').style.display = 'none';
        const parsed = JSON.parse(val);
        userLat = parsed.lat; userLng = parsed.lng;
        showEta();
    }
}

// === REAL ADDRESS SEARCH (Nominatim/OpenStreetMap) ===
function searchAddress() {
    clearTimeout(searchTimeout);
    const query = document.getElementById('address-input').value.trim();
    if (query.length < 3) {
        document.getElementById('address-results').innerHTML = '';
        return;
    }
    searchTimeout = setTimeout(async () => {
        try {
            const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=in&limit=5`, {
                headers: { 'Accept-Language': 'en' }
            });
            const results = await res.json();
            const container = document.getElementById('address-results');
            if (results.length === 0) {
                container.innerHTML = '<div class="addr-result">No results found</div>';
                return;
            }
            container.innerHTML = results.map(r =>
                `<div class="addr-result" onclick="selectAddress('${r.display_name.replace(/'/g, "\\'")}', ${r.lat}, ${r.lon})">
                    <i class="fa-solid fa-location-dot" style="color:var(--primary-green);"></i> ${r.display_name}
                </div>`
            ).join('');
        } catch (e) { console.error(e); }
    }, 400);
}

function selectAddress(name, lat, lng) {
    document.getElementById('address-input').value = name;
    document.getElementById('address-results').innerHTML = '';
    userLat = parseFloat(lat);
    userLng = parseFloat(lng);
    showEta();
}

function useMyLocation() {
    const status = document.getElementById('location-status');
    status.innerText = 'Detecting your location...';
    if (!navigator.geolocation) { status.innerText = 'Geolocation not supported.'; return; }
    navigator.geolocation.getCurrentPosition(
        async (pos) => {
            userLat = pos.coords.latitude;
            userLng = pos.coords.longitude;
            status.innerText = `📍 Location detected!`;
            // Reverse geocode to get address name
            try {
                const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${userLat}&lon=${userLng}`);
                const data = await res.json();
                document.getElementById('address-input').value = data.display_name || `${userLat.toFixed(4)}, ${userLng.toFixed(4)}`;
                document.getElementById('address-search-box').style.display = 'block';
                document.getElementById('address-select').value = 'custom';
            } catch (e) {
                document.getElementById('address-input').value = `${userLat.toFixed(4)}, ${userLng.toFixed(4)}`;
            }
            showEta();
        },
        () => { status.innerText = '❌ Location access denied.'; }
    );
}

function showEta() {
    if (!userLat || !userLng || cart.length === 0) return;
    const kLat = cart[0].kitchenLat;
    const kLng = cart[0].kitchenLng;
    const R = 6371;
    const dLat = (userLat - kLat) * Math.PI / 180;
    const dLng = (userLng - kLng) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 + Math.cos(kLat*Math.PI/180)*Math.cos(userLat*Math.PI/180)*Math.sin(dLng/2)**2;
    const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const mins = 10 + Math.ceil(dist * 3);
    document.getElementById('eta-time').innerText = `~${mins} minutes`;
    document.getElementById('eta-box').style.display = 'flex';
}

// ====================================================================
// PAYMENT OVERLAY HELPERS
// ====================================================================
function showPaymentOverlay() {
    const overlay = document.getElementById('payment-overlay');
    const modal = document.getElementById('payment-modal');

    modal.innerHTML = `
        <div class="phonepe-badge">
            <i class="fa-solid fa-mobile-screen-button"></i>
            UPI Payment via PhonePe
        </div>
        <h3>Processing Payment</h3>
        <p>Please wait while we set up your payment...</p>
        <div class="payment-steps">
            <div class="payment-step active" id="step-init">
                <div class="step-icon"><i class="fa-solid fa-link"></i></div>
                <div class="step-text">
                    <strong>Initiating Payment</strong>
                    <span>Connecting to PhonePe...</span>
                </div>
            </div>
            <div class="payment-step" id="step-redirect">
                <div class="step-icon"><i class="fa-solid fa-arrow-right-from-bracket"></i></div>
                <div class="step-text">
                    <strong>Redirecting to PhonePe</strong>
                    <span>You'll complete the payment there</span>
                </div>
            </div>
            <div class="payment-step" id="step-verify">
                <div class="step-icon"><i class="fa-solid fa-shield-halved"></i></div>
                <div class="step-text">
                    <strong>Verifying Payment</strong>
                    <span>Confirming with your bank</span>
                </div>
            </div>
        </div>
        <div class="payment-spinner"></div>
    `;

    overlay.classList.add('active');
}

function updatePaymentStep(stepId, status) {
    const step = document.getElementById(stepId);
    if (!step) return;
    step.className = `payment-step ${status}`;
}

function showPaymentError(message) {
    const modal = document.getElementById('payment-modal');
    modal.innerHTML = `
        <div class="payment-fail-mark"><i class="fa-solid fa-xmark"></i></div>
        <h3>Payment Failed</h3>
        <p>${message}</p>
        <button class="btn btn-primary" onclick="hidePaymentOverlay()">
            <i class="fa-solid fa-arrow-left"></i> Back to Cart
        </button>
    `;
}

function hidePaymentOverlay() {
    document.getElementById('payment-overlay').classList.remove('active');
}

// ====================================================================
// CHECKOUT — handles both COD and UPI
// ====================================================================
async function processCheckout() {
    if (cart.length === 0) return alert('Cart is empty!');

    const select = document.getElementById('address-select');
    let address = '';
    if (select.value === 'custom' || select.value === '') {
        address = document.getElementById('address-input').value;
    } else {
        const parsed = JSON.parse(select.value);
        address = parsed.address;
    }
    if (!address) return alert('Please search and select a delivery address.');
    if (!userLat || !userLng) return alert('Please select a valid address with location.');

    const subtotal = cart.reduce((s, i) => s + i.price * i.cartQty, 0);
    const originalTotal = cart.reduce((s, i) => s + (i.originalPrice || i.price) * i.cartQty, 0);
    const finalPrice = Math.max(0, subtotal - discountAmount);

    // ========== UPI FLOW ==========
    if (selectedPayment === 'UPI') {
        if (finalPrice <= 0) {
            return alert('Cannot process UPI payment for ₹0. Use Cash on Delivery instead.');
        }

        showPaymentOverlay();

        try {
            // Step 1: Initiate payment
            const res = await fetch('http://localhost:5000/api/payments/initiate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({
                    items: cart.map(c => ({ id: c.id, quantity: c.cartQty })),
                    total_price: finalPrice,
                    original_total: originalTotal,
                    delivery_address: address,
                    user_lat: userLat,
                    user_lng: userLng
                })
            });

            const data = await res.json();

            if (!res.ok) {
                showPaymentError(data.error || 'Failed to initiate payment. Please try again.');
                return;
            }

            if (data.success && data.redirectUrl) {
                // Step 1 done, Step 2 active
                updatePaymentStep('step-init', 'done');
                updatePaymentStep('step-redirect', 'active');

                // Save the transaction ID for potential status polling
                localStorage.setItem('ecoeats_pending_txn', data.transactionId);

                // Small delay for the user to see the transition, then redirect
                setTimeout(() => {
                    window.location.href = data.redirectUrl;
                }, 1200);
            } else {
                showPaymentError(data.error || 'Unexpected response from payment gateway.');
            }

        } catch (err) {
            console.error('Payment initiation error:', err);
            showPaymentError('Could not connect to payment server. Please check your connection.');
        }

        return;
    }

    // ========== COD FLOW (unchanged) ==========
    try {
        const res = await fetch('http://localhost:5000/api/orders/checkout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({
                items: cart.map(c => ({ id: c.id, quantity: c.cartQty })),
                total_price: finalPrice,
                original_total: originalTotal,
                delivery_address: address,
                user_lat: userLat, user_lng: userLng,
                payment_method: 'COD'
            })
        });
        const data = await res.json();
        if (res.ok) {
            cart = [];
            localStorage.setItem('ecoeats_cart', '[]');
            window.location.href = `track.html?order=${data.order_id}`;
        } else {
            alert('Checkout failed: ' + data.error);
        }
    } catch (err) {
        console.error(err);
        alert('Server error during checkout.');
    }
}

// ====================================================================
// PAYMENT METHOD TOGGLE
// ====================================================================
function selectPayment(method) {
    selectedPayment = method;
    document.getElementById('pay-cod').classList.toggle('selected', method === 'COD');
    document.getElementById('pay-upi').classList.toggle('selected', method === 'UPI');
    // Update check icons
    document.querySelector('#pay-cod .pay-check').className = method === 'COD' ? 'fa-solid fa-circle-check pay-check' : 'fa-regular fa-circle pay-check';
    document.querySelector('#pay-upi .pay-check').className = method === 'UPI' ? 'fa-solid fa-circle-check pay-check' : 'fa-regular fa-circle pay-check';
    document.querySelector('#pay-cod .pay-check').style.color = method === 'COD' ? 'var(--primary-green)' : 'var(--border-color)';
    document.querySelector('#pay-upi .pay-check').style.color = method === 'UPI' ? 'var(--primary-green)' : 'var(--border-color)';

    // Update checkout button text
    const btn = document.getElementById('checkout-btn');
    if (method === 'UPI') {
        btn.innerHTML = '<i class="fa-solid fa-mobile-screen-button"></i> Pay with UPI';
    } else {
        btn.innerHTML = '<i class="fa-solid fa-bag-shopping"></i> Place Order';
    }
}
