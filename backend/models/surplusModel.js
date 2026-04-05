const { db } = require('../db/database');

const getAllSurplus = (callback) => {
    const query = `
        SELECT s.*, k.name as kitchen_name, k.location as kitchen_location, k.lat as kitchen_lat, k.lng as kitchen_lng
        FROM surplus_food s
        JOIN kitchens k ON s.kitchen_id = k.id
        WHERE s.quantity > 0
    `;
    db.all(query, [], (err, rows) => {
        callback(err, rows);
    });
};

const addSurplus = (surplusData, callback) => {
    const { kitchen_id, food_name, original_price, quantity, closing_time, image_url } = surplusData;
    const query = `
        INSERT INTO surplus_food (kitchen_id, food_name, original_price, quantity, closing_time, image_url)
        VALUES (?, ?, ?, ?, ?, ?)
    `;
    db.run(query, [kitchen_id, food_name, original_price, quantity, closing_time, image_url], function(err) {
        callback(err, this ? this.lastID : null);
    });
};

const decrementQuantity = (id, amount, callback) => {
    db.run('UPDATE surplus_food SET quantity = quantity - ? WHERE id = ? AND quantity >= ?', [amount, id, amount], function(err) {
        callback(err, this ? this.changes : 0);
    });
};

module.exports = {
    getAllSurplus,
    addSurplus,
    decrementQuantity
};
