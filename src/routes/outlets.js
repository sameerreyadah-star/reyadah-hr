const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const { Employee, WorkTiming } = require('../models');
const { Op } = require('sequelize');

// GET /api/outlets - List all unique outlets
router.get('/', auth, asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'forbidden' });
  
  // Get outlets from employees
  const outlets = await Employee.findAll({
    attributes: ['outlet'],
    where: { outlet: { [Op.ne]: null, [Op.ne]: '' } },
    group: ['outlet'],
    raw: true,
  });
  
  // Get outlets from WorkTiming
  const workTimingOutlets = await WorkTiming.findAll({
    attributes: ['outletName'],
    where: { isActive: true },
    group: ['outletName'],
    raw: true,
  });
  
  const outletNames = new Set();
  outlets.forEach(o => { if (o.outlet) outletNames.add(o.outlet); });
  workTimingOutlets.forEach(w => { if (w.outletName) outletNames.add(w.outletName); });
  
  // Get manager assignments
  const result = [];
  for (const name of outletNames) {
    const manager = await Employee.findOne({
      attributes: ['employeeId', 'name', 'email'],
      where: { outlet: name, role: 'restaurant-manager' },
    });
    const count = await Employee.count({ where: { outlet: name } });
    result.push({
      outletName: name,
      employeeCount: count,
      manager: manager ? { employeeId: manager.employeeId, name: manager.name } : null,
    });
  }
  
  res.json(result);
}));

// POST /api/outlets/assign - Assign employees to outlet (bulk)
router.post('/assign', auth, asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'forbidden' });
  const { employeeIds, outletName } = req.body;
  if (!employeeIds || !employeeIds.length || !outletName) {
    return res.status(400).json({ error: 'employeeIds and outletName are required' });
  }
  const count = await Employee.update(
    { outlet: outletName },
    { where: { employeeId: { [Op.in]: employeeIds } } }
  );
  res.json({ updatedCount: count[0] || 0, message: `${count[0] || 0} employees assigned to ${outletName}` });
}));

// GET /api/outlets/employees/:outlet - Get employees of an outlet
router.get('/employees/:outlet', auth, asyncHandler(async (req, res) => {
  if (!['admin', 'restaurant-manager', 'company-manager'].includes(req.user.role)) {
    return res.status(403).json({ error: 'forbidden' });
  }
  // Restaurant-manager can only view their own outlet
  if (req.user.role === 'restaurant-manager' && req.user.outlet !== req.params.outlet) {
    return res.status(403).json({ error: 'You can only view your own outlet' });
  }
  const employees = await Employee.findAll({
    attributes: ['id', 'employeeId', 'name', 'email', 'role', 'designation', 'photoUrl', 'outlet', 'phone', 'department'],
    where: { outlet: req.params.outlet },
    order: [['name', 'ASC']],
  });
  res.json(employees);
}));

// POST /api/outlets/outlet-employees - Get employees NOT assigned to an outlet (for adding)
router.post('/unassigned', auth, asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'forbidden' });
  const employees = await Employee.findAll({
    attributes: ['id', 'employeeId', 'name', 'email', 'role', 'designation', 'photoUrl', 'outlet'],
    where: { [Op.or]: [{ outlet: null }, { outlet: '' }] },
    order: [['name', 'ASC']],
  });
  res.json(employees);
}));

module.exports = router;