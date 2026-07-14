const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const upload = require('../middleware/upload');
const { Attendance, Employee } = require('../models');
const { Op } = require('sequelize');
const faceVerification = require('../services/faceVerificationService');
const path = require('path');
const fs = require('fs');

function todayDateKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

const TEAM_ATTENDANCE_ROLES = ['admin', 'restaurant-manager', 'company-manager'];
const FULL_DAY_MINUTES = 8 * 60;

function canViewTeamAttendance(role) {
  return TEAM_ATTENDANCE_ROLES.includes(role);
}

function normalizeStatus(record) {
  const status = String(record?.status || '').toLowerCase();
  if (['p', 'a', 'o'].includes(status)) return status;
  return record && record.clockIn ? 'p' : '';
}

function statusLabel(status) {
  if (status === 'p') return 'Present';
  if (status === 'a') return 'Absent';
  if (status === 'o') return 'Holiday';
  return 'Not marked';
}

function workingMinutes(record) {
  if (!record || !record.clockIn || !record.clockOut) return 0;
  const clockIn = new Date(record.clockIn).getTime();
  const clockOut = new Date(record.clockOut).getTime();
  if (!Number.isFinite(clockIn) || !Number.isFinite(clockOut) || clockOut <= clockIn) return 0;
  return Math.round((clockOut - clockIn) / 60000);
}

function workTypeFor(record, status, minutes) {
  if (status === 'a') return 'Absent';
  if (status === 'o') return 'Holiday';
  if (record?.clockIn && !record.clockOut) return 'In progress';
  if (minutes >= FULL_DAY_MINUTES) return 'Full day';
  if (minutes > 0) return 'Half day';
  if (status === 'p') return 'Present';
  return 'Not marked';
}

