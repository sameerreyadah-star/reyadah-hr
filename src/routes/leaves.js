const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const { LeaveRequest, Employee, AirTicketReimbursement } = require('../models');

const DEFAULT_ANNUAL_LEAVE_DAYS = Number(process.env.DEFAULT_ANNUAL_LEAVE_DAYS || 30);
const DEFAULT_PH_LEAVE_DAYS = Number(process.env.DEFAULT_PH_LEAVE_DAYS || 10);

function serializeLeave(leave) {
  const data = leave.toJSON ? leave.toJSON() : leave;
  return {
    ...data,
    employee: leave.Employee ? {
      employeeId: leave.Employee.employeeId,
      name: leave.Employee.name,
      designation: leave.Employee.designation,
      role: leave.Employee.role,
    } : undefined,
  };
}

function countLeaveDays(startDate, endDate) {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0;
  return Math.floor((end - start) / 86400000) + 1;
}

function leaveBucket(leaveType) {
  const normalized = String(leaveType || '').trim().toLowerCase().replace(/[_-]+/g, ' ');
  if (normalized === 'annual' || normalized.includes('annual')) return 'annual';
  if (normalized === 'ph' || normalized.includes('public holiday')) return 'ph';
  return null;
}

const DEFAULT_LEAVE_TYPES = [
  { type: 'Annual', defaultDays: 30 },
  { type: 'PH', defaultDays: 10 },
  { type: 'Sick', defaultDays: 15 },
  { type: 'Emergency', defaultDays: 5 },
  { type: 'Other', defaultDays: 5 },
];

function createBalanceRecord(employee) {
  const entitlements = employee.leaveEntitlements || {};
  const record = {
    employeeId: employee.employeeId,
    name: employee.name,
    designation: employee.designation || '',
    role: employee.role || 'employee',
    photoUrl: employee.photoUrl || '',
  };
  for (const lt of DEFAULT_LEAVE_TYPES) {
    const key = lt.type.toLowerCase();
    const customEntitlement = entitlements[key];
    const entitlement = customEntitlement != null ? Number(customEntitlement) : lt.defaultDays;
    record[key] = {
      entitlement,
      approved: 0,
      pending: 0,
      balance: entitlement,
    };
  }
  return record;
}

router.post('/', auth, asyncHandler(async (req, res) => {
  const { leaveType, startDate, endDate, reason } = req.body;
  if (!leaveType || !startDate || !endDate || !reason) {
    return res.status(400).json({ error: 'leaveType, startDate, endDate, and reason are required' });
  }
  if (new Date(endDate) < new Date(startDate)) {
    return res.status(400).json({ error: 'endDate must be on or after startDate' });
  }
  const leave = await LeaveRequest.create({
    employeeId: req.user.id,
    leaveType,
    startDate,
    endDate,
    reason,
  });
  res.json(serializeLeave(leave));
}));

router.get('/', auth, asyncHandler(async (req, res) => {
  let leaves;
  if (req.user.role === 'employee') {
    leaves = await LeaveRequest.findAll({
      where: { employeeId: req.user.id },
      order: [['createdAt', 'DESC']],
    });
  } else if (req.user.role === 'restaurant-manager') {
    leaves = await LeaveRequest.findAll({
      where: { status: 'pending_manager' },
      order: [['createdAt', 'DESC']],
      include: [Employee],
    });
  } else if (req.user.role === 'company-manager') {
    leaves = await LeaveRequest.findAll({
      where: { status: 'pending_company' },
      order: [['createdAt', 'DESC']],
      include: [Employee],
    });
  } else if (req.user.role === 'admin') {
    leaves = await LeaveRequest.findAll({
      order: [['createdAt', 'DESC']],
      include: [Employee],
    });
  } else {
    return res.status(403).json({ error: 'forbidden' });
  }
  res.json(leaves.map(serializeLeave));
}));

