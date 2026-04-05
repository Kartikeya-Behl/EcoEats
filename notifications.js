document.addEventListener('DOMContentLoaded', () => {
    const navActions = document.querySelector('.nav-actions');
    if (!navActions) return;

    const token = localStorage.getItem('ecoeats_token');
    if (!token) return; // Only for logged-in users

    // Add bell icon if not exists
    if (!document.getElementById('notif-bell')) {
        const notifHtml = `
            <div id="notif-bell" style="position:relative; cursor:pointer; font-size:1.25rem; color:var(--text-primary); padding:0.5rem;" onclick="toggleNotifs()">
                <i class="fa-regular fa-bell"></i>
                <span id="notif-badge" style="display:none; position:absolute; top:2px; right:2px; background:var(--urgent-red); color:white; width:10px; height:10px; border-radius:50%;"></span>
            </div>
            <div id="notif-dropdown" style="display:none; position:absolute; top:60px; right:20px; width:300px; background:var(--card-bg); border:1px solid var(--border-color); border-radius:8px; box-shadow:var(--shadow-md); z-index:1000; overflow:hidden;">
                <div style="padding:1rem; border-bottom:1px solid var(--border-color); display:flex; justify-content:space-between; align-items:center;">
                    <strong style="color:var(--text-primary);">Notifications</strong>
                    <button onclick="markAllRead()" style="background:none; border:none; color:var(--primary-green); font-size:0.8rem; cursor:pointer;">Mark all read</button>
                </div>
                <div id="notif-list" style="max-height:300px; overflow-y:auto; background:var(--card-bg);">
                    <div style="padding:1rem; text-align:center; color:var(--text-secondary); font-size:0.9rem;">No new notifications</div>
                </div>
            </div>
        `;
        // Insert right before the cart icon or inside nav-actions
        const cartIcon = document.querySelector('.cart-icon') || document.querySelector('.fa-user').parentElement;
        if (cartIcon) {
            cartIcon.insertAdjacentHTML('beforebegin', notifHtml);
        } else {
            navActions.insertAdjacentHTML('afterbegin', notifHtml);
        }
    }

    pollNotifications();
    setInterval(pollNotifications, 30000); // Check every 30s
});

let unreadCount = 0;

async function pollNotifications() {
    const token = localStorage.getItem('ecoeats_token');
    if (!token) return;

    try {
        const res = await fetch('http://localhost:5000/api/notifications', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) return;
        const notifs = await res.json();
        
        unreadCount = notifs.filter(n => n.is_read === 0).length;
        const badge = document.getElementById('notif-badge');
        const list = document.getElementById('notif-list');
        const bellIcon = document.querySelector('#notif-bell i');

        if (unreadCount > 0) {
            badge.style.display = 'block';
            bellIcon.classList.remove('fa-regular');
            bellIcon.classList.add('fa-solid');
        } else {
            badge.style.display = 'none';
            bellIcon.classList.remove('fa-solid');
            bellIcon.classList.add('fa-regular');
        }

        if (notifs.length === 0) {
            list.innerHTML = `<div style="padding:1rem; text-align:center; color:var(--text-secondary); font-size:0.9rem;">No notifications</div>`;
        } else {
            list.innerHTML = notifs.map(n => `
                <div style="padding:0.75rem 1rem; border-bottom:1px solid var(--border-color); background:${n.is_read ? 'var(--card-bg)' : 'var(--bg-color)'};">
                    <div style="display:flex; justify-content:space-between; margin-bottom:0.25rem;">
                        <strong style="font-size:0.9rem; color:var(--text-primary); ${n.is_read ? '' : 'color:var(--primary-green)'}">${n.title}</strong>
                        <small style="color:var(--text-secondary); font-size:0.7rem;">${new Date(n.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</small>
                    </div>
                    <p style="margin:0; font-size:0.85rem; color:var(--text-secondary);">${n.message}</p>
                </div>
            `).join('');
        }
    } catch (e) {
        console.error('Failed to fetch notifications');
    }
}

function toggleNotifs() {
    const drop = document.getElementById('notif-dropdown');
    drop.style.display = drop.style.display === 'none' ? 'block' : 'none';
    if (drop.style.display === 'block' && unreadCount > 0) {
        markAllRead();
    }
}

async function markAllRead() {
    const token = localStorage.getItem('ecoeats_token');
    try {
        await fetch('http://localhost:5000/api/notifications/read', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        pollNotifications();
    } catch (e) {}
}
