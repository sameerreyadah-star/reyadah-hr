const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const { Employee, Attendance, Payroll } = require('../models');
const { Op } = require('sequelize');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const DAY_MS = 1000 * 60 * 60 * 24;

const EOS_COMPANIES = [
  'A K S Reyadah Trading L.L.C',
  'REYADAH HR',
];

// Template storage
const TEMPLATE_DIR = path.join(__dirname, '..', '..', 'uploads', 'eos-template');
if (!fs.existsSync(TEMPLATE_DIR)) fs.mkdirSync(TEMPLATE_DIR, { recursive: true });
const TEMPLATE_PATH = path.join(TEMPLATE_DIR, 'eos-template.pdf');

// Multer for template upload
const templateStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, TEMPLATE_DIR),
  filename: (req, file, cb) => cb(null, 'eos-template.pdf'),
});
const uploadTemplate = multer({ storage: templateStorage, limits: { fileSize: 10 * 1024 * 1024 } });

function canManageEos(role) {
  return role === 'admin' || role === 'company-manager';
}

function money(value) {
  const amount = Number(value);
  return Number.parseFloat((Number.isFinite(amount) ? amount : 0).toFixed(2));
}

function numberOr(value, fallback = 0) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : fallback;
}

function formatAmount(value, minimumFractionDigits = 2) {
  return money(value).toLocaleString('en-US', {
    minimumFractionDigits,
    maximumFractionDigits: 2,
  });
}

function formatAed(value) {
  return `AED ${formatAmount(value)}`;
}

function formatDateLong(date) {
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
}

