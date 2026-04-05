document.addEventListener('DOMContentLoaded', () => {
    fetchSurplusDeals();
    fetchCuisines();
    fetchFeaturedKitchens();
    checkAuth();
    loadCart();
    setupSearch();
    initDarkMode();
    startOrderStatusPolling();
});

let allDeals = {};
let allItems = [];
let activeCuisine = null;
let activeVegFilter = 'all';
let myFavorites = new Set();

async function fetchFeaturedKitchens() {
    try {
        const res = await fetch('http://localhost:5000/api/kitchens');
        if (!res.ok) return;
        const kitchens = await res.json();
        const grid = document.getElementById('featured-kitchens-grid');
        if (!grid) return;
        
        let html = '';
        const images = [
            'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=600&q=80', // North Indian
            'https://images.unsplash.com/photo-1579871494447-9811cf80d66c?w=600&q=80', // Sushi
            'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=600&q=80', // Pizza
            'https://images.unsplash.com/photo-1559314809-0d155014e29e?w=600&q=80', // Thai
            'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600&q=80', // Burger
            'https://images.unsplash.com/photo-1551024601-bec78aea704b?w=600&q=80', // Pastry
            'https://images.unsplash.com/photo-1585032226651-759b368d7246?w=600&q=80', // Noodles
            'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=600&q=80', // Idli (works)
            'https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?w=600&q=80', // Kebabs
            'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=600&q=80'  // Healthy bowl
        ];

        kitchens.forEach((k, idx) => {
            const dealsCount = Math.floor(Math.random() * 5) + 3;
            const rating = (4.0 + Math.random()).toFixed(1);
            
            html += `
                <a href="kitchen.html?id=${k.id}" style="text-decoration:none; color:inherit;">
                <div class="kitchen-card" style="cursor:pointer;">
                    <div class="kitchen-image" style="background-image: url('${images[idx % images.length]}');">
                        <div class="badge deal-badge">${dealsCount} Deals</div>
                    </div>
                    <div class="kitchen-details">
                        <h3 class="kitchen-card-title">${k.name}</h3>
                        <p class="kitchen-cuisine">${k.cuisine}</p>
                        <div class="kitchen-meta">
                            <span class="kitchen-rating"><i class="fa-solid fa-star color-orange"></i> ${rating}</span>
                            <span class="kitchen-location"><i class="fa-solid fa-location-dot"></i> ${k.location.split(',')[0]}</span>
                        </div>
                    </div>
                </div>
                </a>
            `;
        });
        grid.innerHTML = html;
    } catch (e) {
        console.error(e);
    }
}

async function fetchSurplusDeals(cuisineFilter) {
    try {
        const response = await fetch('http://localhost:5000/api/surplus');
        if (!response.ok) throw new Error('Failed to fetch surplus deals');
        const items = await response.json();
        allItems = items;
        items.forEach(item => { allDeals[item.id] = item; });

        // Load favorites if logged in
        const token = localStorage.getItem('ecoeats_token');
        if (token) {
            try {
                const fr = await fetch('http://localhost:5000/api/favorites', { headers: { 'Authorization': `Bearer ${token}` } });
                const favs = await fr.json();
                myFavorites = new Set(favs.map(f => f.item_id));
            } catch(e) {}
        }

        applyFilters();
    } catch (error) {
        console.error('Error fetching data:', error);
    }
}

function renderItems(items) {
    const standardGrid = document.getElementById('standard-surplus-grid');
    const flashGrid = document.getElementById('flash-surplus-grid');

    if(standardGrid) standardGrid.innerHTML = '';
    if(flashGrid) flashGrid.innerHTML = '';

    if (items.length === 0) {
        if (standardGrid) standardGrid.innerHTML = '<p style="text-align:center; color:var(--text-secondary); grid-column:1/-1; padding:2rem;">No deals found</p>';
        return;
    }

    items.forEach(item => {
        const cardHTML = buildCardHTML(item);
        if (item.discount_percentage >= 40 && flashGrid) {
            flashGrid.innerHTML += cardHTML;
        } else if (standardGrid) {
            standardGrid.innerHTML += cardHTML;
        }
    });

    if (standardGrid && standardGrid.children.length === 0) {
        standardGrid.parentElement.style.display = 'none';
    } else if (standardGrid) {
        standardGrid.parentElement.style.display = '';
    }
    if (flashGrid && flashGrid.children.length === 0) {
        flashGrid.parentElement.style.display = 'none';
    } else if (flashGrid) {
        flashGrid.parentElement.style.display = '';
    }
}

