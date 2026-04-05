let map, riderMarker, trackingInterval;

document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('ecoeats_token');
    if (!token) { window.location.href = 'login.html'; return; }

    const params = new URLSearchParams(window.location.search);
    const orderId = params.get('order');

    if (orderId) {
        fetchOrder(orderId, token);
    } else {
        fetchLatestOrder(token);
    }
});

async function fetchOrder(orderId, token) {
    try {
        const res = await fetch(`http://localhost:5000/api/orders/${orderId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error();
        const order = await res.json();
        renderTracking(order);
    } catch (err) {
        document.getElementById('no-order').style.display = 'block';
    }
}

async function fetchLatestOrder(token) {
    try {
        const res = await fetch('http://localhost:5000/api/orders/my-orders', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error();
        const orders = await res.json();
        if (orders.length === 0) {
            document.getElementById('no-order').style.display = 'block';
            return;
        }
        renderTracking(orders[0]);
    } catch (err) {
        document.getElementById('no-order').style.display = 'block';
    }
}

function renderTracking(order) {
    document.getElementById('order-content').style.display = 'block';
    document.getElementById('no-order').style.display = 'none';
    document.getElementById('track-address').innerText = order.delivery_address;

    const itemsHtml = order.items.map(i => `<span style="color:var(--text-secondary); font-size:0.9rem;">${i.quantity || 1}x Item #${i.id}</span>`).join(' &bull; ');
    document.getElementById('track-items').innerHTML = `<p>${itemsHtml}</p><p style="margin-top:0.5rem; font-weight:600;">Total: ₹${Math.round(order.total_price)}</p>`;

    // Payment method
    const isUPI = order.payment_method && order.payment_method.includes('UPI');
    const payIcon = isUPI ? 'fa-mobile-screen-button' : 'fa-money-bill-wave';
    const payColor = isUPI ? '#5C2D91' : '#2E7D32';
    const payLabel = isUPI ? 'UPI (PhonePe)' : 'Cash on Delivery';
    document.getElementById('track-payment').innerHTML = `<i class="fa-solid ${payIcon}" style="color:${payColor};"></i> Payment: <strong>${payLabel}</strong>`;

    // Driver info
    if (order.driver_name) {
        document.getElementById('driver-card').style.display = 'block';
        document.getElementById('driver-name').innerText = order.driver_name;
        document.getElementById('driver-avatar').innerText = order.driver_name.charAt(0).toUpperCase();
        document.getElementById('driver-phone-text').innerText = order.driver_phone;
        document.getElementById('driver-call').href = `tel:${order.driver_phone.replace(/\s/g, '')}`;
    }

    // Use exact coordinates from the order
    const kLat = order.kitchen_lat;
    const kLng = order.kitchen_lng;
    const uLat = order.user_lat;
    const uLng = order.user_lng;

    if (!kLat || !uLat) {
        document.getElementById('map').innerHTML = '<p style="text-align:center; padding:2rem;">Map data unavailable</p>';
        return;
    }

    // Init Leaflet map
    map = L.map('map').setView([(kLat + uLat) / 2, (kLng + uLng) / 2], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    // Restaurant marker
    const restaurantIcon = L.divIcon({
        html: '<div style="background:#FF5C00;color:#fff;width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px;box-shadow:0 2px 8px rgba(0,0,0,0.3);"><i class="fa-solid fa-utensils"></i></div>',
        iconSize: [36, 36], className: ''
    });
    L.marker([kLat, kLng], { icon: restaurantIcon }).addTo(map).bindPopup('Restaurant');

    // User location marker
    const homeIcon = L.divIcon({
        html: '<div style="background:#00B74A;color:#fff;width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px;box-shadow:0 2px 8px rgba(0,0,0,0.3);"><i class="fa-solid fa-house"></i></div>',
        iconSize: [36, 36], className: ''
    });
    L.marker([uLat, uLng], { icon: homeIcon }).addTo(map).bindPopup('Your Location');

    // Route line
    L.polyline([[kLat, kLng], [uLat, uLng]], {
        color: '#00B74A', weight: 4, dashArray: '10, 8', opacity: 0.8
    }).addTo(map);

    // Rider marker — STARTS at restaurant
    const riderIcon = L.divIcon({
        html: '<div style="background:#1A1A1A;color:#FFB000;width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:18px;box-shadow:0 3px 12px rgba(0,0,0,0.4);border:2px solid #FFB000;"><i class="fa-solid fa-motorcycle"></i></div>',
        iconSize: [40, 40], className: ''
    });
    riderMarker = L.marker([kLat, kLng], { icon: riderIcon, zIndexOffset: 1000 }).addTo(map).bindPopup('Delivery Rider');

    // Fit map to show both markers with padding
    map.fitBounds([[kLat, kLng], [uLat, uLng]], { padding: [60, 60] });

    // Start animation
    startAnimation(order, kLat, kLng, uLat, uLng);
}

function startAnimation(order, kLat, kLng, uLat, uLng) {
    const orderTime = new Date(order.order_time).getTime();
    const deliveryTime = new Date(order.estimated_delivery_time).getTime();
    const totalDuration = deliveryTime - orderTime;
    // Prep = first 30% of time, rider moves during remaining 70%
    const prepEnd = orderTime + totalDuration * 0.3;

    if (trackingInterval) clearInterval(trackingInterval);

    function tick() {
        const now = Date.now();
        const remaining = deliveryTime - now;

        // === STEPPER ===
        if (remaining <= 0) {
            activateSteps(['step-confirmed', 'step-preparing', 'step-onway', 'step-delivered']);
            document.getElementById('track-eta').innerText = 'Delivered! 🎉';
            riderMarker.setLatLng([uLat, uLng]);
            clearInterval(trackingInterval);
            // Show review card
            if (order.kitchen_id) showReviewCard(order.kitchen_name || 'this restaurant', order.kitchen_id, order.id);
            return;
        }

        const elapsed = now - orderTime;
        if (now >= prepEnd + (totalDuration * 0.2)) {
            activateSteps(['step-confirmed', 'step-preparing', 'step-onway']);
        } else if (now >= prepEnd) {
            activateSteps(['step-confirmed', 'step-preparing']);
        } else {
            activateSteps(['step-confirmed']);
        }

        // === COUNTDOWN ===
        const mins = Math.floor(remaining / 60000);
        const secs = Math.floor((remaining % 60000) / 1000);
        document.getElementById('track-eta').innerText = `${mins}:${secs < 10 ? '0' : ''}${secs}`;

        // === RIDER MOVEMENT ===
        // Rider starts moving only after prep phase ends
        if (now > prepEnd) {
            const travelTotal = deliveryTime - prepEnd;
            const travelElapsed = now - prepEnd;
            const progress = Math.min(travelElapsed / travelTotal, 1);

            const curLat = kLat + (uLat - kLat) * progress;
            const curLng = kLng + (uLng - kLng) * progress;
            riderMarker.setLatLng([curLat, curLng]);
        }
    }

    // Run immediately, then every second
    tick();
    trackingInterval = setInterval(tick, 1000);
}

function activateSteps(activeIds) {
    ['step-confirmed', 'step-preparing', 'step-onway', 'step-delivered'].forEach(id => {
        document.getElementById(id).classList.remove('active');
    });
    activeIds.forEach(id => document.getElementById(id).classList.add('active'));
}

// === DARK MODE ===
function initDarkMode() {
    if (localStorage.getItem('ecoeats_dark') === '1') document.body.classList.add('dark-mode');
}
initDarkMode();

// === REVIEWS ===
let selectedRating = 0;
let currentOrderKitchenId = null;
let currentOrderId = null;

function setRating(val) {
    selectedRating = val;
    document.querySelectorAll('#star-rating .star').forEach((s, i) => {
        s.className = i < val ? 'star filled' : 'star';
    });
}

function showReviewCard(kitchenName, kitchenId, orderId) {
    currentOrderKitchenId = kitchenId;
    currentOrderId = orderId;
    document.getElementById('review-kitchen-name').innerText = kitchenName;
    document.getElementById('review-card').style.display = 'block';
}

async function submitReview() {
    if (!selectedRating) return alert('Please select a star rating.');
    const token = localStorage.getItem('ecoeats_token');
    if (!token) return alert('Please log in to submit a review.');
    const comment = document.getElementById('review-comment').value;
    try {
        const res = await fetch('http://localhost:5000/api/reviews', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ kitchen_id: currentOrderKitchenId, order_id: currentOrderId, rating: selectedRating, comment })
        });
        const data = await res.json();
        const msg = document.getElementById('review-msg');
        if (res.ok) {
            msg.style.color = '#2E7D32';
            msg.innerText = '✅ Thank you for your review!';
            document.querySelector('#review-card button').style.display = 'none';
        } else {
            msg.style.color = '#D32F2F';
            msg.innerText = data.error || 'Could not submit review.';
        }
    } catch(e) { alert('Server error.'); }
}
