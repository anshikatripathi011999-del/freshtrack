const express = require('express');
const Grocery = require('../models/Grocery');

const router = express.Router();

function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ message: 'Please log in first.' });
  }
  next();
}

function getStatus(expiryDate) {
  if (!expiryDate) {
    return 'Fresh';
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const expiry = new Date(expiryDate);
  expiry.setHours(0, 0, 0, 0);

  if (expiry < today) {
    return 'Expired';
  }

  const diffDays = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
  if (diffDays <= 3) {
    return 'Expiring Soon';
  }

  return 'Fresh';
}

router.get('/groceries', requireAuth, async (req, res) => {
  try {
    const groceries = await Grocery.find({ userId: req.session.userId }).sort({ createdAt: -1 });

    const formatted = groceries.map((item) => ({
      _id: item._id,
      name: item.name,
      category: item.category,
      quantity: item.quantity,
      unit: item.unit,
      purchaseDate: item.purchaseDate,
      expiryDate: item.expiryDate,
      price: item.price,
      source: item.source,
      status: getStatus(item.expiryDate),
      createdAt: item.createdAt
    }));

    res.json(formatted);
  } catch (error) {
    console.error('Get groceries error:', error);
    res.status(500).json({ message: 'Error fetching groceries.' });
  }
});

router.post('/groceries', requireAuth, async (req, res) => {
  try {
    const {
      name,
      category,
      quantity,
      unit,
      purchaseDate,
      expiryDate,
      price,
      source
    } = req.body;

    const safeUnit = unit || 'pcs';

    if (!name || !category || !quantity || !purchaseDate || !price) {
      return res.status(400).json({ message: 'Please fill in all required fields.' });
    }

    const grocery = await Grocery.create({
      userId: req.session.userId,
      name,
      category,
      quantity: Number(quantity),
      unit: safeUnit,
      purchaseDate,
      expiryDate: expiryDate || null,
      price: Number(price),
      source: source || 'Manual'
    });

    res.status(201).json({ message: 'Grocery added successfully.', grocery });
  } catch (error) {
    console.error('Add grocery error:', error);
    res.status(500).json({ message: 'Error adding grocery.' });
  }
});

router.put('/groceries/:id', requireAuth, async (req, res) => {
  try {
    const grocery = await Grocery.findOne({ _id: req.params.id, userId: req.session.userId });

    if (!grocery) {
      return res.status(404).json({ message: 'Grocery not found.' });
    }

    const allowedFields = ['name', 'category', 'quantity', 'unit', 'purchaseDate', 'expiryDate', 'price'];
    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        grocery[field] = field === 'quantity' || field === 'price'
          ? Number(req.body[field])
          : req.body[field];
      }
    });

    await grocery.save();
    res.json({ message: 'Grocery updated successfully.', grocery });
  } catch (error) {
    console.error('Update grocery error:', error);
    res.status(500).json({ message: 'Error updating grocery.' });
  }
});

router.delete('/groceries/:id', requireAuth, async (req, res) => {
  try {
    const grocery = await Grocery.findOneAndDelete({ _id: req.params.id, userId: req.session.userId });

    if (!grocery) {
      return res.status(404).json({ message: 'Grocery not found.' });
    }

    res.json({ message: 'Grocery deleted successfully.' });
  } catch (error) {
    console.error('Delete grocery error:', error);
    res.status(500).json({ message: 'Error deleting grocery.' });
  }
});

router.get('/dashboard/stats', requireAuth, async (req, res) => {
  try {
    const groceries = await Grocery.find({ userId: req.session.userId }).sort({ createdAt: -1 });

    const totalGroceries = groceries.length;
    const fresh = groceries.filter((item) => getStatus(item.expiryDate) === 'Fresh').length;
    const expiringSoon = groceries.filter((item) => getStatus(item.expiryDate) === 'Expiring Soon').length;
    const expired = groceries.filter((item) => getStatus(item.expiryDate) === 'Expired').length;

    const recentlyAdded = groceries.slice(0, 5).map((item) => ({
      _id: item._id,
      name: item.name,
      category: item.category,
      quantity: item.quantity,
      unit: item.unit,
      price: item.price,
      createdAt: item.createdAt
    }));

    const expiringSoonItems = groceries
      .filter((item) => getStatus(item.expiryDate) === 'Expiring Soon')
      .sort((first, second) => new Date(first.expiryDate) - new Date(second.expiryDate))
      .map((item) => ({
        _id: item._id,
        name: item.name,
        expiryDate: item.expiryDate,
        status: getStatus(item.expiryDate)
      }));

    res.json({
      totalGroceries,
      fresh,
      expiringSoon,
      expired,
      recentlyAdded,
      expiringSoonItems
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({ message: 'Error fetching dashboard data.' });
  }
});

module.exports = { router, requireAuth, getStatus };