router.get('/balances', auth, asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'forbidden' });

  const employees = await Employee.findAll({
    attributes: ['id', 'employeeId', 'name', 'designation', 'role', 'photoUrl', 'leaveEntitlements', 'paidHolidays'],
    order: [['name', 'ASC']],
  });
  const balancesByPk = new Map(employees.map((employee) => [employee.id, createBalanceRecord(employee)]));
  const leaves = await LeaveRequest.findAll();

  leaves.forEach((leave) => {
    const balance = balancesByPk.get(leave.employeeId);
    const bucket = leaveBucket(leave.leaveType);
    if (!balance || !bucket) return;

    const days = countLeaveDays(leave.startDate, leave.endDate);
    if (!days) return;

    if (leave.status === 'approved') {
      balance[bucket].approved += days;
    } else if (leave.status !== 'rejected') {
      balance[bucket].pending += days;
    }
  });

  const balances = Array.from(balancesByPk.values()).map((balance) => {
    balance.annual.balance = Math.max(0, balance.annual.entitlement - balance.annual.approved);
    balance.ph.balance = Math.max(0, balance.ph.entitlement - balance.ph.approved);
    return balance;
  });

  res.json({
    asOf: new Date().toISOString(),
    defaults: {
      annualEntitlement: DEFAULT_ANNUAL_LEAVE_DAYS,
      phEntitlement: DEFAULT_PH_LEAVE_DAYS,
    },
    employees: balances,
  });
}));

// Auto-create Air Ticket Reimbursement (AED 500) when annual leave is approved
async function autoCreateAirTicketReimbursement(leave, employee) {
  try {
    const leaveType = String(leave.leaveType || '').trim().toLowerCase();
    if (!leaveType.includes('annual')) return; // Only for annual leave

    // Check if already created for this leave
    const existing = await AirTicketReimbursement.findOne({
      where: { employeeId: employee.employeeId, purpose: `Annual Leave ${leave.id}` }
    });
    if (existing) return;

    await AirTicketReimbursement.create({
      employeeId: employee.employeeId,
      amount: 500,
      ticketType: 'domestic',
      purpose: `Annual Leave ${leave.id}`,
      departureCity: 'UAE',
      destinationCity: 'Home Country',
      airline: 'Auto',
      ticketNumber: `AUTO-${Date.now()}`,
      departureDate: leave.startDate,
      returnDate: leave.endDate,
      status: 'approved',
      approvedAt: new Date(),
    });
    console.log(`[Auto AirTicket] Created AED 500 reimbursement for ${employee.employeeId} (Annual Leave #${leave.id})`);
  } catch (err) {
    console.error('[Auto AirTicket] Error creating reimbursement:', err.message);
  }
}

router.put('/:id/manager', auth, asyncHandler(async (req, res) => {
  if (req.user.role !== 'restaurant-manager' && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'forbidden' });
  }
  const leave = await LeaveRequest.findOne({ where: { id: req.params.id }, include: [Employee] });
  if (!leave) return res.status(404).json({ error: 'leave request not found' });
  if (leave.managerApproval.status !== 'pending') {
    return res.status(400).json({ error: 'manager decision already recorded' });
  }
  const { action, note } = req.body;
  if (!['approve', 'reject'].includes(action)) {
    return res.status(400).json({ error: 'action must be approve or reject' });
  }
  leave.managerApproval = {
    status: action === 'approve' ? 'approved' : 'rejected',
    approverId: req.user.id,
    approverName: req.user.name || req.user.employeeId,
    note: note || '',
    at: new Date(),
  };
  leave.status = action === 'approve' ? 'pending_company' : 'rejected';
  await leave.save();
  res.json(serializeLeave(leave));
}));

router.put('/:id/company', auth, asyncHandler(async (req, res) => {
  if (req.user.role !== 'company-manager' && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'forbidden' });
  }
  const leave = await LeaveRequest.findOne({ where: { id: req.params.id }, include: [Employee] });
  if (!leave) return res.status(404).json({ error: 'leave request not found' });
  if (leave.managerApproval.status !== 'approved') {
    return res.status(400).json({ error: 'leave must be approved by restaurant manager first' });
  }
  if (leave.companyApproval.status !== 'pending') {
    return res.status(400).json({ error: 'company decision already recorded' });
  }
  const { action, note } = req.body;
  if (!['approve', 'reject'].includes(action)) {
    return res.status(400).json({ error: 'action must be approve or reject' });
  }
  leave.companyApproval = {
    status: action === 'approve' ? 'approved' : 'rejected',
    approverId: req.user.id,
    approverName: req.user.name || req.user.employeeId,
    note: note || '',
    at: new Date(),
  };
  leave.status = action === 'approve' ? 'approved' : 'rejected';
  await leave.save();

  // Auto-create Air Ticket Reimbursement if annual leave was approved
  if (leave.status === 'approved') {
    const employee = leave.Employee || await Employee.findByPk(leave.employeeId);
    if (employee) {
      autoCreateAirTicketReimbursement(leave, employee);
    }
  }

  res.json(serializeLeave(leave));
}));

