const express = require('express');
const { Op } = require('sequelize');
const router = express.Router();
const auth = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const { Attendance, Employee, LeaveRequest, Payroll } = require('../models');

function canViewReports(role) {
  return ['admin', 'company-manager', 'restaurant-manager'].includes(role);
}

function reportPeriod(year, month) {
  const parsedYear = Number.parseInt(year, 10);
  const parsedMonth = Number.parseInt(month, 10);
  if (!Number.isInteger(parsedYear) || parsedYear < 2000 || parsedYear > 2100) {
    return { error: 'year must be between 2000 and 2100' };
  }
  if (!Number.isInteger(parsedMonth) || parsedMonth < 1 || parsedMonth > 12) {
    return { error: 'month must be between 1 and 12' };
  }
  const daysInMonth = new Date(parsedYear, parsedMonth, 0).getDate();
  const start = `${parsedYear}-${String(parsedMonth).padStart(2, '0')}-01`;
  const end = `${parsedYear}-${String(parsedMonth).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;
  return { year: parsedYear, month: parsedMonth, start, end };
}

function summarizeBy(items, field) {
  return items.reduce((summary, item) => {
    const key = item[field] || 'unknown';
    summary[key] = (summary[key] || 0) + 1;
    return summary;
  }, {});
}

router.get('/:type/:year/:month', auth, asyncHandler(async (req, res) => {
  if (!canViewReports(req.user.role)) return res.status(403).json({ error: 'forbidden' });

  const period = reportPeriod(req.params.year, req.params.month);
  if (period.error) return res.status(400).json({ error: period.error });

  const type = String(req.params.type || '').toLowerCase();

  if (type === 'attendance') {
    const records = await Attendance.findAll({
      where: { date: { [Op.between]: [period.start, period.end] } },
      include: [{ model: Employee, attributes: ['employeeId', 'name', 'designation', 'role'] }],
      order: [['date', 'ASC']],
    });
    const rows = records.map((record) => ({
      id: record.id,
      date: record.date,
      status: record.status,
      shift: record.shift,
      clockIn: record.clockIn,
      clockOut: record.clockOut,
      employee: record.Employee,
    }));
    return res.json({
      type,
      period,
      totalRecords: rows.length,
      summary: summarizeBy(rows, 'status'),
      records: rows,
    });
  }

  if (type === 'payroll') {
    const records = await Payroll.findAll({
      where: { year: period.year, month: period.month },
      include: [{ model: Employee, attributes: ['employeeId', 'name', 'designation', 'role'] }],
      order: [['createdAt', 'DESC']],
    });
    const rows = records.map((record) => ({
      id: record.id,
      employee: record.Employee,
      gross: Number(record.gross || 0),
      net: Number(record.net || 0),
      details: record.details || {},
    }));
    return res.json({
      type,
      period,
      totalRecords: rows.length,
      grossTotal: rows.reduce((total, row) => total + row.gross, 0),
      netTotal: rows.reduce((total, row) => total + row.net, 0),
      records: rows,
    });
  }

  if (type === 'leaves') {
    const records = await LeaveRequest.findAll({
      where: {
        [Op.or]: [
          { startDate: { [Op.between]: [period.start, period.end] } },
          { endDate: { [Op.between]: [period.start, period.end] } },
        ],
      },
      include: [{ model: Employee, attributes: ['employeeId', 'name', 'designation', 'role'] }],
      order: [['startDate', 'ASC']],
    });
    const rows = records.map((record) => ({
      id: record.id,
      leaveType: record.leaveType,
      startDate: record.startDate,
      endDate: record.endDate,
      status: record.status,
      employee: record.Employee,
    }));
    return res.json({
      type,
      period,
      totalRecords: rows.length,
      summary: summarizeBy(rows, 'status'),
      records: rows,
    });
  }

  if (type === 'employees') {
    const employees = await Employee.findAll({
      attributes: ['employeeId', 'name', 'email', 'designation', 'role', 'salary', 'createdAt'],
      order: [['employeeId', 'ASC']],
    });
    return res.json({
      type,
      period,
      totalRecords: employees.length,
      records: employees,
    });
  }

  return res.status(400).json({ error: 'Unsupported report type' });
}));

module.exports = router;
