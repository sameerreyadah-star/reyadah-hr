const express = require('express');
const fs = require('fs/promises');
const path = require('path');
const router = express.Router();
const auth = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');

const dataDir = path.join(__dirname, '..', '..', 'data');
const holidaysFile = path.join(dataDir, 'holidays.json');

function canManageHolidays(role) {
  return ['admin', 'company-manager'].includes(role);
}

async function readHolidays() {
  try {
    const raw = await fs.readFile(holidaysFile, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

async function writeHolidays(holidays) {
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(holidaysFile, JSON.stringify(holidays, null, 2));
}

router.get('/', auth, asyncHandler(async (req, res) => {
  if (!canManageHolidays(req.user.role)) return res.status(403).json({ error: 'forbidden' });
  const holidays = await readHolidays();
  holidays.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  res.json(holidays);
}));

router.post('/', auth, asyncHandler(async (req, res) => {
  if (!canManageHolidays(req.user.role)) return res.status(403).json({ error: 'forbidden' });

  const name = String(req.body.name || '').trim();
  const date = String(req.body.date || '').trim();
  const type = String(req.body.type || 'public').trim() || 'public';
  if (!name || !date) return res.status(400).json({ error: 'name and date are required' });

  const holidays = await readHolidays();
  const holiday = {
    id: Date.now(),
    name,
    date,
    type,
    createdAt: new Date().toISOString(),
    createdBy: req.user.employeeId,
  };
  holidays.push(holiday);
  await writeHolidays(holidays);
  res.status(201).json(holiday);
}));

module.exports = router;