// Admin: Get employee leave entitlements and full balance details
router.get('/employee/:employeeId', auth, asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'forbidden' });

  const employee = await Employee.findOne({ where: { employeeId: req.params.employeeId } });
  if (!employee) return res.status(404).json({ error: 'Employee not found' });

  const entitlements = employee.leaveEntitlements || {};
  
  // Calculate balances from all leaves (approved/pending) for each leave type
  const allLeaves = await LeaveRequest.findAll({
    where: { employeeId: employee.id },
    order: [['createdAt', 'DESC']],
  });

  const leaveTypes = ['Annual', 'PH', 'Sick', 'Emergency', 'Other'];
  const leaveData = {};

  for (const lt of leaveTypes) {
    const key = lt.toLowerCase();
    const defaultDaysMap = { annual: 30, ph: 10, sick: 15, emergency: 5, other: 5 };
    const entitlement = entitlements[key] != null ? Number(entitlements[key]) : defaultDaysMap[key] || 5;
    
    const typeLeaves = allLeaves.filter(l => {
      const normalized = String(l.leaveType || '').trim().toLowerCase();
      return normalized === key || normalized.includes(key);
    });

    let approved = 0;
    let pending = 0;
    for (const l of typeLeaves) {
      const days = countLeaveDays(l.startDate, l.endDate);
      if (l.status === 'approved') approved += days;
      else if (l.status !== 'rejected') pending += days;
    }

    leaveData[key] = {
      type: lt,
      entitlement,
      approved,
      pending,
      balance: Math.max(0, entitlement - approved),
      leaves: typeLeaves.map(l => ({
        id: l.id,
        leaveType: l.leaveType,
        startDate: l.startDate,
        endDate: l.endDate,
        reason: l.reason,
        status: l.status,
        createdAt: l.createdAt,
      })),
    };
  }

  res.json({
    employee: {
      employeeId: employee.employeeId,
      name: employee.name,
      email: employee.email,
      designation: employee.designation,
      role: employee.role,
      photoUrl: employee.photoUrl,
    },
    leaveTypes: leaveData,
    allLeaves: allLeaves.map(l => ({
      id: l.id,
      leaveType: l.leaveType,
      startDate: l.startDate,
      endDate: l.endDate,
      reason: l.reason,
      status: l.status,
      createdAt: l.createdAt,
    })),
  });
}));

// Admin/Manager: Apply leave on behalf of an employee
router.post('/admin', auth, asyncHandler(async (req, res) => {
  if (req.user.role !== 'restaurant-manager' && req.user.role !== 'company-manager' && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'forbidden' });
  }
  const { employeeId, leaveType, startDate, endDate, reason, autoApprove } = req.body;
  if (!employeeId || !leaveType || !startDate || !endDate || !reason) {
    return res.status(400).json({ error: 'employeeId, leaveType, startDate, endDate, and reason are required' });
  }
  if (new Date(endDate) < new Date(startDate)) {
    return res.status(400).json({ error: 'endDate must be on or after startDate' });
  }

  // Find the target employee by employeeId string
  const employee = await Employee.findOne({ where: { employeeId } });
  if (!employee) {
    return res.status(404).json({ error: 'Employee not found' });
  }

  const shouldAutoApprove = autoApprove !== false; // default to true

  const leaveData = {
    employeeId: employee.id,
    leaveType,
    startDate,
    endDate,
    reason,
    status: shouldAutoApprove ? 'approved' : 'pending_manager',
    managerApproval: {
      status: shouldAutoApprove ? 'approved' : 'pending',
      approverId: req.user.id,
      approverName: req.user.name || req.user.employeeId,
      note: `Applied on behalf by ${req.user.name || req.user.employeeId}`,
      at: new Date(),
    },
    companyApproval: {
      status: shouldAutoApprove ? 'approved' : 'pending',
      approverId: shouldAutoApprove ? req.user.id : null,
      approverName: shouldAutoApprove ? (req.user.name || req.user.employeeId) : null,
      note: shouldAutoApprove ? `Auto-approved by ${req.user.name || req.user.employeeId}` : '',
      at: shouldAutoApprove ? new Date() : null,
    },
  };

  const leave = await LeaveRequest.create(leaveData);

  // Auto-create Air Ticket Reimbursement if annual leave was auto-approved
  if (shouldAutoApprove && String(leaveType || '').trim().toLowerCase().includes('annual')) {
    autoCreateAirTicketReimbursement(leave, employee);
  }

  res.json(serializeLeave(leave));
}));

