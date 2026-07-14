const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const { Employee, Attendance, Payroll } = require('../models');
const { Op } = require('sequelize');

function canManage(role) {
  return ['admin', 'company-manager', 'restaurant-manager'].includes(role);
}

// ==================== ORGANIZATION CHART ====================
router.get('/org-chart', auth, asyncHandler(async (req, res) => {
  if (!canManage(req.user.role)) return res.status(403).json({ error: 'forbidden' });
  
  const employees = await Employee.findAll({
    attributes: ['employeeId', 'name', 'designation', 'role', 'photoUrl', 'department', 'email', 'phone'],
  });

  // Build hierarchy
  const orgChart = {
    name: 'A K S Reyadah Trading L.L.C',
    title: 'Company',
    children: [],
  };

  const admins = employees.filter(e => e.role === 'admin');
  const managers = employees.filter(e => e.role === 'company-manager' || e.role === 'restaurant-manager');
  const staff = employees.filter(e => e.role === 'employee');

  const adminNodes = admins.map(a => ({
    employeeId: a.employeeId,
    name: a.name,
    title: a.designation || 'Admin',
    role: a.role,
    photoUrl: a.photoUrl,
    department: a.department,
    email: a.email,
  }));

  const managerNodes = managers.map(m => ({
    employeeId: m.employeeId,
    name: m.name,
    title: m.designation || 'Manager',
    role: m.role,
    photoUrl: m.photoUrl,
    department: m.department,
    email: m.email,
  }));

  const staffNodes = staff.map(s => ({
    employeeId: s.employeeId,
    name: s.name,
    title: s.designation || 'Employee',
    role: s.role,
    photoUrl: s.photoUrl,
    department: s.department,
    email: s.email,
  }));

  // Group by department
  const departments = {};
  employees.forEach(e => {
    const dept = e.department || 'General';
    if (!departments[dept]) departments[dept] = [];
    departments[dept].push({
      employeeId: e.employeeId,
      name: e.name,
      title: e.designation || e.role,
      role: e.role,
      photoUrl: e.photoUrl,
      email: e.email,
      phone: e.phone,
    });
  });

  res.json({
    hierarchy: { admins: adminNodes, managers: managerNodes, staff: staffNodes },
    departments,
    totalEmployees: employees.length,
    totalAdmins: admins.length,
    totalManagers: managers.length,
    totalStaff: staff.length,
  });
}));

// ==================== EMPLOYEE FINES ====================
router.get('/:employeeId/fines', auth, asyncHandler(async (req, res) => {
  if (!canManage(req.user.role)) return res.status(403).json({ error: 'forbidden' });
  const emp = await Employee.findOne({ where: { employeeId: req.params.employeeId } });
  if (!emp) return res.status(404).json({ error: 'Employee not found' });
  res.json({ fines: emp.fines || [], total: (emp.fines || []).length });
}));

router.post('/:employeeId/fines', auth, asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'forbidden' });
  const { amount, reason, fineType, date } = req.body;
  if (!amount || !reason) return res.status(400).json({ error: 'Amount and reason required' });

  const emp = await Employee.findOne({ where: { employeeId: req.params.employeeId } });
  if (!emp) return res.status(404).json({ error: 'Employee not found' });

  const fines = emp.fines || [];
  fines.push({
    id: Date.now() + Math.floor(Math.random() * 1000),
    amount: parseFloat(amount),
    reason,
    fineType: fineType || 'other',
    date: date || new Date().toISOString().split('T')[0],
    status: 'unpaid',
    createdAt: new Date(),
  });
  await emp.update({ fines });
  res.status(201).json({ fines, total: fines.length });
}));