// Clock-in with mandatory selfie
router.post('/clock-in', auth, upload.single('selfie'), asyncHandler(async (req, res) => {
  const date = todayDateKey();
  
  // Validate selfie is provided
  if (!req.file) {
    return res.status(400).json({ error: 'Selfie photo is required for clock-in' });
  }

  // Analyze image quality
  const quality = await faceVerification.analyzeImageQuality(req.file.buffer || fs.readFileSync(req.file.path));
  if (!quality.pass) {
    // Clean up uploaded file
    if (req.file.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    return res.status(400).json({ 
      error: 'Selfie photo quality check failed',
      details: quality.reasons 
    });
  }

  // Check if employee has a profile photo for comparison
  const employee = await Employee.findByPk(req.user.id);
  const employeePhotoPath = faceVerification.getEmployeePhotoPath(employee);
  
  if (employeePhotoPath) {
    // Compare selfie with stored employee photo
    const comparison = await faceVerification.compareFaces(req.file.path, employeePhotoPath);
    if (!comparison.match) {
      // Clean up uploaded file
      if (req.file.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(400).json({ 
        error: 'Face verification failed. The selfie does not match your profile photo.',
        similarity: comparison.similarity
      });
    }
  }

  // Save selfie to permanent storage
  const selfiePath = await faceVerification.saveSelfie(
    fs.readFileSync(req.file.path),
    req.user.employeeId,
    'clockIn'
  );

  // Clean up temp upload
  if (req.file.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);

  const existing = await Attendance.findOne({ where: { employeeId: req.user.id, date } });
  if (existing && existing.clockIn) return res.status(400).json({ error: 'already clocked in' });
  
  const att = existing || Attendance.build({ employeeId: req.user.id, date });
  att.clockIn = new Date();
  att.clockInPhoto = selfiePath;
  att.status = 'p';
  await att.save();
  
  res.json({ 
    ...att.toJSON(),
    faceVerified: !!employeePhotoPath,
    photoQuality: quality
  });
}));

// Clock-out with mandatory selfie
router.post('/clock-out', auth, upload.single('selfie'), asyncHandler(async (req, res) => {
  const date = todayDateKey();
  
  // Validate selfie is provided
  if (!req.file) {
    return res.status(400).json({ error: 'Selfie photo is required for clock-out' });
  }

  // Analyze image quality
  const quality = await faceVerification.analyzeImageQuality(req.file.buffer || fs.readFileSync(req.file.path));
  if (!quality.pass) {
    if (req.file.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    return res.status(400).json({ 
      error: 'Selfie photo quality check failed',
      details: quality.reasons 
    });
  }

  // Check if employee has a profile photo for comparison
  const employee = await Employee.findByPk(req.user.id);
  const employeePhotoPath = faceVerification.getEmployeePhotoPath(employee);
  
  if (employeePhotoPath) {
    // Compare selfie with stored employee photo
    const comparison = await faceVerification.compareFaces(req.file.path, employeePhotoPath);
    if (!comparison.match) {
      if (req.file.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(400).json({ 
        error: 'Face verification failed. The selfie does not match your profile photo.',
        similarity: comparison.similarity
      });
    }
  }

  // Save selfie to permanent storage
  const selfiePath = await faceVerification.saveSelfie(
    fs.readFileSync(req.file.path),
    req.user.employeeId,
    'clockOut'
  );

  // Clean up temp upload
  if (req.file.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);

  const att = await Attendance.findOne({ where: { employeeId: req.user.id, date } });
  if (!att || !att.clockIn) return res.status(400).json({ error: 'not clocked in' });
  if (att.clockOut) return res.status(400).json({ error: 'already clocked out' });
  
  att.clockOut = new Date();
  att.clockOutPhoto = selfiePath;
  att.status = att.status || 'p';
  await att.save();
  
  res.json({ 
    ...att.toJSON(),
    faceVerified: !!employeePhotoPath,
    photoQuality: quality
  });
}));

router.get('/me', auth, asyncHandler(async (req, res) => {
  const records = await Attendance.findAll({ where: { employeeId: req.user.id }, order: [['date', 'DESC']] });
  const enriched = records.map(r => {
    const json = r.toJSON();
    return {
      ...json,
      clockInPhotoUrl: json.clockInPhoto ? json.clockInPhoto : null,
      clockOutPhotoUrl: json.clockOutPhoto ? json.clockOutPhoto : null,
    };
  });
  res.json(enriched);
}));

router.get('/month/:year/:month', auth, asyncHandler(async (req, res) => {
  if (!canViewTeamAttendance(req.user.role)) return res.status(403).json({ error: 'forbidden' });

  const year = parseInt(req.params.year, 10);
  const month = parseInt(req.params.month, 10);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return res.status(400).json({ error: 'valid year and month are required' });
  }

  const start = new Date(year, month - 1, 1).toISOString().slice(0, 10);
  const end = new Date(year, month, 0).toISOString().slice(0, 10);
  const daysInMonth = new Date(year, month, 0).getDate();
  const employees = await Employee.findAll({
    attributes: ['id', 'employeeId', 'name', 'email', 'role', 'designation', 'shiftRoster', 'photoUrl'],
    order: [['name', 'ASC']],
  });
  const employeeIds = employees.map((employee) => employee.id);
  const records = employeeIds.length
    ? await Attendance.findAll({
        where: {
          employeeId: { [Op.in]: employeeIds },
          date: { [Op.between]: [start, end] },
        },
        order: [['date', 'ASC']],
      })
    : [];

  const recordsByEmployeeDate = new Map(
    records.map((record) => [`${record.employeeId}:${record.date}`, record])
  );

  const summary = {
    employees: employees.length,
    present: 0,
    absent: 0,
    holiday: 0,
    notMarked: 0,
    fullDays: 0,
    halfDays: 0,
    inProgress: 0,
    totalWorkingMinutes: 0,
  };

  const resultEmployees = employees.map((employee) => {
    const employeeSummary = {
      present: 0,
      absent: 0,
      holiday: 0,
      notMarked: 0,
      fullDays: 0,
      halfDays: 0,
      inProgress: 0,
      totalWorkingMinutes: 0,
    };

    const days = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const record = recordsByEmployeeDate.get(`${employee.id}:${date}`) || null;
      const status = normalizeStatus(record);
      const minutes = workingMinutes(record);
      const workType = workTypeFor(record, status, minutes);

      if (status === 'p') {
        employeeSummary.present += 1;
        summary.present += 1;
      } else if (status === 'a') {
        employeeSummary.absent += 1;
        summary.absent += 1;
      } else if (status === 'o') {
        employeeSummary.holiday += 1;
        summary.holiday += 1;
      } else {
        employeeSummary.notMarked += 1;
        summary.notMarked += 1;
      }

      if (workType === 'Full day') {
        employeeSummary.fullDays += 1;
        summary.fullDays += 1;
      } else if (workType === 'Half day') {
        employeeSummary.halfDays += 1;
        summary.halfDays += 1;
      } else if (workType === 'In progress') {
        employeeSummary.inProgress += 1;
        summary.inProgress += 1;
      }

      employeeSummary.totalWorkingMinutes += minutes;
      summary.totalWorkingMinutes += minutes;

      days.push({
        day,
        date,
        weekday: new Date(`${date}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short' }),
        status,
        statusLabel: statusLabel(status),
        workType,
        workingMinutes: minutes,
        clockIn: record ? record.clockIn : null,
        clockOut: record ? record.clockOut : null,
        clockInPhotoUrl: record ? (record.clockInPhoto || null) : null,
        clockOutPhotoUrl: record ? (record.clockOutPhoto || null) : null,
        shift: record ? (record.shift || '') : '',
      });
    }

    return {
      id: employee.id,
      employeeId: employee.employeeId,
      name: employee.name,
      email: employee.email,
      role: employee.role,
      designation: employee.designation,
      shiftRoster: employee.shiftRoster || {},
      photoUrl: employee.photoUrl,
      summary: employeeSummary,
      days,
    };
  });

  res.json({
    year,
    month,
    start,
    end,
    daysInMonth,
    fullDayMinutes: FULL_DAY_MINUTES,
    summary,
    employees: resultEmployees,
  });
}));

router.get('/employee/:employeeId', auth, asyncHandler(async (req, res) => {
  const employee = await Employee.findOne({ where: { employeeId: req.params.employeeId } });
  if (!employee) return res.status(404).json({ error: 'employee not found' });
  if (req.user.role !== 'admin' && req.user.id !== employee.id) return res.status(403).json({ error: 'forbidden' });
  const records = await Attendance.findAll({ where: { employeeId: employee.id }, order: [['date', 'DESC']] });
  res.json(records);
}));

// get attendance for a given employee month (year, month are numbers)
router.get('/employee/:employeeId/month/:year/:month', auth, asyncHandler(async (req, res) => {
  const { year, month } = req.params;
  const employee = await Employee.findOne({ where: { employeeId: req.params.employeeId } });
  if (!employee) return res.status(404).json({ error: 'employee not found' });
  if (req.user.role !== 'admin' && req.user.role !== 'restaurant-manager' && req.user.role !== 'company-manager' && req.user.id !== employee.id) return res.status(403).json({ error: 'forbidden' });

  const y = parseInt(year, 10);
  const m = parseInt(month, 10);
  const start = new Date(y, m - 1, 1).toISOString().slice(0,10);
  const end = new Date(y, m, 0).toISOString().slice(0,10);

  const records = await Attendance.findAll({ where: { employeeId: employee.id, date: { [Op.between]: [start, end] } } });
  const daysInMonth = new Date(y, m, 0).getDate();
  const result = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dd = (`0${d}`).slice(-2);
    const date = `${y}-${('0'+m).slice(-2)}-${dd}`;
    const rec = records.find(r => r.date === date);
    result.push({ 
      day: d, 
      date, 
      status: rec ? (rec.status || '') : '', 
      shift: rec ? (rec.shift || '') : '',
      clockIn: rec ? rec.clockIn : null,
      clockOut: rec ? rec.clockOut : null,
      clockInPhotoUrl: rec ? (rec.clockInPhoto || null) : null,
      clockOutPhotoUrl: rec ? (rec.clockOutPhoto || null) : null,
    });
  }
  res.json({ year: y, month: m, days: result });
}));

// manager/admin: set attendance statuses for a month (body: { days: { '1':'p', '2':'a', ... } })
router.post('/employee/:employeeId/month/:year/:month', auth, asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'restaurant-manager' && req.user.role !== 'company-manager') return res.status(403).json({ error: 'forbidden' });
  const { year, month } = req.params;
  const employee = await Employee.findOne({ where: { employeeId: req.params.employeeId } });
  if (!employee) return res.status(404).json({ error: 'employee not found' });
  const days = req.body.days || {};
  const y = parseInt(year, 10);
  const m = parseInt(month, 10);
  const daysInMonth = new Date(y, m, 0).getDate();

  for (let d = 1; d <= daysInMonth; d++) {
    const status = (days[d] || '').toLowerCase();
    if (!['p','a','o',''].includes(status)) continue;
    const dd = (`0${d}`).slice(-2);
    const date = `${y}-${('0'+m).slice(-2)}-${dd}`;
    const [rec, created] = await Attendance.findOrCreate({ where: { employeeId: employee.id, date }, defaults: { status } });
    if (!created) {
      await rec.update({ status });
    }
  }
  // return updated month data
  const start = new Date(y, m - 1, 1).toISOString().slice(0,10);
  const end = new Date(y, m, 0).toISOString().slice(0,10);
  const records = await Attendance.findAll({ where: { employeeId: employee.id, date: { [Op.between]: [start, end] } } });
  const result = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dd = (`0${d}`).slice(-2);
    const date = `${y}-${('0'+m).slice(-2)}-${dd}`;
    const rec = records.find(r => r.date === date);
    result.push({ day: d, date, status: rec ? (rec.status || '') : '' });
  }
  res.json({ year: y, month: m, days: result });
}));

// Set shifts for a month (manager/admin): body { shifts: { '1': 'OFIX', '2': '23', ... } }
router.post('/employee/:employeeId/month/:year/:month/shifts', auth, asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'restaurant-manager' && req.user.role !== 'company-manager') return res.status(403).json({ error: 'forbidden' });
  const { year, month } = req.params;
  const employee = await Employee.findOne({ where: { employeeId: req.params.employeeId } });
  if (!employee) return res.status(404).json({ error: 'employee not found' });
  const shifts = req.body.shifts || {};
  const y = parseInt(year, 10);
  const m = parseInt(month, 10);
  const daysInMonth = new Date(y, m, 0).getDate();

  for (let d = 1; d <= daysInMonth; d++) {
    const shiftVal = (shifts[d] || '').toString();
    const dd = (`0${d}`).slice(-2);
    const date = `${y}-${('0'+m).slice(-2)}-${dd}`;
    const [rec, created] = await Attendance.findOrCreate({ where: { employeeId: employee.id, date }, defaults: { shift: shiftVal } });
    if (!created) {
      await rec.update({ shift: shiftVal });
    }
  }

  // return updated month data
  const start = new Date(y, m - 1, 1).toISOString().slice(0,10);
  const end = new Date(y, m, 0).toISOString().slice(0,10);
  const records2 = await Attendance.findAll({ where: { employeeId: employee.id, date: { [Op.between]: [start, end] } } });
  const result2 = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dd = (`0${d}`).slice(-2);
    const date = `${y}-${('0'+m).slice(-2)}-${dd}`;
    const rec = records2.find(r => r.date === date);
    result2.push({ day: d, date, shift: rec ? (rec.shift || '') : '' });
  }
  res.json({ year: y, month: m, days: result2 });
}));

// Admin: Edit clock-in/clock-out timings for an attendance record
router.put('/:id/edit-timing', auth, asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'forbidden' });

  const att = await Attendance.findByPk(req.params.id);
  if (!att) return res.status(404).json({ error: 'Attendance record not found' });

  const { clockIn, clockOut } = req.body;
  if (!clockIn && !clockOut) {
    return res.status(400).json({ error: 'Provide clockIn and/or clockOut to update' });
  }

  if (clockIn !== undefined) {
    const newClockIn = new Date(clockIn);
    if (isNaN(newClockIn.getTime())) {
      return res.status(400).json({ error: 'Invalid clockIn date format' });
    }
    att.clockIn = newClockIn;
  }

  if (clockOut !== undefined) {
    const newClockOut = new Date(clockOut);
    if (isNaN(newClockOut.getTime())) {
      return res.status(400).json({ error: 'Invalid clockOut date format' });
    }
    att.clockOut = newClockOut;
    att.status = att.status || 'p';
  }

  await att.save();
  res.json({
    ...att.toJSON(),
    message: 'Attendance timings updated successfully',
  });
}));

// Admin: Update paidHolidays for an employee
router.put('/employee/:employeeId/paid-holidays', auth, asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'forbidden' });

  const employee = await Employee.findOne({ where: { employeeId: req.params.employeeId } });
  if (!employee) return res.status(404).json({ error: 'Employee not found' });

  const { paidHolidays } = req.body;
  if (paidHolidays === undefined || paidHolidays < 0) {
    return res.status(400).json({ error: 'paidHolidays must be a non-negative number' });
  }

  employee.paidHolidays = parseInt(paidHolidays, 10) || 0;
  await employee.save();

  res.json({
    message: 'Paid holidays updated successfully',
    employeeId: employee.employeeId,
    paidHolidays: employee.paidHolidays,
  });
}));

module.exports = router;
