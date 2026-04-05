const { db } = require('../db/database');

const getAllKitchens = (callback) => {
    db.all('SELECT * FROM kitchens', [], (err, rows) => {
        callback(err, rows);
    });
};

module.exports = {
    getAllKitchens
};
