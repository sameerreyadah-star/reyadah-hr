const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const { Payroll, Employee, Attendance, Loan, Expense, WorkTiming } = require('../models');
const { Op, literal } = require('sequelize');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

function canManagePayroll(role) {
  return role === 'admin' || role === 'company-manager';
}

function parsePayrollPeriod(month, year) {
  const parsedMonth = Number.parseInt(month, 10);
  const parsedYear = Number.parseInt(year, 10);
  if (!Number.isInteger(parsedMonth) || parsedMonth < 1 || parsedMonth > 12) {
    return { error: 'month must be between 1 and 12' };
  }
  if (!Number.isInteger(parsedYear) || parsedYear < 2000 || parsedYear > 2100) {
    return { error: 'year must be between 2000 and 2100' };
  }
  return { month: parsedMonth, year: parsedYear };
}

function money(value) {
  return Number.parseFloat(Number(value || 0).toFixed(2));
}

/**
 * UAE Labour Law Calculations
 */

// Calculate hourly rate from basic salary (2080 hours/year = 48 weeks * ~43.33 hrs/week)
function calcHourlyRate(basicSalary) {
  return basicSalary / (30 * 8); // monthly basic / (30 days * 8 hours)
}

/**
 * UAE Gratuity Calculation (Article 132 of UAE Labour Law)
 * - Less than 1 year: No gratuity
 * - 1-5 years: 21 days basic pay per year
 * - 5+ years: 30 days basic pay per year
 * - Maximum: 2 years total salary
 */
function calcUaeGratuity(basicSalary, joinDate, endDate = new Date()) {
  if (!joinDate) return { years: 0, months: 0, days: 0, gratuityDays: 0, gratuityAmount: 0, eligible: false };
  
  const start = new Date(joinDate);
  const end = new Date(endDate);
  if (start >= end) return { years: 0, months: 0, days: 0, gratuityDays: 0, gratuityAmount: 0, eligible: false };

  // Calculate total service
  let totalDays = Math.floor((end - start) / (1000 * 60 * 60 * 24));
  const years = Math.floor(totalDays / 365);
  totalDays %= 365;
  const months = Math.floor(totalDays / 30);
  const days = totalDays % 30;

  // Gratuity per day (basic salary / 30)
  const dailyBasic = basicSalary / 30;
  
  let gratuityDays = 0;
  let eligible = false;

  if (years >= 1 && years < 5) {
    // 21 days per year for first 5 years
    gratuityDays = years * 21 + (months * 21 / 12);
    eligible = true;
  } else if (years >= 5) {
    // 30 days per year after 5 years
    gratuityDays = 5 * 21 + (years - 5) * 30 + (months * 30 / 12);
    eligible = true;
  }

  // Cap at 2 years salary (730 days)
  const maxGratuityDays = 730; // 2 years * 365 days
  const finalGratuityDays = Math.min(gratuityDays, maxGratuityDays);
  
  const gratuityAmount = eligible ? dailyBasic * finalGratuityDays : 0;

  return {
    years,
    months,
    days,
    totalServiceDays: Math.floor((end - start) / (1000 * 60 * 60 * 24)),
    gratuityDays: money(finalGratuityDays),
    gratuityAmount: money(gratuityAmount),
    eligible,
    dailyBasic: money(dailyBasic),
  };
}

/**
 * Overtime Calculation (UAE Law Article 67-69)
 * - Normal overtime (weekday): 125% of hourly rate
 * - Weekend overtime: 150% of hourly rate
 * - 11 PM - 4 AM: Additional 50% (total 175% or 200%)
 */
function calcUaeOvertime(overtimeHours, overtimeType) {
  // Overtime type: 'normal' (125%), 'weekend' (150%), 'night' (150-200%)
  const multiplier = overtimeType === 'weekend' ? 1.5 : overtimeType === 'night' ? 1.75 : 1.25;
  return { hours: overtimeHours, multiplier, overtimeAmount: 0 }; // amount calculated with hourly rate
}