function buildCardHTML(item) {
    const now = new Date();
    const closingTime = new Date(item.closing_time);
    const diffMs = closingTime - now;

    let timeLeftStr = 'Closed';
    let isUrgent = false;

    if (diffMs > 0) {
        const diffMins = Math.floor(diffMs / 60000);
        const hours = Math.floor(diffMins / 60);
        const mins = diffMins % 60;
        if (hours > 0) {
            timeLeftStr = `${hours}h ${mins}m left`;
        } else {
            timeLeftStr = `${mins}m left`;
            isUrgent = true;
        }
    }

    const lowStock = item.quantity <= 2;
    const isVeg = item.is_veg === 1;
    const isFaved = myFavorites.has(item.id);

    return `
        <div class="food-card" style="position:relative;">
            <div class="food-image" style="background-image: url('${item.image_url}');">
                <div class="badge timer-badge ${isUrgent ? 'urgent' : ''}">
                    <i class="fa-regular fa-clock"></i> ${timeLeftStr}
                </div>
                <div class="badge discount-badge">${item.discount_percentage}% OFF</div>
                <button class="fav-heart ${isFaved ? 'active' : ''}" onclick="toggleFavorite(${item.id}, this)" title="${isFaved ? 'Remove from wishlist' : 'Add to wishlist'}">
                    <i class="fa-${isFaved ? 'solid' : 'regular'} fa-heart"></i>
                </button>
            </div>
            <div class="food-details">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.2rem;">
                    <span class="kitchen-name">${item.kitchen_name} &bull; ${item.kitchen_location}</span>
                    <span class="veg-badge ${isVeg ? 'veg' : 'non-veg'}"><span class="veg-dot"></span>${isVeg ? 'VEG' : 'NON-VEG'}</span>
                </div>
                <h3 class="dish-name">${item.food_name}</h3>
                <div class="price-row">
                    <span class="current-price">₹${item.finalPrice}</span>
                    <span class="original-price">₹${item.original_price}</span>
                </div>
                <div class="stock-action-row">
                    <span class="stock-info ${lowStock ? 'low-stock' : ''}">
                        <i class="fa-solid ${lowStock ? 'fa-fire' : 'fa-box'}"></i>
                        ${lowStock ? `Only ${item.quantity} left` : `${item.quantity} left`}
                    </span>
                    <button class="btn btn-add" onclick="addToCart(${item.id})">
                        <i class="fa-solid fa-cart-plus"></i> Add
                    </button>
                </div>
            </div>
        </div>
    `;
}

// === CUISINE FILTER ===
const cuisineImages = {
    'North Indian': 'https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=400&q=80',
    'Biryani': 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=400&q=80',
    'Japanese': 'https://images.unsplash.com/photo-1579871494447-9811cf80d66c?w=400&q=80',
    'Sushi': 'https://images.unsplash.com/photo-1579871494447-9811cf80d66c?w=400&q=80',
    'Italian': 'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=400&q=80',
    'Pizza': 'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=400&q=80',
    'Thai': 'https://images.unsplash.com/photo-1559314809-0d155014e29e?w=400&q=80',
    'Asian': 'https://images.unsplash.com/photo-1455619452474-d2be8b1e70cd?w=400&q=80',
    'American': 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400&q=80',
    'Fast Food': 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400&q=80',
    'Desserts': 'https://images.unsplash.com/photo-1551024601-bec78aea704b?w=400&q=80',
    'Bakery': 'https://images.unsplash.com/photo-1509365390695-33aee754301f?w=400&q=80',
    'Chinese': 'https://images.unsplash.com/photo-1585032226651-759b368d7246?w=400&q=80',
    'South Indian': 'https://images.unsplash.com/photo-1668236543090-82eba5ee5976?w=400&q=80',
    'Mughlai': 'https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?w=400&q=80',
    'Kebabs': 'https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?w=400&q=80',
    'Healthy': 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400&q=80',
    'Salads': 'https://images.unsplash.com/photo-1546793665-c74683f339c1?w=400&q=80'
};

