const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { Employee, Shift, sequelize } = require('../models');

// GET /api/shift-roster/employees - Get all employees for shift roster
router.get('/employees', auth, async (req, res) => {
  try {
    const employees = await Employee.findAll({
      attributes: ['id', 'employeeId', 'name', 'email', 'designation', 'department', 'role', 'photoUrl', 'shiftRoster', 'createdAt'],
      order: [['name', 'ASC']],
    });

    const mapped = employees.map(emp => ({
      id: emp.employeeId || emp.id,
      employeeId: emp.employeeId,
      name: emp.name,
      email: emp.email,
      department: emp.department || 'General',
      position: emp.designation || 'Employee',
      role: emp.role,
      avatar: emp.photoUrl || null,
      shiftRoster: emp.shiftRoster || null,
    }));

    res.json(mapped);
  } catch (err) {
    console.error('Error fetching employees for shift roster:', err);
    res.status(500).json({ error: 'Failed to fetch employees' });
  }
});

// GET /api/shift-roster/assignments - Get all shift assignments
router.get('/assignments', auth, async (req, res) => {
  try {
    const { month, year } = req.query;
    let where = {};
    if (month && year) {
      const prefix = `${year}-${String(month).padStart(2, '0')}`;
      where.date = { [sequelize.Op.startsWith]: prefix };
    }
    
    const assignments = await Employee.findAll({
      attributes: ['employeeId', 'shiftRoster'],
      where: where,
    });

    const result = [];
    assignments.forEach(emp => {
      if (emp.shiftRoster && emp.shiftRoster.dates) {
        Object.entries(emp.shiftRoster.dates).forEach(([date, shiftId]) => {
          result.push({
            id: `${emp.employeeId}_${date}`,
            employeeId: emp.employeeId,
            date,
            shiftId,
          });
        });
      }
    });

    res.json(result);
  } catch (err) {
    console.error('Error fetching shift assignments:', err);
    res.status(500).json({ error: 'Failed to fetch assignments' });
  }
});

// POST /api/shift-roster/assignments - Save a shift assignment
router.post('/assignments', auth, async (req, res) => {
  try {
    const { employeeId, date, shiftId, notes } = req.body;
    
    const employee = await Employee.findOne({ where: { employeeId } });
    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const roster = employee.shiftRoster || {};
    if (!roster.dates) roster.dates = {};
    
    if (shiftId) {
      roster.dates[date] = shiftId;
    } else {
      delete roster.dates[date];
    }
    
    if (notes) roster.notes = notes;
    
    employee.shiftRoster = roster;
    await employee.save();

    res.json({ success: true, message: 'Shift assigned successfully' });
  } catch (err) {
    console.error('Error saving shift assignment:', err);
    res.status(500).json({ error: 'Failed to save assignment' });
  }
});

// POST /api/shift-roster/save - Save all shift changes
router.post('/save', auth, async (req, res) => {
  try {
    const { assignments } = req.body;
    let updated = 0;

    for (const assign of assignments) {
      const employee = await Employee.findOne({ where: { employeeId: assign.employeeId } });
      if (!employee) continue;

      const roster = employee.shiftRoster || {};
      if (!roster.dates) roster.dates = {};

      if (assign.shiftId) {
        roster.dates[assign.date] = assign.shiftId;
        updated++;
      } else {
        delete roster.dates[assign.date];
      }

      employee.shiftRoster = roster;
      await employee.save();
    }

    res.json({ success: true, message: `Saved ${updated} shift assignments` });
  } catch (err) {
    console.error('Error saving shift roster:', err);
    res.status(500).json({ error: 'Failed to save shift roster' });
  }
});

module.exports = router;