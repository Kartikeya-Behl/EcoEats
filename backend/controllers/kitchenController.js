const kitchenModel = require('../models/kitchenModel');

const getKitchens = (req, res) => {
    kitchenModel.getAllKitchens((err, kitchens) => {
        if (err) {
            return res.status(500).json({ error: 'Database error retrieving kitchens' });
        }
        res.json(kitchens);
    });
};

module.exports = {
    getKitchens
};