async function fetchCuisines() {
    try {
        const res = await fetch('http://localhost:5000/api/cuisines');
        const cuisines = await res.json();
        const container = document.querySelector('.cuisine-scroll');
        if (!container) return;

        // Add "All" option first
        let html = `<div class="cuisine-card active" onclick="filterCuisine(null, this)" style="background-image: linear-gradient(rgba(0,0,0,0.4), rgba(0,0,0,0.4)), url('https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=400&q=80');"><span>All</span></div>`;
        cuisines.forEach(c => {
            const img = cuisineImages[c] || 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=400&q=80';
            html += `<div class="cuisine-card" onclick="filterCuisine('${c}', this)" style="background-image: linear-gradient(rgba(0,0,0,0.4), rgba(0,0,0,0.4)), url('${img}');"><span>${c}</span></div>`;
        });
        container.innerHTML = html;
    } catch (e) { console.error(e); }
}

function filterCuisine(cuisine, el) {
    activeCuisine = cuisine;
    document.querySelectorAll('.cuisine-card').forEach(c => c.classList.remove('active'));
    if (el) el.classList.add('active');

    if (!cuisine) {
        renderItems(allItems);
    } else {
        // Filter items whose kitchen serves this cuisine
        const filtered = allItems.filter(item => {
            // We need to check the kitchen's cuisine — stored in allDeals
            const deal = allDeals[item.id];
            if (!deal) return false;
            // The surplus controller doesn't return cuisine but we have kitchen_name
            // Let's match via the full items with cuisine data
            return true; // We'll use the search endpoint instead
        });
        // Better approach: use search with cuisine query
        fetch(`http://localhost:5000/api/search?q=${encodeURIComponent(cuisine)}`)
            .then(r => r.json())
            .then(items => {
                // Process items through the surplus controller pricing
                fetch('http://localhost:5000/api/surplus')
                    .then(r => r.json())
                    .then(allProcessed => {
                        const matchIds = new Set(items.map(i => i.id));
                        const filtered = allProcessed.filter(i => matchIds.has(i.id));
                        filtered.forEach(i => { allDeals[i.id] = i; });
                        renderItems(filtered);
                    });
            });
    }
}

// === VEG FILTER ===
function applyFilters() {
    let filtered = allItems;
    if (activeCuisine) {
        filtered = filtered.filter(i => (i.kitchen_cuisine || '').toLowerCase().includes(activeCuisine.toLowerCase()));
    }
    if (activeVegFilter === 'veg') filtered = filtered.filter(i => i.is_veg === 1);
    if (activeVegFilter === 'nonveg') filtered = filtered.filter(i => i.is_veg === 0);
    renderItems(filtered);
}

function setVegFilter(type) {
    activeVegFilter = type;
    document.getElementById('filter-all').style.cssText = '';
    document.getElementById('filter-veg').className = 'veg-filter-btn';
    document.getElementById('filter-nonveg').className = 'veg-filter-btn';
    if (type === 'all') document.getElementById('filter-all').style.cssText = 'border-color:var(--primary-green);background:#E8F5E9;color:var(--primary-green);';
    if (type === 'veg') document.getElementById('filter-veg').className = 'veg-filter-btn active-veg';
    if (type === 'nonveg') document.getElementById('filter-nonveg').className = 'veg-filter-btn active-nonveg';
    applyFilters();
}

// === SEARCH ===
let searchTimeout;
function setupSearch() {
    const input = document.querySelector('.search-bar input');
    if (!input) return;
    input.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        const q = input.value.trim();
        if (q.length === 0) {
            renderItems(allItems);
            return;
        }
        searchTimeout = setTimeout(() => {
            const lower = q.toLowerCase();
            const filtered = allItems.filter(item =>
                item.food_name.toLowerCase().includes(lower) ||
                item.kitchen_name.toLowerCase().includes(lower)
            );
            renderItems(filtered);
        }, 300);
    });
}

// === CART ===
let cart = [];

function loadCart() {
    const saved = localStorage.getItem('ecoeats_cart');
    if (saved) cart = JSON.parse(saved);
    updateCartUI();
}

function addToCart(foodId) {
    const item = allDeals[foodId];
    if (!item) return;

    if (cart.length > 0 && cart[0].kitchenId !== item.kitchen_id) {
        if (!confirm(`Your cart has items from "${cart[0].kitchenName}". Adding this will clear your cart. Continue?`)) {
            return;
        }
        cart = [];
    }

    const existing = cart.find(c => c.id === foodId);
    if (existing) {
        existing.cartQty += 1;
    } else {
        cart.push({
            id: item.id,
            name: item.food_name,
            price: item.finalPrice || item.original_price,
            originalPrice: item.original_price,
            cartQty: 1,
            kitchenId: item.kitchen_id,
            kitchenName: item.kitchen_name,
            kitchenLocation: item.kitchen_location,
            kitchenLat: item.kitchen_lat,
            kitchenLng: item.kitchen_lng
        });
    }

    localStorage.setItem('ecoeats_cart', JSON.stringify(cart));
    updateCartUI();

    const badge = document.getElementById('cart-count');
    badge.style.transform = 'scale(1.4)';
    setTimeout(() => badge.style.transform = 'scale(1)', 200);
}