/**
 * Sick Leave Pay (UAE Law Article 83)
 * - First 15 days: Full pay
 * - Next 30 days: Half pay  
 * - Next 45 days: No pay (unpaid)
 * Total: 90 days per year maximum
 */
function calcSickLeavePay(basicSalary, sickDaysUsed, sickDaysInMonth) {
  let payPercent = 0;
  
  // Calculate running total including this month
  const totalSickDays = (sickDaysUsed || 0) + sickDaysInMonth;
  
  if (totalSickDays <= 15) {
    payPercent = 1.0; // Full pay
  } else if (totalSickDays <= 45) {
    payPercent = 0.5; // Half pay
  } else {
    payPercent = 0; // No pay
  }

  const dailyBasic = basicSalary / 30;
  return money(dailyBasic * sickDaysInMonth * payPercent);
}

/**
 * Annual Leave Encashment (UAE Law Article 75)
 * When an employee leaves, unused annual leave days are paid at basic salary rate
 */
function calcAnnualLeaveEncashment(basicSalary, unusedLeaveDays) {
  const dailyBasic = basicSalary / 30;
  return money(dailyBasic * unusedLeaveDays);
}

/**
 * Social Insurance (GCC Nationals - Optional)
 * Some UAE companies contribute to GPSSA for GCC nationals
 * Employee: 5% of gross
 * Employer: 15% of gross (not deducted from employee)
 */
function calcSocialInsurance(gross, isGccNational = false) {
  if (!isGccNational) return { employeeShare: 0, employerShare: 0 };
  return {
    employeeShare: money(gross * 0.05),
    employerShare: money(gross * 0.15), // Employer pays separately
  };
}

// ==================== SEARCH EMPLOYEES WITH FULL PAYROLL DETAILS ====================
router.get('/search', auth, asyncHandler(async (req, res) => {
  if (!canManagePayroll(req.user.role)) return res.status(403).json({ error: 'forbidden' });
  const { q, month, year } = req.query;
  if (!q || q.length < 1) return res.json([]);

  const now = new Date();
  const targetMonth = parseInt(month) || (now.getMonth() + 1);
  const targetYear = parseInt(year) || now.getFullYear();

  // Search employees
  const employees = await Employee.findAll({
    where: {
      [Op.or]: [
        { employeeId: { [Op.like]: `%${q}%` } },
        { name: { [Op.like]: `%${q}%` } },
        { email: { [Op.like]: `%${q}%` } },
        { designation: { [Op.like]: `%${q}%` } },
      ],
    },
    limit: 20,
  });

  // For each employee, get full payroll details
  const results = await Promise.all(employees.map(async (emp) => {
    const empData = emp.toJSON();
    const { passwordHash, ...safe } = empData;

    // Get payroll records for this employee
    const payrollRecords = await Payroll.findAll({
      where: { employeeId: emp.id },
      order: [['year', 'DESC'], ['month', 'DESC']],
      limit: 12,
    });

    // Get current month payroll
    const currentPayroll = payrollRecords.find(
      p => p.month === targetMonth && p.year === targetYear
    );

    // Calculate totals
    const totalPaid = payrollRecords
      .filter(p => p.paymentStatus === 'paid')
      .reduce((sum, p) => sum + parseFloat(p.net || 0), 0);

    const totalPending = payrollRecords
      .filter(p => p.paymentStatus === 'pending')
      .reduce((sum, p) => sum + parseFloat(p.net || 0), 0);

    // Get active loans
    const activeLoans = await Loan.findAll({
      where: { employeeId: emp.employeeId, status: 'active' },
    });
    const totalLoanRemaining = activeLoans.reduce((sum, l) => sum + parseFloat(l.remainingAmount || 0), 0);

    // Get pending expenses
    const pendingExpenses = await Expense.findAll({
      where: { employeeId: emp.employeeId, status: 'pending' },
    });
    const totalPendingExpenses = pendingExpenses.reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);

    // Attendance for current month
    const daysInMonth = new Date(targetYear, targetMonth, 0).getDate();
    const start = `${targetYear}-${String(targetMonth).padStart(2, '0')}-01`;
    const end = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;
    const attendance = await Attendance.findAll({
      where: {
        employeeId: emp.id,
        date: { [Op.between]: [start, end] },
      },
    });
    const presentDays = attendance.filter(a => String(a.status || '').toLowerCase() === 'p').length;
    const absentDays = attendance.filter(a => String(a.status || '').toLowerCase() === 'a').length;

    return {
      employee: safe,
      payroll: {
        current: currentPayroll || null,
        records: payrollRecords,
        summary: {
          totalRecords: payrollRecords.length,
          totalPaid: money(totalPaid),
          totalPending: money(totalPending),
          lastPayroll: payrollRecords.length > 0 ? payrollRecords[0] : null,
        },
      },
      loans: {
        active: activeLoans.length,
        totalRemaining: money(totalLoanRemaining),
      },
      expenses: {
        pending: pendingExpenses.length,
        totalPending: money(totalPendingExpenses),
      },
      attendance: {
        presentDays,
        absentDays,
        daysInMonth,
        attendanceRate: daysInMonth > 0 ? Math.round((presentDays / daysInMonth) * 100) : 0,
      },
    };
  }));

  res.json(results);
}));

