const surplusModel = require('../models/surplusModel');

const calculateDiscountedPrice = (originalPrice, closingTime) => {
    const now = new Date();
    const closingDate = new Date(closingTime);
    const diffMins = (closingDate - now) / 60000;

    let discountPercentage = 20; // Default 20%
    if (diffMins > 0) {
        if (diffMins <= 30) {
            discountPercentage = 60;
        } else if (diffMins <= 60) {
            discountPercentage = 40;
        }
    } else {
        // If already closed, assume clearance
        discountPercentage = 80;
    }

    const discountAmount = originalPrice * (discountPercentage / 100);
    const finalPrice = originalPrice - discountAmount;
    
    return {
        discountPercentage,
        finalPrice: Math.round(finalPrice)
    };
};

const getSurplus = (req, res) => {
    surplusModel.getAllSurplus((err, items) => {
        if (err) {
            return res.status(500).json({ error: 'Database error retrieving surplus food' });
        }

        const processedItems = items.map(item => {
            const pricing = calculateDiscountedPrice(item.original_price, item.closing_time);
            return {
                ...item,
                ...pricing,
                discount_percentage: pricing.discountPercentage
            };
        });

        res.json(processedItems);
    });
};

const addSurplus = (req, res) => {
    const { kitchen_id, food_name, original_price, quantity, closing_time, image_url } = req.body;
    
    if (!kitchen_id || !food_name || !original_price || !quantity || !closing_time) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    surplusModel.addSurplus(req.body, (err, newId) => {
        if (err) {
            return res.status(500).json({ error: 'Failed to add surplus food' });
        }
        res.status(201).json({ message: 'Surplus food added successfully', id: newId });
    });
};

module.exports = {
    getSurplus,
    addSurplus
};