function formatDateShort(date) {
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatMonthYear(date) {
  return date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

function serviceDurationParts(startDate, endDate) {
  if (!(startDate instanceof Date) || !(endDate instanceof Date) || endDate < startDate) {
    return { years: 0, months: 0, days: 0 };
  }
  let years = endDate.getFullYear() - startDate.getFullYear();
  let months = endDate.getMonth() - startDate.getMonth();
  let days = endDate.getDate() - startDate.getDate();
  if (days < 0) {
    months -= 1;
    days += new Date(endDate.getFullYear(), endDate.getMonth(), 0).getDate();
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  return { years: Math.max(0, years), months: Math.max(0, months), days: Math.max(0, days) };
}

function departmentFromEmployee(emp) {
  const roster = emp.shiftRoster || {};
  return roster.department || roster.outletName || roster.location || roster.shiftName || '';
}

function buildSettlement(emp, payrollRecords, endDateObj) {
  const joinDate = new Date(emp.createdAt);
  const totalServiceDays = Math.max(0, Math.floor((endDateObj - joinDate) / DAY_MS));
  const totalServiceYears = totalServiceDays / 365;
  const eosCalculation = serviceDurationParts(joinDate, endDateObj);

  const paidPayroll = payrollRecords.find((p) => p.paymentStatus === 'paid');
  const latestPayroll = paidPayroll || payrollRecords[0] || null;
  const baseSalary = numberOr(emp.salary, 0);
  const basicSalary = money(latestPayroll ? numberOr(latestPayroll.basicSalary, baseSalary * 0.6) : baseSalary * 0.6);
  const grossSalary = money(latestPayroll ? numberOr(latestPayroll.gross, baseSalary) : baseSalary);
  const dailyWage = basicSalary / 30;
  const grossDailyWage = grossSalary / 30;

  let eosDaysPerYear = 0;
  let eosAmount = 0;
  if (totalServiceYears >= 1 && totalServiceYears < 5) {
    eosDaysPerYear = 21;
    eosAmount = money(dailyWage * 21 * Math.floor(totalServiceYears));
  } else if (totalServiceYears >= 5) {
    eosDaysPerYear = 30;
    eosAmount = money(dailyWage * 30 * Math.floor(totalServiceYears));
  }

  const leaveEntitlements = emp.leaveEntitlements || {};
  const annualLeaveDays = money(leaveEntitlements.annual || 0);
  const phLeaveDays = money(leaveEntitlements.ph || 0);
  const annualLeaveAmount = money(dailyWage * annualLeaveDays);
  const phLeaveAmount = money(grossDailyWage * phLeaveDays);
  const monthlyPay = money(grossDailyWage * endDateObj.getDate());

  return {
    joinDate,
    endDateObj,
    totalServiceDays,
    totalServiceYears: money(totalServiceYears),
    eosCalculation,
    basicSalary,
    grossSalary,
    dailyWage: money(dailyWage),
    grossDailyWage: money(grossDailyWage),
    eosDaysPerYear,
    eosAmount,
    annualLeaveDays,
    phLeaveDays,
    annualLeaveAmount,
    phLeaveAmount,
    monthlyPay,
    latestPayroll,
  };
}

// ==================== UPLOAD EOS PDF TEMPLATE ====================
router.post('/template-upload', auth, uploadTemplate.single('template'), asyncHandler(async (req, res) => {
  if (!canManageEos(req.user.role)) return res.status(403).json({ error: 'forbidden' });
  if (!req.file) return res.status(400).json({ error: 'PDF template file is required' });
  res.json({ success: true, message: 'EOS template uploaded successfully' });
}));

// ==================== CHECK TEMPLATE STATUS ====================
router.get('/template-status', auth, asyncHandler(async (req, res) => {
  if (!canManageEos(req.user.role)) return res.status(403).json({ error: 'forbidden' });
  const exists = fs.existsSync(TEMPLATE_PATH);
  let stats = null;
  if (exists) {
    const stat = fs.statSync(TEMPLATE_PATH);
    stats = { size: stat.size, modifiedAt: stat.mtime };
  }
  res.json({ exists, stats });
}));

// ==================== DELETE TEMPLATE ====================
router.delete('/template', auth, asyncHandler(async (req, res) => {
  if (!canManageEos(req.user.role)) return res.status(403).json({ error: 'forbidden' });
  if (fs.existsSync(TEMPLATE_PATH)) {
    fs.unlinkSync(TEMPLATE_PATH);
  }
  res.json({ success: true, message: 'Template deleted' });
}));

// ==================== SERVE TEMPLATE PDF FOR PREVIEW ====================
// Accepts token as query param for iframe preview (iframes can't set Authorization header)
router.get('/template-preview', async (req, res, next) => {
  // Allow token via query param for iframe preview
  if (req.query.token) {
    req.headers.authorization = 'Bearer ' + req.query.token;
  }
  // Pass to auth middleware
  auth(req, res, next);
}, asyncHandler(async (req, res) => {
  if (!canManageEos(req.user.role)) return res.status(403).json({ error: 'forbidden' });
  if (!fs.existsSync(TEMPLATE_PATH)) return res.status(404).json({ error: 'No template uploaded' });
  res.sendFile(TEMPLATE_PATH);
}));

// ==================== CREATE EOS PDF FROM TEMPLATE OR SCRATCH ====================
async function createEosPdf(settlement) {
  // Try to use uploaded template first
  if (fs.existsSync(TEMPLATE_PATH)) {
    try {
      return await createEosPdfFromTemplate(settlement);
    } catch (err) {
      console.error('Failed to use template, falling back to generated PDF:', err.message);
    }
  }
  return await createEosPdfFromScratch(settlement);
}

// ==================== FILL IN UPLOADED TEMPLATE ====================
async function createEosPdfFromTemplate(settlement) {
  const templateBytes = fs.readFileSync(TEMPLATE_PATH);
  const pdfDoc = await PDFDocument.load(templateBytes);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const pages = pdfDoc.getPages();
  const page = pages[0];
  const { width, height } = page.getSize();

  const black = rgb(0, 0, 0);
  const darkGrey = rgb(0.2, 0.2, 0.2);

  const companyName = settlement.companyName || EOS_COMPANIES[0];
  const employeeName = settlement.employeeName || '';
  const reasonForDeparture = settlement.reasonForDeparture || 'Resignation with notice';
  const department = settlement.department || '';
  const contractType = settlement.contractType || 'Limited term';
  const title = settlement.title || '';
  const dateText = formatDateLong(settlement.generatedAt);
  const departureDateText = formatDateShort(settlement.endDateObj);
  const hireDateText = formatDateShort(settlement.joinDate);
  const serviceText = `${settlement.service.years} Years ${settlement.service.months} Months ${settlement.service.days} Days`;
  const settlementMonth = formatMonthYear(settlement.endDateObj);

  // Helper to draw text on the template at absolute positions
  function drawText(text, x, y, size = 10, opts = {}) {
    if (text === undefined || text === null) text = '';
    const f = opts.bold ? fontBold : font;
    const txt = String(text);
    let drawSize = size;
    if (opts.maxWidth) {
      while (f.widthOfTextAtSize(txt, drawSize) > opts.maxWidth && drawSize > 5) drawSize -= 0.5;
    }
    page.drawText(txt, {
      x,
      y: height - y - drawSize,
      size: drawSize,
      font: f,
      color: opts.color || black,
    });
  }

  function drawRight(text, rightX, y, size = 10, opts = {}) {
    if (text === undefined || text === null) text = '';
    const f = opts.bold ? fontBold : font;
    const txt = String(text);
    let drawSize = size;
    if (opts.maxWidth) {
      while (f.widthOfTextAtSize(txt, drawSize) > opts.maxWidth && drawSize > 5) drawSize -= 0.5;
    }
    const tw = f.widthOfTextAtSize(txt, drawSize);
    page.drawText(txt, {
      x: rightX - tw,
      y: height - y - drawSize,
      size: drawSize,
      font: f,
      color: opts.color || black,
    });
  }

  // ===== FILL IN THE TEMPLATE FIELDS =====
  // These positions are calibrated for the sample PDF you uploaded.
  // You may need to adjust them slightly after testing.

  // 1. Service Information section
  drawText(employeeName, 55, 195, 9);           // Employee Name
  drawText(reasonForDeparture, 310, 195, 9);     // Reason for departure
  drawText(department, 55, 218, 9);              // Department
  drawText(contractType, 310, 218, 9);           // Contract type
  drawText(title, 55, 240, 9);                   // Title
  drawText(formatAed(settlement.basicSalary), 310, 240, 9); // Basic Salary
  drawText(hireDateText, 55, 262, 9);            // Hire date
  drawText(serviceText, 310, 262, 9);            // Total service duration
  drawText(String(settlement.totalServiceDays), 55, 284, 9); // Total Gratuity Days
  drawText(settlement.employeeId, 310, 284, 9);  // Employee ID
  drawText(formatAmount(settlement.unpaidGratuityDays, 0), 55, 306, 9); // Unpaid Gratuity Days
  drawText(departureDateText, 55, 328, 9);       // Departure Date

  // 2. Final Settlement section - Additions
  // Gratuity
  drawRight(formatAmount(settlement.finalEosAmount), 540, 395, 10);
  // Annual Leave
  drawRight(formatAmount(settlement.annualLeaveAmount), 540, 418, 10);
  // PH Compensatory Off
  drawRight(formatAmount(settlement.phLeaveAmount), 540, 440, 10);
  // Monthly Pay
  drawRight(formatAmount(settlement.monthlyPay), 540, 462, 10);

  // Other Allowances (if any)
  if (settlement.otherAllowances > 0) {
    drawRight(formatAmount(settlement.otherAllowances), 540, 484, 10);
  }

  // Total Additions
  drawRight(formatAmount(settlement.totalAdditions), 540, 510, 11, { bold: true, color: rgb(0.1, 0.3, 0.6) });

  // 3. Deductions
  drawRight(formatAmount(settlement.deductions), 540, 555, 10);

  // 4. Final Settlement Amount
  drawRight(formatAed(settlement.totalPayable), 540, 580, 12, { bold: true, color: rgb(0.1, 0.3, 0.6) });

  // 5. Signature section
  drawText(employeeName, 250, 720, 9);           // Employee Name in signature
  drawText(dateText, 250, 755, 9);               // Date

  pdfDoc.setTitle(`EOS ${settlement.employeeId}`);
  pdfDoc.setSubject(`End of service settlement for ${employeeName}`);
  pdfDoc.setAuthor(companyName);

  return pdfDoc;
}

// ==================== CREATE EOS PDF FROM SCRATCH (FALLBACK) ====================
async function createEosPdfFromScratch(settlement) {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const page = pdfDoc.addPage([595.28, 841.89]); // A4
  const { width, height } = page.getSize();

  const black = rgb(0, 0, 0);
  const darkGrey = rgb(0.3, 0.3, 0.3);
  const grey = rgb(0.5, 0.5, 0.5);
  const lightGrey = rgb(0.85, 0.85, 0.85);
  const white = rgb(1, 1, 1);
  const accent = rgb(0.1, 0.3, 0.6);

  function yFromTop(top, size) {
    return height - top - size;
  }

  function drawText(text, x, top, size = 10, opts = {}) {
    const f = opts.bold ? fontBold : font;
    const txt = String(text ?? '');
    let drawSize = size;
    if (opts.maxWidth) {
      while (f.widthOfTextAtSize(txt, drawSize) > opts.maxWidth && drawSize > 5) drawSize -= 0.5;
    }
    page.drawText(txt, {
      x,
      y: yFromTop(top, drawSize),
      size: drawSize,
      font: f,
      color: opts.color || black,
    });
  }

  function drawRight(text, rightX, top, size = 10, opts = {}) {
    const f = opts.bold ? fontBold : font;
    const txt = String(text ?? '');
    let drawSize = size;
    if (opts.maxWidth) {
      while (f.widthOfTextAtSize(txt, drawSize) > opts.maxWidth && drawSize > 5) drawSize -= 0.5;
    }
    const tw = f.widthOfTextAtSize(txt, drawSize);
    page.drawText(txt, {
      x: rightX - tw,
      y: yFromTop(top, drawSize),
      size: drawSize,
      font: f,
      color: opts.color || black,
    });
  }

  function drawCentered(text, cx, top, size = 10, opts = {}) {
    const f = opts.bold ? fontBold : font;
    const txt = String(text ?? '');
    let drawSize = size;
    if (opts.maxWidth) {
      while (f.widthOfTextAtSize(txt, drawSize) > opts.maxWidth && drawSize > 5) drawSize -= 0.5;
    }
    const tw = f.widthOfTextAtSize(txt, drawSize);
    page.drawText(txt, {
      x: cx - tw / 2,
      y: yFromTop(top, drawSize),
      size: drawSize,
      font: f,
      color: opts.color || black,
    });
  }

  function drawLine(x1, y1, x2, y2, color = lightGrey, thickness = 1) {
    page.drawLine({
      start: { x: x1, y: y1 },
      end: { x: x2, y: y2 },
      thickness,
      color,
    });
  }

  function drawRect(x, y, w, h, color = lightGrey) {
    page.drawRectangle({ x, y, width: w, height: h, color });
  }

  function wrapLines(text, maxWidth, size, f = font) {
    const words = String(text || '').split(/\s+/).filter(Boolean);
    const lines = [];
    let current = '';
    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      if (f.widthOfTextAtSize(next, size) <= maxWidth || !current) {
        current = next;
      } else {
        lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
    return lines;
  }

  function drawWrapped(text, x, top, maxWidth, size = 10, lineHeight = 12, opts = {}) {
    const f = opts.bold ? fontBold : font;
    const lines = wrapLines(text, maxWidth, size, f);
    lines.forEach((line, i) => drawText(line, x, top + i * lineHeight, size, opts));
  }

  const companyName = settlement.companyName || EOS_COMPANIES[0];
  const employeeName = settlement.employeeName || '';
  const reasonForDeparture = settlement.reasonForDeparture || 'Resignation with notice';
  const department = settlement.department || '';
  const contractType = settlement.contractType || 'Limited term';
  const title = settlement.title || '';
  const dateText = formatDateLong(settlement.generatedAt);
  const departureDateText = formatDateShort(settlement.endDateObj);
  const hireDateText = formatDateShort(settlement.joinDate);
  const serviceText = `${settlement.service.years} Years ${settlement.service.months} Months ${settlement.service.days} Days`;
  const settlementMonth = formatMonthYear(settlement.endDateObj);

  // ===== HEADER =====
  drawCentered(companyName, width / 2, 50, 18, { bold: true, color: accent });
  drawCentered('End of Service Entitlement', width / 2, 75, 14, { bold: true });
  drawRight(`Date: ${dateText}`, width - 50, 100, 10, { color: darkGrey });

  // Horizontal line
  drawLine(50, 115, width - 50, 115, accent, 1.5);

  // ===== SECTION 1: SERVICE INFORMATION =====
  drawText('1. Service Information', 50, 135, 13, { bold: true, color: accent });

  // Table header
  const col1X = 50;
  const col2X = 310;
  const rowH = 22;
  let yPos = 160;

  // Draw table header background
  drawRect(col1X - 5, height - yPos - rowH, 250, rowH, lightGrey);
  drawRect(col2X - 5, height - yPos - rowH, 290, rowH, lightGrey);

  drawText('Employee Name', col1X, yPos + 3, 9, { bold: true, color: darkGrey });
  drawText(employeeName, col1X, yPos + 16, 9);
  drawText('Reason for Departure', col2X, yPos + 3, 9, { bold: true, color: darkGrey });
  drawText(reasonForDeparture, col2X, yPos + 16, 9);
  yPos += rowH;

  drawLine(col1X - 5, height - yPos, col1X + 245, height - yPos, lightGrey);
  drawText('Department', col1X, yPos + 3, 9, { bold: true, color: darkGrey });
  drawText(department, col1X, yPos + 16, 9);
  drawText('Contract Type', col2X, yPos + 3, 9, { bold: true, color: darkGrey });
  drawText(contractType, col2X, yPos + 16, 9);
  yPos += rowH;

  drawLine(col1X - 5, height - yPos, col1X + 245, height - yPos, lightGrey);
  drawText('Title', col1X, yPos + 3, 9, { bold: true, color: darkGrey });
  drawText(title, col1X, yPos + 16, 9);
  drawText('Basic Salary (Departure Month)', col2X, yPos + 3, 9, { bold: true, color: darkGrey });
  drawText(formatAed(settlement.basicSalary), col2X, yPos + 16, 9);
  yPos += rowH;

  drawLine(col1X - 5, height - yPos, col1X + 245, height - yPos, lightGrey);
  drawText('Hire Date', col1X, yPos + 3, 9, { bold: true, color: darkGrey });
  drawText(hireDateText, col1X, yPos + 16, 9);
  drawText('Total Service Duration', col2X, yPos + 3, 9, { bold: true, color: darkGrey });
  drawText(serviceText, col2X, yPos + 16, 9);
  yPos += rowH;

  drawLine(col1X - 5, height - yPos, col1X + 245, height - yPos, lightGrey);
  drawText('Total Gratuity Days', col1X, yPos + 3, 9, { bold: true, color: darkGrey });
  drawText(String(settlement.totalServiceDays), col1X, yPos + 16, 9);
  drawText('Employee ID', col2X, yPos + 3, 9, { bold: true, color: darkGrey });
  drawText(settlement.employeeId, col2X, yPos + 16, 9);
  yPos += rowH;

  drawLine(col1X - 5, height - yPos, col1X + 245, height - yPos, lightGrey);
  drawText('Unpaid Gratuity Days', col1X, yPos + 3, 9, { bold: true, color: darkGrey });
  drawText(formatAmount(settlement.unpaidGratuityDays, 0), col1X, yPos + 16, 9);
  yPos += rowH;

  drawLine(col1X - 5, height - yPos, col1X + 245, height - yPos, lightGrey);
  drawText('Departure Date', col1X, yPos + 3, 9, { bold: true, color: darkGrey });
  drawText(departureDateText, col1X, yPos + 16, 9);
  yPos += rowH;

  // ===== SECTION 2: FINAL SETTLEMENT =====
  yPos += 15;
  drawLine(50, height - yPos, width - 50, height - yPos, accent, 1.5);
  yPos += 10;
  drawText(`2. Final Settlement Amount as of ${settlementMonth}`, 50, yPos, 13, { bold: true, color: accent });
  yPos += 10;
  drawText('Currency in AED', 50, yPos, 9, { color: grey });
  yPos += 5;

  // Additions header
  yPos += 5;
  drawRect(col1X - 5, height - yPos - rowH, 250, rowH, lightGrey);
  drawRect(col2X - 5, height - yPos - rowH, 100, rowH, lightGrey);
  drawRect(width - 155, height - yPos - rowH, 100, rowH, lightGrey);
  drawText('Additions', col1X, yPos + 3, 10, { bold: true, color: darkGrey });
  drawText('Remarks', col2X, yPos + 3, 10, { bold: true, color: darkGrey });
  drawText('Amount', width - 150, yPos + 3, 10, { bold: true, color: darkGrey });
  yPos += rowH;

  // Gratuity row
  drawLine(col1X - 5, height - yPos, width - 55, height - yPos, lightGrey);
  drawText('Gratuity', col1X, yPos + 3, 9, { bold: true });
  drawWrapped('Calculated as per UAE labour law (MOHRE) excluding unpaid leave days as per regulations.', col2X, yPos + 3, 230, 8, 9, { color: grey });
  drawRight(formatAmount(settlement.finalEosAmount), width - 55, yPos + 3, 10);
  yPos += rowH;

  // Annual Leave row
  drawLine(col1X - 5, height - yPos, width - 55, height - yPos, lightGrey);
  drawText('Leave Encashment', col1X, yPos + 3, 9, { bold: true });
  drawText(`Annual Leave: ${formatAmount(settlement.annualLeaveDays)} Calendar Days × AED ${formatAmount(settlement.dailyWage)}`, col2X, yPos + 3, 8, { color: grey });
  drawRight(formatAmount(settlement.annualLeaveAmount), width - 55, yPos + 3, 10);
  yPos += rowH;

  // PH Compensatory Off row
  drawLine(col1X - 5, height - yPos, width - 55, height - yPos, lightGrey);
  drawText('(PH) Compensatory Off', col1X, yPos + 3, 9, { bold: true });
  drawText(`${formatAmount(settlement.phLeaveDays)} Calendar Days × AED ${formatAmount(settlement.grossDailyWage)}`, col2X, yPos + 3, 8, { color: grey });
  drawRight(formatAmount(settlement.phLeaveAmount), width - 55, yPos + 3, 10);
  yPos += rowH;

  // Monthly Pay row
  drawLine(col1X - 5, height - yPos, width - 55, height - yPos, lightGrey);
  drawText('Monthly Pay', col1X, yPos + 3, 9, { bold: true });
  drawText(`Pro-rated pay as of ${departureDateText}`, col2X, yPos + 3, 8, { color: grey });
  drawRight(formatAmount(settlement.monthlyPay), width - 55, yPos + 3, 10);
  yPos += rowH;

  // Other Allowances (if any)
  if (settlement.otherAllowances > 0) {
    drawLine(col1X - 5, height - yPos, width - 55, height - yPos, lightGrey);
    drawText('Other Allowances', col1X, yPos + 3, 9, { bold: true });
    drawRight(formatAmount(settlement.otherAllowances), width - 55, yPos + 3, 10);
    yPos += rowH;
  }

  // Total Additions
  drawLine(col1X - 5, height - yPos, width - 55, height - yPos, accent, 1.5);
  drawRect(col1X - 5, height - yPos - rowH, 490, rowH, lightGrey);
  drawText('Total of Additions', col1X, yPos + 3, 10, { bold: true });
  drawRight(formatAmount(settlement.totalAdditions), width - 55, yPos + 3, 11, { bold: true, color: accent });
  yPos += rowH + 5;

  // Deductions header
  drawRect(col1X - 5, height - yPos - rowH, 250, rowH, lightGrey);
  drawRect(col2X - 5, height - yPos - rowH, 100, rowH, lightGrey);
  drawRect(width - 155, height - yPos - rowH, 100, rowH, lightGrey);
  drawText('Deductions', col1X, yPos + 3, 10, { bold: true, color: darkGrey });
  drawText('Remarks', col2X, yPos + 3, 10, { bold: true, color: darkGrey });
  drawText('Amount', width - 150, yPos + 3, 10, { bold: true, color: darkGrey });
  yPos += rowH;

  // Deductions row
  drawLine(col1X - 5, height - yPos, width - 55, height - yPos, lightGrey);
  drawText('Total of Deductions', col1X, yPos + 3, 9, { bold: true });
  drawRight(formatAmount(settlement.deductions), width - 55, yPos + 3, 10);
  yPos += rowH;

  // Final Settlement Amount
  drawLine(col1X - 5, height - yPos, width - 55, height - yPos, accent, 2);
  drawRect(col1X - 5, height - yPos - rowH - 3, 490, rowH + 6, rgb(0.9, 0.95, 1));
  drawText('Final Settlement Amount', col1X, yPos + 5, 12, { bold: true, color: accent });
  drawRight(formatAed(settlement.totalPayable), width - 55, yPos + 5, 12, { bold: true, color: accent });
  yPos += rowH + 10;

  // ===== DECLARATION =====
  drawLine(50, height - yPos, width - 50, height - yPos, accent, 1);
  yPos += 10;
  drawWrapped(
    `I the undersigned do hereby certify that I have understood the calculation for all my dues from ${companyName} and have no rights to make any other claims after this, I hereby accept the full and final settlement amount based on the payment plan above.`,
    50,
    yPos,
    width - 100,
    10,
    14,
  );
  yPos += 50;

  // ===== SIGNATURE SECTION =====
  drawLine(50, height - yPos, 200, height - yPos, lightGrey);
  drawText('Prepared By', 50, yPos + 5, 9, { bold: true, color: darkGrey });

  drawLine(250, height - yPos, 400, height - yPos, lightGrey);
  drawText('Employee Name', 250, yPos + 5, 9, { bold: true, color: darkGrey });
  drawText(employeeName, 250, yPos + 18, 9);

  drawLine(420, height - yPos, 545, height - yPos, lightGrey);
  drawText('Approved By', 420, yPos + 5, 9, { bold: true, color: darkGrey });
  yPos += 35;

  drawLine(50, height - yPos, 200, height - yPos, lightGrey);
  drawText('Employee Signature', 50, yPos + 5, 9, { bold: true, color: darkGrey });

  drawLine(250, height - yPos, 400, height - yPos, lightGrey);
  drawText('Date', 250, yPos + 5, 9, { bold: true, color: darkGrey });
  drawText(dateText, 250, yPos + 18, 9);

  // ===== NOTES =====
  if (settlement.notes) {
    yPos += 30;
    drawText('Notes:', 50, yPos, 9, { bold: true, color: darkGrey });
    drawWrapped(settlement.notes, 50, yPos + 12, width - 100, 9, 11, { color: grey });
  }

  pdfDoc.setTitle(`EOS ${settlement.employeeId}`);
  pdfDoc.setSubject(`End of service settlement for ${employeeName}`);
  pdfDoc.setAuthor(companyName);

  return pdfDoc;
}

// ==================== SEARCH EMPLOYEE FOR EOS ====================
router.get('/search', auth, asyncHandler(async (req, res) => {
  if (!canManageEos(req.user.role)) return res.status(403).json({ error: 'forbidden' });
  const { q } = req.query;
  if (!q || q.length < 1) return res.json([]);

  const employees = await Employee.findAll({
    where: {
      [Op.or]: [
        { employeeId: { [Op.like]: `%${q}%` } },
        { name: { [Op.like]: `%${q}%` } },
        { email: { [Op.like]: `%${q}%` } },
      ],
    },
    limit: 20,
  });

  const results = employees.map((emp) => {
    const { passwordHash, ...safe } = emp.toJSON();
    return safe;
  });

  res.json(results);
}));

router.get('/companies', auth, asyncHandler(async (req, res) => {
  if (!canManageEos(req.user.role)) return res.status(403).json({ error: 'forbidden' });
  res.json(EOS_COMPANIES);
}));

// ==================== GET EMPLOYEE FULL DATA FOR EOS ====================
router.get('/employee/:employeeId', auth, asyncHandler(async (req, res) => {
  if (!canManageEos(req.user.role)) return res.status(403).json({ error: 'forbidden' });

  const emp = await Employee.findOne({ where: { employeeId: req.params.employeeId } });
  if (!emp) return res.status(404).json({ error: 'employee not found' });

  const payrollRecords = await Payroll.findAll({
    where: { employeeId: emp.id },
    order: [['year', 'DESC'], ['month', 'DESC']],
  });

  const now = new Date();
  const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 12, 1);
  const attendanceRecords = await Attendance.findAll({
    where: {
      employeeId: emp.id,
      date: { [Op.gte]: twelveMonthsAgo.toISOString().split('T')[0] },
    },
    order: [['date', 'DESC']],
  });

  const settlement = buildSettlement(emp, payrollRecords, now);
  const totalPresent = attendanceRecords.filter((a) => String(a.status || '').toLowerCase() === 'p').length;
  const totalAbsent = attendanceRecords.filter((a) => String(a.status || '').toLowerCase() === 'a').length;

  res.json({
    companies: EOS_COMPANIES,
    employee: {
      employeeId: emp.employeeId,
      name: emp.name,
      email: emp.email,
      designation: emp.designation,
      role: emp.role,
      salary: emp.salary,
      photoUrl: emp.photoUrl,
      joinDate: emp.createdAt,
      department: departmentFromEmployee(emp),
      contractType: 'Limited term',
    },
    eos: {
      totalServiceYears: settlement.totalServiceYears,
      totalServiceDays: settlement.totalServiceDays,
      joinDate: emp.createdAt,
      lastWorkingDay: now.toISOString(),
      basicSalary: settlement.basicSalary,
      grossSalary: settlement.grossSalary,
      dailyWage: settlement.dailyWage,
      grossDailyWage: settlement.grossDailyWage,
      eosDaysPerYear: settlement.eosDaysPerYear,
      eosAmount: settlement.eosAmount,
      monthlyPay: settlement.monthlyPay,
      eosCalculation: settlement.eosCalculation,
    },
    leave: {
      annualBalance: settlement.annualLeaveDays,
      phBalance: settlement.phLeaveDays,
      unusedLeaveDays: settlement.annualLeaveDays,
      unusedLeaveSalary: settlement.annualLeaveAmount,
      phLeaveSalary: settlement.phLeaveAmount,
    },
    attendance: {
      totalRecords: attendanceRecords.length,
      present: totalPresent,
      absent: totalAbsent,
      workingDays: attendanceRecords.length,
    },
    payroll: {
      totalRecords: payrollRecords.length,
      lastPayroll: settlement.latestPayroll || null,
      totalPaid: payrollRecords
        .filter((p) => p.paymentStatus === 'paid')
        .reduce((sum, p) => sum + parseFloat(p.net || 0), 0),
    },
  });
}));

// ==================== GENERATE EOS PDF (USES TEMPLATE IF AVAILABLE) ====================
router.post('/generate-pdf', auth, asyncHandler(async (req, res) => {
  if (!canManageEos(req.user.role)) return res.status(403).json({ error: 'forbidden' });

  const {
    employeeId,
    companyName,
    reasonForDeparture,
    department,
    contractType,
    eosAmount,
    annualLeaveDays,
    annualLeaveAmount,
    phLeaveDays,
    phLeaveAmount,
    monthlyPay,
    otherAllowances,
    deductions,
    notes,
    endDate,
  } = req.body;

  if (!employeeId) return res.status(400).json({ error: 'employeeId is required' });

  const emp = await Employee.findOne({ where: { employeeId } });
  if (!emp) return res.status(404).json({ error: 'employee not found' });

  const payrollRecords = await Payroll.findAll({
    where: { employeeId: emp.id },
    order: [['year', 'DESC'], ['month', 'DESC']],
  });

  const endDateObj = endDate ? new Date(endDate) : new Date();
  const baseSettlement = buildSettlement(emp, payrollRecords, endDateObj);
  const finalEosAmount = money(numberOr(eosAmount, baseSettlement.eosAmount));
  const finalAnnualLeaveDays = money(numberOr(annualLeaveDays, baseSettlement.annualLeaveDays));
  const finalPhLeaveDays = money(numberOr(phLeaveDays, baseSettlement.phLeaveDays));
  const finalAnnualLeaveAmount = money(numberOr(annualLeaveAmount, baseSettlement.annualLeaveAmount));
  const finalPhLeaveAmount = money(numberOr(phLeaveAmount, baseSettlement.phLeaveAmount));
  const finalMonthlyPay = money(numberOr(monthlyPay, baseSettlement.monthlyPay));
  const finalOtherAllowances = money(otherAllowances || 0);
  const finalDeductions = money(deductions || 0);
  const totalAdditions = money(
    finalEosAmount + finalAnnualLeaveAmount + finalPhLeaveAmount + finalMonthlyPay + finalOtherAllowances,
  );
  const totalPayable = money(totalAdditions - finalDeductions);

  const pdfDoc = await createEosPdf({
    ...baseSettlement,
    generatedAt: new Date(),
    companyName: companyName || EOS_COMPANIES[0],
    employeeName: emp.name || '',
    employeeId: emp.employeeId || '',
    reasonForDeparture: reasonForDeparture || 'Resignation with notice',
    department: department !== undefined ? department : departmentFromEmployee(emp),
    contractType: contractType || 'Limited term',
    title: emp.designation || '',
    service: baseSettlement.eosCalculation,
    finalEosAmount,
    annualLeaveDays: finalAnnualLeaveDays,
    phLeaveDays: finalPhLeaveDays,
    annualLeaveAmount: finalAnnualLeaveAmount,
    phLeaveAmount: finalPhLeaveAmount,
    monthlyPay: finalMonthlyPay,
    otherAllowances: finalOtherAllowances,
    deductions: finalDeductions,
    totalAdditions,
    totalPayable,
    unpaidGratuityDays: 0,
    notes,
  });

  const pdfBytes = await pdfDoc.save();
  const filename = `EOS_${emp.employeeId}_${endDateObj.toISOString().split('T')[0]}.pdf`;

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(Buffer.from(pdfBytes));
}));

module.exports = router;