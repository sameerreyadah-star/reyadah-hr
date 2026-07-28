const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const { Outlet, Employee } = require('../models');
const { Op } = require('sequelize');
const cloudinaryUpload = require('../services/cloudinaryUpload');

// GET /api/outlet-management - List all outlets
router.get('/', auth, asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'forbidden' });
  const outlets = await Outlet.findAll({ order: [['name', 'ASC']] });
  
  // Enrich with employee data
  const enriched = await Promise.all(outlets.map(async (outlet) => {
    const employees = await Employee.findAll({
      attributes: ['id', 'employeeId', 'name', 'email', 'role', 'designation', 'photoUrl', 'phone', 'department'],
      where: { outlet: outlet.name },
      order: [['name', 'ASC']],
    });
    return {
      ...outlet.toJSON(),
      employees,
      employeeCount: employees.length,
    };
  }));
  
  res.json(enriched);
}));

// POST /api/outlet-management - Create a new outlet
router.post('/', auth, asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'forbidden' });
  const { name, description, address, phone, email, managerId } = req.body;
  if (!name) return res.status(400).json({ error: 'Outlet name is required' });
  
  const existing = await Outlet.findOne({ where: { name } });
  if (existing) return res.status(409).json({ error: 'Outlet already exists' });

  const outlet = await Outlet.create({
    name,
    outletId: name.toLowerCase().replace(/[^a-z0-9]/g, '_'),
    description: description || '',
    address: address || '',
    phone: phone || '',
    email: email || '',
    managerId: managerId || '',
  });
  res.status(201).json(outlet);
}));

// PUT /api/outlet-management/:id - Update an outlet
router.put('/:id', auth, asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'forbidden' });
  const outlet = await Outlet.findByPk(req.params.id);
  if (!outlet) return res.status(404).json({ error: 'Outlet not found' });
  
  const { name, description, address, phone, email, isActive, managerId } = req.body;
  if (name !== undefined) outlet.name = name;
  if (description !== undefined) outlet.description = description;
  if (address !== undefined) outlet.address = address;
  if (phone !== undefined) outlet.phone = phone;
  if (email !== undefined) outlet.email = email;
  if (isActive !== undefined) outlet.isActive = isActive;
  if (managerId !== undefined) outlet.managerId = managerId;
  
  await outlet.save();
  res.json(outlet);
}));

// POST /api/outlet-management/:id/logo - Upload outlet logo
router.post('/:id/logo', auth, asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'forbidden' });
  const outlet = await Outlet.findByPk(req.params.id);
  if (!outlet) return res.status(404).json({ error: 'Outlet not found' });
  if (!req.file) return res.status(400).json({ error: 'Logo image required' });

  const cloudResult = await cloudinaryUpload.uploadBuffer(req.file.buffer, {
    folder: 'reyadah/outlets',
    publicId: `logo_${outlet.id}_${Date.now()}`,
    resourceType: 'image',
  });
  outlet.logoUrl = cloudResult.secureUrl;
  await outlet.save();
  res.json({ logoUrl: outlet.logoUrl });
}));

// DELETE /api/outlet-management/:id - Delete an outlet
router.delete('/:id', auth, asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'forbidden' });
  const outlet = await Outlet.findByPk(req.params.id);
  if (!outlet) return res.status(404).json({ error: 'Outlet not found' });
  await outlet.destroy();
  res.json({ message: 'Outlet deleted successfully' });
}));

// POST /api/outlet-management/:id/assign-employees - Assign employees to outlet
router.post('/:id/assign-employees', auth, asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'forbidden' });
  const outlet = await Outlet.findByPk(req.params.id);
  if (!outlet) return res.status(404).json({ error: 'Outlet not found' });
  
  const { employeeIds } = req.body;
  if (!employeeIds || !employeeIds.length) {
    return res.status(400).json({ error: 'employeeIds required' });
  }
  
  const count = await Employee.update(
    { outlet: outlet.name },
    { where: { employeeId: { [Op.in]: employeeIds } } }
  );
  res.json({ updatedCount: count[0] || 0 });
}));

// POST /api/outlet-management/unassigned-employees - Employees without outlet
router.get('/unassigned-employees', auth, asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'forbidden' });
  const employees = await Employee.findAll({
    attributes: ['id', 'employeeId', 'name', 'email', 'role', 'designation', 'photoUrl'],
    where: { [Op.or]: [{ outlet: null }, { outlet: '' }] },
    order: [['name', 'ASC']],
  });
  res.json(employees);
}));

module.exports = router;