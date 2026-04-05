const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const path = require('path');

const dbPath = path.resolve(__dirname, 'ecoeats.db');
const db = new sqlite3.Database(dbPath);

const initDb = (callback) => {
    db.serialize(() => {
        // Users table persists across restarts
        db.run(`
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        db.run(`
            CREATE TABLE IF NOT EXISTS saved_addresses (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                label TEXT NOT NULL,
                address TEXT NOT NULL,
                lat REAL NOT NULL,
                lng REAL NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users (id)
            )
        `);

        // Drop & recreate volatile demo data tables
        db.run('DROP TABLE IF EXISTS orders');
        db.run('DROP TABLE IF EXISTS surplus_food');
        db.run('DROP TABLE IF EXISTS kitchens');
        db.run('DROP TABLE IF EXISTS kitchen_auth');

        // Kitchen auth for dashboard login
        db.run(`
            CREATE TABLE IF NOT EXISTS kitchen_auth (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                kitchen_id INTEGER NOT NULL,
                username TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                FOREIGN KEY (kitchen_id) REFERENCES kitchens (id)
            )
        `);

        // Kitchens with real Bangalore lat/lng
        db.run(`
            CREATE TABLE IF NOT EXISTS kitchens (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                location TEXT NOT NULL,
                cuisine TEXT NOT NULL,
                lat REAL NOT NULL,
                lng REAL NOT NULL
            )
        `);

        db.run(`
            CREATE TABLE IF NOT EXISTS surplus_food (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                kitchen_id INTEGER,
                food_name TEXT NOT NULL,
                original_price REAL NOT NULL,
                quantity INTEGER NOT NULL,
                closing_time TEXT NOT NULL,
                image_url TEXT,
                is_veg INTEGER DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (kitchen_id) REFERENCES kitchens (id)
            )
        `);

        db.run(`
            CREATE TABLE IF NOT EXISTS reviews (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                kitchen_id INTEGER NOT NULL,
                order_id INTEGER,
                rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
                comment TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (id),
                FOREIGN KEY (kitchen_id) REFERENCES kitchens (id)
            )
        `);

        db.run(`
            CREATE TABLE IF NOT EXISTS favorites (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                item_id INTEGER NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, item_id),
                FOREIGN KEY (user_id) REFERENCES users (id),
                FOREIGN KEY (item_id) REFERENCES surplus_food (id)
            )
        `);

        db.run(`
            CREATE TABLE IF NOT EXISTS orders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                kitchen_id INTEGER,
                items_json TEXT NOT NULL,
                total_price REAL NOT NULL,
                original_total REAL NOT NULL DEFAULT 0,
                delivery_address TEXT NOT NULL,
                status TEXT DEFAULT 'confirmed',
                payment_method TEXT DEFAULT 'COD',
                driver_name TEXT,
                driver_phone TEXT,
                estimated_delivery_time DATETIME NOT NULL,
                kitchen_lat REAL,
                kitchen_lng REAL,
                user_lat REAL,
                user_lng REAL,
                order_time DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (id),
                FOREIGN KEY (kitchen_id) REFERENCES kitchens (id)
            )
        `);

        db.run(`
            CREATE TABLE IF NOT EXISTS pending_payments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                txn_id TEXT UNIQUE NOT NULL,
                user_id INTEGER NOT NULL,
                order_data TEXT NOT NULL,
                amount_paise INTEGER NOT NULL,
                status TEXT DEFAULT 'INITIATED',
                phonepe_txn_id TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (id)
            )
        `);

        db.run(`
            CREATE TABLE IF NOT EXISTS notifications (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                title TEXT NOT NULL,
                message TEXT NOT NULL,
                type TEXT,
                is_read INTEGER DEFAULT 0,
                show_after DATETIME DEFAULT CURRENT_TIMESTAMP,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (id)
            )
        `, (err) => {
            if (err) return callback(err);
            seedData(callback);
        });
    });
};

const seedData = (callback) => {
    // 10 restaurants with real Bangalore coordinates
    const kitchens = [
        ['Spice Garden Kitchen',  'Indiranagar, Bangalore',   'North Indian, Desserts',   12.9784, 77.6408],
        ['Tokyo Bites',           'Koramangala, Bangalore',   'Japanese',       12.9352, 77.6245],
        ['Pasta Paradise',        'Whitefield, Bangalore',    'Italian, Desserts',        12.9698, 77.7500],
        ['Thai Flavors',          'HSR Layout, Bangalore',    'Thai',           12.9116, 77.6389],
        ['Burger Street',         'MG Road, Bangalore',       'American',       12.9756, 77.6068],
        ['Sweet Treats Bakery',   'Jayanagar, Bangalore',     'Desserts',       12.9308, 77.5838],
        ['Dragon Wok',            'BTM Layout, Bangalore',    'Chinese',        12.9166, 77.6101],
        ['Dosa Corner',           'Malleshwaram, Bangalore',  'South Indian',   12.9969, 77.5706],
        ['Kebab Express',         'Frazer Town, Bangalore',   'Mughlai',        12.9988, 77.6128],
        ['Green Bowl',            'JP Nagar, Bangalore',      'Healthy',        12.9063, 77.5857]
    ];

    const stmt = db.prepare('INSERT INTO kitchens (name, location, cuisine, lat, lng) VALUES (?, ?, ?, ?, ?)');
    kitchens.forEach(k => stmt.run(k));
    stmt.finalize();

    // Kitchen auth credentials (bcrypt hashed)
    const kitchenCreds = [
        [1, 'spicegarden',    'spice@123'],
        [2, 'tokyobites',     'tokyo@123'],
        [3, 'pastaparadise',  'pasta@123'],
        [4, 'thaiflavors',    'thai@123'],
        [5, 'burgerstreet',   'burger@123'],
        [6, 'sweettreats',    'sweet@123'],
        [7, 'dragonwok',      'dragon@123'],
        [8, 'dosacorner',     'dosa@123'],
        [9, 'kebabexpress',   'kebab@123'],
        [10, 'greenbowl',     'green@123']
    ];

    const authStmt = db.prepare('INSERT INTO kitchen_auth (kitchen_id, username, password) VALUES (?, ?, ?)');
    kitchenCreds.forEach(c => {
        authStmt.run([c[0], c[1], bcrypt.hashSync(c[2], 10)]);
    });
    authStmt.finalize();

    const now = Date.now();
    const t = (mins) => new Date(now + mins * 60000).toISOString();

    // [kitchen_id, food_name, price, qty, closing_time, image_url, is_veg]
    const foods = [
        // Spice Garden Kitchen (1) — North Indian
        [1, 'Paneer Butter Masala',  280, 5,  t(90),  'https://images.unsplash.com/photo-1588166524941-3bf61a9c41db?w=600', 1],
        [1, 'Chicken Biryani',       350, 8,  t(180), 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=600', 0],
        [1, 'Dal Makhani',           220, 6,  t(120), 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=600', 1],
        [1, 'Butter Naan (4 pcs)',   120, 12, t(150), 'https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=600', 1],
        [1, 'Gulab Jamun (6 pcs)',   150, 4,  t(60),  'https://images.unsplash.com/photo-1666190092159-3171cf0fbb12?w=600', 1],

        // Tokyo Bites (2) — Japanese
        [2, 'Sushi Platter (12 pcs)',  600, 3,  t(55),  'https://images.unsplash.com/photo-1579871494447-9811cf80d66c?w=600', 0],
        [2, 'Chicken Ramen',           400, 5,  t(120), 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=600', 0],
        [2, 'Tempura Udon',            350, 4,  t(90),  'https://images.unsplash.com/photo-1618841557871-b4664fbf0cb3?w=600', 0],
        [2, 'Miso Soup',               180, 8,  t(45),  'https://images.unsplash.com/photo-1547592166-23ac45744acd?w=600', 1],
        [2, 'Edamame Bowl',            150, 6,  t(60),  'https://images.unsplash.com/photo-1564834724105-918b73d1b9e0?w=600', 1],

        // Pasta Paradise (3) — Italian
        [3, 'Margherita Pizza (Large)', 340, 10, t(240), 'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=600', 1],
        [3, 'Penne Alfredo Pasta',      320, 6,  t(90),  'https://images.unsplash.com/photo-1645112411341-6c4fd023714a?w=600', 1],
        [3, 'Bruschetta',               200, 8,  t(60),  'https://images.unsplash.com/photo-1572695157366-5e585ab2b69f?w=600', 1],
        [3, 'Tiramisu',                 280, 4,  t(45),  'https://images.unsplash.com/photo-1571877227200-a0d98ea607e9?w=600', 1],
        [3, 'Garlic Bread (6 pcs)',     160, 12, t(180), 'https://images.unsplash.com/photo-1573140401552-3fab0b24306f?w=600', 1],

        // Thai Flavors (4) — Thai
        [4, 'Pad Thai Noodles',    300, 7,  t(120), 'https://images.unsplash.com/photo-1559314809-0d155014e29e?w=600', 0],
        [4, 'Green Curry',         320, 5,  t(90),  'https://images.unsplash.com/photo-1455619452474-d2be8b1e70cd?w=600', 0],
        [4, 'Tom Yum Soup',        250, 6,  t(60),  'https://images.unsplash.com/photo-1548943487-a2e4e43b4853?w=600', 0],
        [4, 'Thai Fried Rice',     280, 8,  t(150), 'https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=600', 1],

        // Burger Street (5) — American
        [5, 'Double Cheese Burger', 350, 4,  t(25),  'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600', 0],
        [5, 'Loaded Fries',         200, 8,  t(60),  'https://images.unsplash.com/photo-1630384060421-cb20d0e0649d?w=600', 1],
        [5, 'BBQ Chicken Wings (8)', 380, 5,  t(90),  'https://images.unsplash.com/photo-1592011432621-f7f576f44484?w=600', 0],
        [5, 'Milkshake (Chocolate)', 180, 10, t(120),'https://images.unsplash.com/photo-1572490122747-3968b75cc699?w=600', 1],
        [5, 'Onion Rings',          160, 6,  t(45),  'https://images.unsplash.com/photo-1639024471283-03518883512d?w=600', 1],

        // Sweet Treats Bakery (6) — Desserts
        [6, 'Assorted Donuts (6 pcs)', 240, 5,  t(30),  'https://images.unsplash.com/photo-1551024601-bec78aea704b?w=600', 1],
        [6, 'Red Velvet Cake Slice',   180, 6,  t(60),  'https://images.unsplash.com/photo-1616541823729-00fe0aacd32c?w=600', 1],
        [6, 'Chocolate Brownie',       150, 10, t(90),  'https://images.unsplash.com/photo-1564355808539-22fda35bed7e?w=600', 1],
        [6, 'Blueberry Cheesecake',    280, 4,  t(45),  'https://images.unsplash.com/photo-1533134242443-d4fd215305ad?w=600', 1],
        [6, 'Cinnamon Rolls (4 pcs)',  200, 8,  t(120), 'https://images.unsplash.com/photo-1586985289688-ca3cf47d3e6e?w=600', 1],

        // Dragon Wok (7) — Chinese
        [7, 'Hakka Noodles',         240, 8,  t(120), 'https://images.unsplash.com/photo-1585032226651-759b368d7246?w=600', 1],
        [7, 'Manchurian Dry',        260, 6,  t(90),  'https://images.unsplash.com/photo-1625220194771-7ebdea0b70b9?w=600', 1],
        [7, 'Spring Rolls (6 pcs)',  200, 10, t(60),  'https://images.unsplash.com/photo-1695712641569-05eee7b37b6d?w=600', 1],
        [7, 'Fried Rice',           220, 7,  t(150), 'https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=600', 1],

        // Dosa Corner (8) — South Indian
        [8, 'Masala Dosa',           120, 12, t(180), 'https://images.unsplash.com/photo-1694849789325-914b71ab4075?w=600', 1],
        [8, 'Idli Sambar (4 pcs)',   100, 15, t(120), 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=600', 1],
        [8, 'Mysore Bonda (6 pcs)',  140, 8,  t(90),  'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=600', 1],
        [8, 'Filter Coffee',         60, 20, t(60),  'https://images.unsplash.com/photo-1610889556528-9a770e32642f?w=600', 1],
        [8, 'Rava Kesari',          100, 6,  t(45),  'https://images.unsplash.com/photo-1567337710282-00832b415979?w=600', 1],

        // Kebab Express (9) — Mughlai
        [9, 'Chicken Seekh Kebab (4)',320, 6,  t(120), 'https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?w=600', 0],
        [9, 'Mutton Rogan Josh',     450, 4,  t(90),  'https://images.unsplash.com/photo-1545247181-516773cae754?w=600', 0],
        [9, 'Chicken Shawarma',      200, 10, t(150), 'https://images.unsplash.com/photo-1529006557810-274b9b2fc783?w=600', 0],
        [9, 'Rumali Roti (4 pcs)',   100, 12, t(60),  'https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=600', 1],

        // Green Bowl (10) — Healthy
        [10, 'Caesar Salad',         250, 6,  t(60),  'https://images.unsplash.com/photo-1546793665-c74683f339c1?w=600', 1],
        [10, 'Quinoa Bowl',          320, 4,  t(90),  'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=600', 1],
        [10, 'Fresh Fruit Smoothie', 180, 10, t(45),  'https://images.unsplash.com/photo-1553530666-ba11a7da3888?w=600', 1],
        [10, 'Avocado Toast',        200, 8,  t(120), 'https://images.unsplash.com/photo-1541519227354-08fa5d50c44d?w=600', 1],
        [10, 'Greek Yogurt Parfait', 160, 6,  t(60),  'https://images.unsplash.com/photo-1488477181946-6428a0291777?w=600', 1]
    ];

    const foodStmt = db.prepare('INSERT INTO surplus_food (kitchen_id, food_name, original_price, quantity, closing_time, image_url, is_veg) VALUES (?, ?, ?, ?, ?, ?, ?)');
    foods.forEach(f => foodStmt.run(f));
    foodStmt.finalize(() => callback(null));
};

module.exports = { db, initDb };