// ==================== GET PAYROLL SUMMARY ====================
router.get('/summary', auth, asyncHandler(async (req, res) => {
  if (!canManagePayroll(req.user.role)) return res.status(403).json({ error: 'forbidden' });
  const { month, year } = req.query;
  const now = new Date();
  const targetMonth = parseInt(month) || (now.getMonth() + 1);
  const targetYear = parseInt(year) || now.getFullYear();

  const allPayrolls = await Payroll.findAll({
    where: { month: targetMonth, year: targetYear },
    include: [{ model: Employee, attributes: ['employeeId', 'name', 'designation', 'role', 'photoUrl'] }],
  });

  const totalGross = allPayrolls.reduce((s, p) => s + parseFloat(p.gross || 0), 0);
  const totalDeductions = allPayrolls.reduce((s, p) => s + parseFloat(p.totalDeductions || 0), 0);
  const totalNet = allPayrolls.reduce((s, p) => s + parseFloat(p.net || 0), 0);
  const paidCount = allPayrolls.filter(p => p.paymentStatus === 'paid').length;
  const pendingCount = allPayrolls.filter(p => p.paymentStatus === 'pending').length;

  res.json({
    month: targetMonth,
    year: targetYear,
    totalEmployees: allPayrolls.length,
    totalGross: money(totalGross),
    totalDeductions: money(totalDeductions),
    totalNet: money(totalNet),
    paidCount,
    pendingCount,
    records: allPayrolls,
  });
}));