// Admin: Update employee leave entitlements
router.put('/employee/:employeeId/entitlements', auth, asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'forbidden' });

  const employee = await Employee.findOne({ where: { employeeId: req.params.employeeId } });
  if (!employee) return res.status(404).json({ error: 'Employee not found' });

  const { entitlements } = req.body;
  if (!entitlements || typeof entitlements !== 'object') {
    return res.status(400).json({ error: 'entitlements must be an object with leave type keys' });
  }

  const currentEntitlements = employee.leaveEntitlements || {};
  const validKeys = ['annual', 'ph', 'sick', 'emergency', 'other'];
  
  for (const key of validKeys) {
    if (entitlements[key] !== undefined) {
      const val = Number(entitlements[key]);
      if (val >= 0) {
        currentEntitlements[key] = val;
      }
    }
  }

  employee.leaveEntitlements = currentEntitlements;
  await employee.save();

  res.json({
    message: 'Leave entitlements updated successfully',
    employeeId: employee.employeeId,
    entitlements: currentEntitlements,
  });
}));

// ==================== LEAVE ADJUSTMENTS (add/subtract leave days with audit trail) ====================
router.post('/employee/:employeeId/adjust', auth, asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'company-manager') {
    return res.status(403).json({ error: 'forbidden' });
  }

  const employee = await Employee.findOne({ where: { employeeId: req.params.employeeId } });
  if (!employee) return res.status(404).json({ error: 'Employee not found' });

  const { leaveType, days, reason } = req.body;
  
  if (!leaveType || !days || !reason) {
    return res.status(400).json({ error: 'leaveType, days, and reason are required' });
  }

  const validTypes = ['annual', 'ph', 'sick', 'emergency', 'other'];
  const typeKey = leaveType.toLowerCase();
  if (!validTypes.includes(typeKey)) {
    return res.status(400).json({ error: `Invalid leave type. Valid types: ${validTypes.join(', ')}` });
  }

  const dayCount = parseFloat(days);
  if (isNaN(dayCount) || dayCount === 0) {
    return res.status(400).json({ error: 'Days must be a non-zero number' });
  }

  // Update entitlements
  const entitlements = employee.leaveEntitlements || {};
  const currentVal = Number(entitlements[typeKey]) || 0;
  entitlements[typeKey] = Math.max(0, currentVal + dayCount);
  employee.leaveEntitlements = entitlements;

  // Add audit trail
  const adjustments = employee.leaveAdjustments || [];
  adjustments.push({
    id: Date.now() + Math.floor(Math.random() * 1000),
    leaveType: typeKey,
    days: dayCount,
    reason,
    createdBy: req.user.name || req.user.employeeId,
    createdById: req.user.employeeId,
    createdAt: new Date(),
    previousEntitlement: currentVal,
    newEntitlement: entitlements[typeKey],
  });
  employee.leaveAdjustments = adjustments;

  await employee.save();

  res.json({
    message: `✅ ${dayCount > 0 ? 'Added' : 'Subtracted'} ${Math.abs(dayCount)} ${typeKey} leave day(s) successfully`,
    employeeId: employee.employeeId,
    leaveType: typeKey,
    previousEntitlement: currentVal,
    newEntitlement: entitlements[typeKey],
    adjustment: adjustments[adjustments.length - 1],
    totalAdjustments: adjustments.length,
  });
}));

// Get leave adjustment history for an employee
router.get('/employee/:employeeId/adjustments', auth, asyncHandler(async (req, res) => {
  if (!['admin', 'company-manager', 'restaurant-manager'].includes(req.user.role)) {
    return res.status(403).json({ error: 'forbidden' });
  }

  const employee = await Employee.findOne({ where: { employeeId: req.params.employeeId } });
  if (!employee) return res.status(404).json({ error: 'Employee not found' });

  const adjustments = (employee.leaveAdjustments || []).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  res.json({
    employeeId: employee.employeeId,
    name: employee.name,
    totalAdjustments: adjustments.length,
    adjustments,
  });
}));

module.exports = router;