const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const { Attendance, Employee, LeaveRequest, Payroll, ZkTecoDevice } = require('../models');

router.get('/', auth, asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'forbidden' });

  const [employees, attendance, leaves, payroll, devices] = await Promise.all([
    Employee.count(),
    Attendance.count(),
    LeaveRequest.count(),
    Payroll.count(),
    ZkTecoDevice.count(),
  ]);

  res.json([
    {
      action: 'System summary',
      details: `${employees} employees, ${attendance} attendance records, ${leaves} leave requests, ${payroll} payroll records, ${devices} devices`,
      performedBy: 'System',
      createdAt: new Date().toISOString(),
    },
  ]);
}));

module.exports = router;
