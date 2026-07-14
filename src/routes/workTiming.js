const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const { WorkTiming } = require('../models');

function canManage(role) {
  return ['admin', 'company-manager', 'restaurant-manager'].includes(role);
}

// GET /api/work-timings - List all outlet work timings
router.get('/', auth, asyncHandler(async (req, res) => {
  const timings = await WorkTiming.findAll({ order: [['outletName', 'ASC']] });
  res.json(timings);
}));

// POST /api/work-timings - Create a new outlet work timing
router.post('/', auth, asyncHandler(async (req, res) => {
  if (!canManage(req.user.role)) return res.status(403).json({ error: 'forbidden' });
  const { outletName, shiftStart, shiftEnd, breakStart, breakEnd, workingDays, description } = req.body;
  if (!outletName || !shiftStart || !shiftEnd) {
    return res.status(400).json({ error: 'outletName, shiftStart, and shiftEnd are required' });
  }
  const timing = await WorkTiming.create({
    outletName,
    shiftStart,
    shiftEnd,
    breakStart: breakStart || null,
    breakEnd: breakEnd || null,
    workingDays: workingDays || ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'],
    description: description || '',
  });
  res.status(201).json(timing);
}));

// PUT /api/work-timings/:id - Update a work timing
router.put('/:id', auth, asyncHandler(async (req, res) => {
  if (!canManage(req.user.role)) return res.status(403).json({ error: 'forbidden' });
  const timing = await WorkTiming.findByPk(req.params.id);
  if (!timing) return res.status(404).json({ error: 'Work timing not found' });

  const { outletName, shiftStart, shiftEnd, breakStart, breakEnd, workingDays, isActive, description } = req.body;
  if (outletName !== undefined) timing.outletName = outletName;
  if (shiftStart !== undefined) timing.shiftStart = shiftStart;
  if (shiftEnd !== undefined) timing.shiftEnd = shiftEnd;
  if (breakStart !== undefined) timing.breakStart = breakStart;
  if (breakEnd !== undefined) timing.breakEnd = breakEnd;
  if (workingDays !== undefined) timing.workingDays = workingDays;
  if (isActive !== undefined) timing.isActive = isActive;
  if (description !== undefined) timing.description = description;
  await timing.save();
  res.json(timing);
}));

// DELETE /api/work-timings/:id - Delete a work timing
router.delete('/:id', auth, asyncHandler(async (req, res) => {
  if (!canManage(req.user.role)) return res.status(403).json({ error: 'forbidden' });
  const timing = await WorkTiming.findByPk(req.params.id);
  if (!timing) return res.status(404).json({ error: 'Work timing not found' });
  await timing.destroy();
  res.json({ message: 'Work timing deleted successfully' });
}));

// GET /api/work-timings/outlets - List unique outlet names with their timings
router.get('/outlets', auth, asyncHandler(async (req, res) => {
  const timings = await WorkTiming.findAll({
    where: { isActive: true },
    order: [['outletName', 'ASC']],
  });
  
  // Group by outlet
  const outlets = {};
  timings.forEach(t => {
    if (!outlets[t.outletName]) {
      outlets[t.outletName] = {
        outletName: t.outletName,
        timings: [],
      };
    }
    outlets[t.outletName].timings.push({
      id: t.id,
      shiftStart: t.shiftStart,
      shiftEnd: t.shiftEnd,
      breakStart: t.breakStart,
      breakEnd: t.breakEnd,
      workingDays: t.workingDays,
      description: t.description,
    });
  });

  res.json(Object.values(outlets));
}));

module.exports = router;