router.put('/:employeeId/fines/:fineId/pay', auth, asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'forbidden' });
  const emp = await Employee.findOne({ where: { employeeId: req.params.employeeId } });
  if (!emp) return res.status(404).json({ error: 'Employee not found' });

  const fines = (emp.fines || []).map(f => {
    if (f.id === parseInt(req.params.fineId) || String(f.id) === req.params.fineId) {
      return { ...f, status: 'paid', paidAt: new Date() };
    }
    return f;
  });
  await emp.update({ fines });
  res.json({ fines, message: 'Fine marked as paid' });
}));

router.delete('/:employeeId/fines/:fineId', auth, asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'forbidden' });
  const emp = await Employee.findOne({ where: { employeeId: req.params.employeeId } });
  if (!emp) return res.status(404).json({ error: 'Employee not found' });

  const fineId = parseInt(req.params.fineId) || req.params.fineId;
  const fines = (emp.fines || []).filter(f => f.id !== fineId && String(f.id) !== String(fineId));
  await emp.update({ fines });
  res.json({ fines, message: 'Fine removed' });
}));

// ==================== EMPLOYEE FULL PROFILE ====================
router.get('/:employeeId/full-profile', auth, asyncHandler(async (req, res) => {
  if (!canManage(req.user.role)) return res.status(403).json({ error: 'forbidden' });

  const emp = await Employee.findOne({ where: { employeeId: req.params.employeeId } });
  if (!emp) return res.status(404).json({ error: 'Employee not found' });

  // Get attendance stats
  const attendanceRecords = await Attendance.findAll({
    where: { employeeId: emp.id },
    order: [['date', 'DESC']],
    limit: 30,
  });

  // Get payroll records
  const payrollRecords = await Payroll.findAll({
    where: { employeeId: emp.id },
    order: [['year', 'DESC'], ['month', 'DESC']],
    limit: 6,
  });

  // Calculate fine totals
  const fines = emp.fines || [];
  const totalFines = fines.reduce((sum, f) => sum + parseFloat(f.amount || 0), 0);
  const unpaidFines = fines.filter(f => f.status === 'unpaid');
  const totalUnpaid = unpaidFines.reduce((sum, f) => sum + parseFloat(f.amount || 0), 0);

  res.json({
    employee: {
      employeeId: emp.employeeId,
      name: emp.name,
      email: emp.email,
      phone: emp.phone,
      designation: emp.designation,
      role: emp.role,
      department: emp.department,
      nationality: emp.nationality,
      photoUrl: emp.photoUrl,
      dateOfBirth: emp.dateOfBirth,
      salary: emp.salary,
      createdAt: emp.createdAt,
    },
    fines: {
      items: fines,
      totalFines,
      unpaidCount: unpaidFines.length,
      totalUnpaid,
    },
    documents: emp.documents || [],
    assets: emp.assets || [],
    emergencyContact: emp.emergencyContact || {},
    bankDetails: emp.bankDetails || {},
    education: emp.education || [],
    visaInfo: emp.visaInfo || {},
    contractInfo: emp.contractInfo || {},
    shiftRoster: emp.shiftRoster || {},
    leaveEntitlements: emp.leaveEntitlements || {},
    attendance: {
      recent: attendanceRecords,
      total: attendanceRecords.length,
    },
    payroll: {
      records: payrollRecords,
      total: payrollRecords.length,
    },
  });
}));

// ==================== UPDATE EMPLOYEE DETAILS (enhanced profile) ====================
router.put('/:employeeId/profile', auth, asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'forbidden' });
  const emp = await Employee.findOne({ where: { employeeId: req.params.employeeId } });
  if (!emp) return res.status(404).json({ error: 'Employee not found' });

  const updates = {};
  const allowedFields = ['department', 'phone', 'nationality', 'dateOfBirth', 'emergencyContact', 'bankDetails', 'education', 'visaInfo', 'contractInfo'];
  
  for (const field of allowedFields) {
    if (req.body[field] !== undefined) {
      updates[field] = req.body[field];
    }
  }
  
  await emp.update(updates);
  res.json({ message: 'Profile updated successfully', employee: emp });
}));

module.exports = router;