function updateCartUI() {
    document.getElementById('cart-count').innerText = cart.reduce((sum, item) => sum + item.cartQty, 0);
}

// === AUTH ===
function checkAuth() {
    const token = localStorage.getItem('ecoeats_token');
    const userStr = localStorage.getItem('ecoeats_user');

    if (token && userStr) {
        const user = JSON.parse(userStr);
        document.getElementById('auth-buttons').style.display = 'none';
        const userMenu = document.getElementById('user-menu');
        userMenu.style.display = 'flex';
        document.getElementById('user-name-display').innerText = `Hi, ${user.name.split(' ')[0]}`;
    } else {
        document.getElementById('auth-buttons').style.display = 'block';
        document.getElementById('user-menu').style.display = 'none';
    }
}

function logout() {
    localStorage.removeItem('ecoeats_token');
    localStorage.removeItem('ecoeats_user');
    localStorage.removeItem('ecoeats_cart');
    window.location.href = 'login.html';
}

// === DARK MODE ===
function initDarkMode() {
    if (localStorage.getItem('ecoeats_dark') === '1') {
        document.body.classList.add('dark-mode');
        const btn = document.getElementById('dark-toggle');
        if (btn) btn.innerHTML = '<i class="fa-solid fa-sun"></i>';
    }
}

function toggleDarkMode() {
    const isDark = document.body.classList.toggle('dark-mode');
    localStorage.setItem('ecoeats_dark', isDark ? '1' : '0');
    const btn = document.getElementById('dark-toggle');
    if (btn) btn.innerHTML = isDark ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
}

// === TOAST NOTIFICATIONS ===
function showToast(message, type = 'success', duration = 4000) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type === 'error' ? 'error' : ''}`;
    const icon = type === 'error' ? 'fa-circle-exclamation' : 'fa-circle-check';
    const color = type === 'error' ? 'var(--urgent-red)' : 'var(--primary-green)';
    toast.innerHTML = `<i class="fa-solid ${icon}" style="color:${color}; margin-right:0.5rem;"></i>${message}`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease-in forwards';
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

// === FAVORITES ===
async function toggleFavorite(itemId, btn) {
    const token = localStorage.getItem('ecoeats_token');
    if (!token) { showToast('Please log in to save favourites', 'error'); return; }
    try {
        const res = await fetch('http://localhost:5000/api/favorites/toggle', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ item_id: itemId })
        });
        const data = await res.json();
        if (data.favorited) {
            myFavorites.add(itemId);
            btn.className = 'fav-heart active';
            btn.innerHTML = '<i class="fa-solid fa-heart"></i>';
            showToast('Added to your wishlist ❤️');
        } else {
            myFavorites.delete(itemId);
            btn.className = 'fav-heart';
            btn.innerHTML = '<i class="fa-regular fa-heart"></i>';
            showToast('Removed from wishlist');
        }
    } catch(e) { showToast('Could not update wishlist', 'error'); }
}

// === ORDER STATUS POLLING ===
let lastKnownStatus = null;
async function startOrderStatusPolling() {
    const token = localStorage.getItem('ecoeats_token');
    if (!token) return;
    try {
        const res = await fetch('http://localhost:5000/api/orders/my-orders', { headers: { 'Authorization': `Bearer ${token}` } });
        if (!res.ok) return;
        const orders = await res.json();
        if (orders.length === 0) return;
        const latest = orders[0];
        const eta = new Date(latest.estimated_delivery_time);
        const now = new Date();
        const remaining = eta - now;
        if (remaining <= 0) return;
        const mins = Math.ceil(remaining / 60000);
        if (mins <= 10 && lastKnownStatus !== 'onway') {
            lastKnownStatus = 'onway';
            showToast(`🏍️ Your rider is almost there! Arriving in ~${mins} min`);
        } else if (mins <= 20 && lastKnownStatus === null) {
            lastKnownStatus = 'preparing';
            showToast('🍳 Your order is being prepared!');
        }
    } catch(e) {}
}