// ==================== RUN PAYROLL (Enhanced) ====================
router.post('/run', auth, asyncHandler(async (req, res) => {
  if (!canManagePayroll(req.user.role)) return res.status(403).json({ error: 'forbidden' });
  const { employeeId, month, year, allowances, deductions, notes } = req.body;
  if (!employeeId) return res.status(400).json({ error: 'employeeId is required' });
  const period = parsePayrollPeriod(month, year);
  if (period.error) return res.status(400).json({ error: period.error });

  const employee = await Employee.findOne({ where: { employeeId } });
  if (!employee) return res.status(404).json({ error: 'employee not found' });

  const daysInMonth = new Date(period.year, period.month, 0).getDate();
  const start = `${period.year}-${String(period.month).padStart(2, '0')}-01`;
  const end = `${period.year}-${String(period.month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;
  const attendance = await Attendance.findAll({
    where: {
      employeeId: employee.id,
      date: { [Op.between]: [start, end] },
    },
  });

  const counts = attendance.reduce((total, record) => {
    const status = String(record.status || '').toLowerCase();
    if (status === 'p') total.presentDays += 1;
    if (status === 'a') total.absentDays += 1;
    if (status === 'o') total.weeklyOffDays += 1;
    return total;
  }, { presentDays: 0, absentDays: 0, weeklyOffDays: 0 });

  // Salary breakdown
  const baseSalary = parseFloat(employee.salary || 0);
  const housingPct = 0.25; // 25% housing
  const transportPct = 0.10; // 10% transport
  const foodPct = 0.05; // 5% food

  const basicSalary = money(baseSalary * 0.60); // 60% basic
  const housingAllowance = money(baseSalary * housingPct);
  const transportAllowance = money(baseSalary * transportPct);
  const foodAllowance = money(baseSalary * foodPct);
  const otherAllowances = money(baseSalary - basicSalary - housingAllowance - transportAllowance - foodAllowance);
  const gross = money(baseSalary);

  // Custom allowances from request
  const customAllowances = allowances || {};

  // Deductions
  const absentDeduction = gross > 0 ? money(gross * (counts.absentDays / daysInMonth)) : 0;

  // Get active loans for deduction
  const activeLoans = await Loan.findAll({
    where: { employeeId: employee.employeeId, status: 'active' },
  });
  const loanDeduction = activeLoans.reduce((sum, l) => sum + parseFloat(l.installmentAmount || 0), 0);

  // Custom deductions from request
  const customDeductions = deductions || {};
  const insuranceDeduction = money(customDeductions.insurance || 0);
  const taxDeduction = money(customDeductions.tax || 0);
  const advanceDeduction = money(customDeductions.advance || 0);
  const otherDeductions = money(customDeductions.other || 0);

  const totalDeductions = money(absentDeduction + loanDeduction + insuranceDeduction + taxDeduction + advanceDeduction + otherDeductions);
  const net = money(Math.max(0, gross - totalDeductions));

  const details = {
    employeeId: employee.employeeId,
    employeeName: employee.name,
    designation: employee.designation,
    daysInMonth,
    presentDays: counts.presentDays,
    absentDays: counts.absentDays,
    weeklyOffDays: counts.weeklyOffDays,
    absentDeduction: money(absentDeduction),
    loanDeduction: money(loanDeduction),
    activeLoans: activeLoans.map(l => ({
      id: l.id,
      amount: l.amount,
      remainingAmount: l.remainingAmount,
      installmentAmount: l.installmentAmount,
      paidInstallments: l.paidInstallments,
      totalInstallments: l.totalInstallments,
    })),
    generatedBy: req.user.employeeId,
    generatedAt: new Date(),
    salaryBreakdown: {
      basicSalary: money(basicSalary),
      housingAllowance: money(housingAllowance),
      transportAllowance: money(transportAllowance),
      foodAllowance: money(foodAllowance),
      otherAllowances: money(otherAllowances),
    },
    deductions: {
      absentDeduction: money(absentDeduction),
      loanDeduction: money(loanDeduction),
      insuranceDeduction: money(insuranceDeduction),
      taxDeduction: money(taxDeduction),
      advanceDeduction: money(advanceDeduction),
      otherDeductions: money(otherDeductions),
    },
  };

  const existing = await Payroll.findOne({
    where: { employeeId: employee.id, month: period.month, year: period.year },
  });

  const payslip = existing
    ? await existing.update({
        basicSalary: money(basicSalary),
        housingAllowance: money(housingAllowance),
        transportAllowance: money(transportAllowance),
        foodAllowance: money(foodAllowance),
        otherAllowances: money(otherAllowances),
        gross: money(gross),
        absentDeduction: money(absentDeduction),
        loanDeduction: money(loanDeduction),
        advanceDeduction: money(advanceDeduction),
        insuranceDeduction: money(insuranceDeduction),
        taxDeduction: money(taxDeduction),
        otherDeductions: money(otherDeductions),
        totalDeductions: money(totalDeductions),
        net: money(net),
        details,
        notes: notes || existing.notes || '',
      })
    : await Payroll.create({
        employeeId: employee.id,
        month: period.month,
        year: period.year,
        basicSalary: money(basicSalary),
        housingAllowance: money(housingAllowance),
        transportAllowance: money(transportAllowance),
        foodAllowance: money(foodAllowance),
        otherAllowances: money(otherAllowances),
        gross: money(gross),
        absentDeduction: money(absentDeduction),
        loanDeduction: money(loanDeduction),
        advanceDeduction: money(advanceDeduction),
        insuranceDeduction: money(insuranceDeduction),
        taxDeduction: money(taxDeduction),
        otherDeductions: money(otherDeductions),
        totalDeductions: money(totalDeductions),
        net: money(net),
        details,
        notes: notes || '',
      });

  res.json(payslip);
}));

// ==================== MARK AS PAID ====================
router.post('/:id/pay', auth, asyncHandler(async (req, res) => {
  if (!canManagePayroll(req.user.role)) return res.status(403).json({ error: 'forbidden' });
  const payslip = await Payroll.findByPk(req.params.id);
  if (!payslip) return res.status(404).json({ error: 'payslip not found' });

  const { paymentMethod, transactionReference, notes } = req.body;
  await payslip.update({
    paymentStatus: 'paid',
    paymentDate: new Date(),
    paymentMethod: paymentMethod || 'bank_transfer',
    transactionReference: transactionReference || '',
    paidBy: req.user.employeeId,
    paidAt: new Date(),
    notes: notes || payslip.notes || '',
  });

  res.json(payslip);
}));

// ==================== BULK PAY ====================
router.post('/bulk-pay', auth, asyncHandler(async (req, res) => {
  if (!canManagePayroll(req.user.role)) return res.status(403).json({ error: 'forbidden' });
  const { ids, paymentMethod, transactionReference } = req.body;
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'ids array is required' });
  }

  const updated = [];
  for (const id of ids) {
    const payslip = await Payroll.findByPk(id);
    if (payslip && payslip.paymentStatus === 'pending') {
      await payslip.update({
        paymentStatus: 'paid',
        paymentDate: new Date(),
        paymentMethod: paymentMethod || 'bank_transfer',
        transactionReference: transactionReference || '',
        paidBy: req.user.employeeId,
        paidAt: new Date(),
      });
      updated.push(payslip);
    }
  }

  res.json({ message: `${updated.length} payslips marked as paid`, count: updated.length });
}));

// ==================== GET EMPLOYEE PAYROLL WITH FULL DETAILS ====================
router.get('/:employeeId', auth, asyncHandler(async (req, res) => {
  const emp = await Employee.findOne({ where: { employeeId: req.params.employeeId } });
  if (!emp) return res.status(404).json({ error: 'employee not found' });
  if (!canManagePayroll(req.user.role) && req.user.id !== emp.id) return res.status(403).json({ error: 'forbidden' });

  const records = await Payroll.findAll({
    where: { employeeId: emp.id },
    order: [['year', 'DESC'], ['month', 'DESC']],
  });

  // Get active loans
  const activeLoans = await Loan.findAll({
    where: { employeeId: emp.employeeId, status: 'active' },
  });

  // Get pending expenses
  const pendingExpenses = await Expense.findAll({
    where: { employeeId: emp.employeeId, status: 'pending' },
  });

  res.json({
    employee: {
      employeeId: emp.employeeId,
      name: emp.name,
      email: emp.email,
      designation: emp.designation,
      role: emp.role,
      salary: emp.salary,
      photoUrl: emp.photoUrl,
    },
    payrolls: records,
    activeLoans,
    pendingExpenses,
    summary: {
      totalPaid: records.filter(r => r.paymentStatus === 'paid').reduce((s, r) => s + parseFloat(r.net || 0), 0),
      totalPending: records.filter(r => r.paymentStatus === 'pending').reduce((s, r) => s + parseFloat(r.net || 0), 0),
      totalRecords: records.length,
    },
  });
}));

// ==================== DOWNLOAD PAYSLIP PDF ====================
router.get('/:id/pdf', auth, asyncHandler(async (req, res) => {
  const payslip = await Payroll.findByPk(req.params.id, {
    include: [{ model: Employee }],
  });
  if (!payslip) return res.status(404).json({ error: 'payslip not found' });

  const emp = payslip.Employee;
  if (!canManagePayroll(req.user.role) && req.user.id !== emp.id) return res.status(403).json({ error: 'forbidden' });

  const details = payslip.details || {};
  const monthName = new Date(payslip.year, payslip.month - 1, 1).toLocaleString('default', { month: 'long' });

  // Generate PDF
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const page = pdfDoc.addPage([595.28, 841.89]); // A4
  const { width, height } = page.getSize();
  let y = height - 50;

  // Colors
  const primaryColor = rgb(0.1, 0.2, 0.4);
  const accentColor = rgb(0.2, 0.5, 0.8);
  const textColor = rgb(0.2, 0.2, 0.2);
  const mutedColor = rgb(0.5, 0.5, 0.5);
  const whiteColor = rgb(1, 1, 1);
  const lightBg = rgb(0.95, 0.97, 1);

  // Helper functions
  function drawText(text, x, y, size = 10, opts = {}) {
    const f = opts.bold ? fontBold : font;
    const color = opts.color || textColor;
    page.drawText(String(text), { x, y, size, font: f, color });
  }

  function drawLine(y, color = lightBg, thickness = 1) {
    page.drawLine({ start: { x: 50, y }, end: { x: width - 50, y }, thickness, color });
  }

  // Header background
  page.drawRectangle({
    x: 0, y: height - 140, width, height: 140,
    color: primaryColor,
  });

  // Company name
  drawText('REYADAH HR', 50, height - 60, 24, { bold: true, color: whiteColor });
  drawText('Payslip Statement', 50, height - 90, 14, { color: rgb(0.8, 0.85, 1) });
  drawText(`Period: ${monthName} ${payslip.year}`, 50, height - 115, 11, { color: rgb(0.8, 0.85, 1) });

  // Payslip ID
  drawText(`Payslip #${payslip.id}`, width - 200, height - 60, 11, { color: whiteColor });
  drawText(`Generated: ${new Date(details.generatedAt || Date.now()).toLocaleDateString()}`, width - 200, height - 80, 9, { color: rgb(0.8, 0.85, 1) });
  drawText(`Status: ${payslip.paymentStatus.toUpperCase()}`, width - 200, height - 100, 10, { bold: true, color: payslip.paymentStatus === 'paid' ? rgb(0.3, 0.8, 0.3) : rgb(1, 0.6, 0.1) });

  y = height - 170;

  // Employee Info Section
  page.drawRectangle({ x: 50, y: y - 60, width: width - 100, height: 70, color: lightBg });
  drawText('EMPLOYEE INFORMATION', 60, y - 15, 11, { bold: true, color: accentColor });
  drawText(`Name: ${emp.name || 'N/A'}`, 60, y - 35, 10, { bold: true });
  drawText(`Employee ID: ${emp.employeeId || 'N/A'}`, 60, y - 50, 10);
  drawText(`Designation: ${emp.designation || 'N/A'}`, 300, y - 35, 10);
  drawText(`Email: ${emp.email || 'N/A'}`, 300, y - 50, 10);

  y = y - 90;

  // Earnings Section
  drawText('EARNINGS', 50, y, 12, { bold: true, color: accentColor });
  drawLine(y - 5);
  y -= 20;

  const earnings = [
    { label: 'Basic Salary', value: payslip.basicSalary },
    { label: 'Housing Allowance', value: payslip.housingAllowance },
    { label: 'Transport Allowance', value: payslip.transportAllowance },
    { label: 'Food Allowance', value: payslip.foodAllowance },
    { label: 'Other Allowances', value: payslip.otherAllowances },
  ];

  for (const item of earnings) {
    drawText(item.label, 60, y, 10);
    drawText(`AED ${parseFloat(item.value || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`, width - 200, y, 10, { bold: true });
    y -= 16;
  }

  drawLine(y - 2);
  y -= 16;
  drawText('Gross Salary', 60, y, 11, { bold: true, color: primaryColor });
  drawText(`AED ${parseFloat(payslip.gross || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`, width - 200, y, 11, { bold: true, color: primaryColor });
  y -= 30;

  // Deductions Section
  drawText('DEDUCTIONS', 50, y, 12, { bold: true, color: rgb(0.8, 0.2, 0.2) });
  drawLine(y - 5);
  y -= 20;

  const deductions = [
    { label: 'Absent Deduction', value: payslip.absentDeduction },
    { label: 'Loan Deduction', value: payslip.loanDeduction },
    { label: 'Advance Deduction', value: payslip.advanceDeduction },
    { label: 'Insurance Deduction', value: payslip.insuranceDeduction },
    { label: 'Tax Deduction', value: payslip.taxDeduction },
    { label: 'Other Deductions', value: payslip.otherDeductions },
  ];

  for (const item of deductions) {
    drawText(item.label, 60, y, 10);
    drawText(`AED ${parseFloat(item.value || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`, width - 200, y, 10, { bold: true });
    y -= 16;
  }

  drawLine(y - 2);
  y -= 16;
  drawText('Total Deductions', 60, y, 11, { bold: true, color: rgb(0.8, 0.2, 0.2) });
  drawText(`AED ${parseFloat(payslip.totalDeductions || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`, width - 200, y, 11, { bold: true, color: rgb(0.8, 0.2, 0.2) });
  y -= 30;

  // Net Salary - Highlighted
  page.drawRectangle({ x: 50, y: y - 35, width: width - 100, height: 45, color: primaryColor });
  drawText('NET SALARY', 60, y - 15, 14, { bold: true, color: whiteColor });
  drawText(`AED ${parseFloat(payslip.net || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`, width - 200, y - 15, 16, { bold: true, color: whiteColor });
  drawText(`Payment: ${payslip.paymentStatus.toUpperCase()}`, width - 200, y - 30, 9, { color: rgb(0.8, 0.85, 1) });
  y -= 60;

  // Attendance Summary
  if (details.daysInMonth) {
    drawText('ATTENDANCE SUMMARY', 50, y, 11, { bold: true, color: accentColor });
    drawLine(y - 5);
    y -= 20;
    drawText(`Days in Month: ${details.daysInMonth}`, 60, y, 9);
    drawText(`Present: ${details.presentDays || 0}`, 200, y, 9);
    drawText(`Absent: ${details.absentDays || 0}`, 320, y, 9);
    drawText(`Weekly Off: ${details.weeklyOffDays || 0}`, 420, y, 9);
    y -= 20;
  }

  // Footer
  y = 50;
  drawLine(y + 15, mutedColor, 0.5);
  drawText('This is a computer-generated payslip. No signature required.', 50, y, 8, { color: mutedColor });
  drawText('Reyadah HR System | Confidential', width - 250, y, 8, { color: mutedColor });

  const pdfBytes = await pdfDoc.save();
  const filename = `payslip_${emp.employeeId}_${monthName}_${payslip.year}.pdf`;

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(Buffer.from(pdfBytes));
}));

// ==================== GET ALL PAYROLLS (Admin overview) ====================
router.get('/', auth, asyncHandler(async (req, res) => {
  if (!canManagePayroll(req.user.role)) return res.status(403).json({ error: 'forbidden' });
  const { month, year, status } = req.query;
  const where = {};
  if (month) where.month = parseInt(month);
  if (year) where.year = parseInt(year);
  if (status) where.paymentStatus = status;

  const records = await Payroll.findAll({
    where,
    include: [{ model: Employee, attributes: ['employeeId', 'name', 'designation', 'role', 'photoUrl', 'salary'] }],
    order: [['year', 'DESC'], ['month', 'DESC'], ['id', 'DESC']],
  });
  res.json(records);
}));

module.exports = router;