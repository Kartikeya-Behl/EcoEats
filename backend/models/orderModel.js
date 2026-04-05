const { db } = require('../db/database');

const createOrder = (orderData, callback) => {
    const { food_id, quantity } = orderData;
    db.run('INSERT INTO orders (food_id, quantity) VALUES (?, ?)', [food_id, quantity], function(err) {
        callback(err, this ? this.lastID : null);
    });
};

const getAllOrders = (callback) => {
    const query = `
        SELECT o.*, s.food_name, s.original_price, k.name as kitchen_name 
        FROM orders o
        JOIN surplus_food s ON o.food_id = s.id
        JOIN kitchens k ON s.kitchen_id = k.id
        ORDER BY o.order_time DESC
    `;
    db.all(query, [], (err, rows) => {
        callback(err, rows);
    });
};

module.exports = {
    createOrder,
    getAllOrders
};
