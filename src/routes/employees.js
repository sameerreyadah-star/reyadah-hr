const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const XLSX = require('xlsx');
const pdfParse = require('pdf-parse');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const { Op } = require('sequelize');
const auth = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const { Employee, Attendance, Payroll } = require('../models');
const bcrypt = require('bcrypt');

const UPLOAD_ROOT = path.join(__dirname, '..', '..', 'uploads');
if (!fs.existsSync(UPLOAD_ROOT)) fs.mkdirSync(UPLOAD_ROOT, { recursive: true });
const TEAM_VIEW_ROLES = ['admin', 'restaurant-manager', 'company-manager'];

function canViewTeam(role) {
  return TEAM_VIEW_ROLES.includes(role);
}

function canViewEmployee(user, employee) {
  return canViewTeam(user.role) || user.id === employee.id;
}

let sharp;
try {
  sharp = require('sharp');
} catch (e) {
  sharp = null;
}

async function processPassportImage(filePath) {
  if (!sharp) return; // sharp not installed
  try {
    // Resize/crop to 400x400, center, convert to jpeg for consistent delivery
    const temp = filePath + '.tmp.jpg';
    await sharp(filePath)
      .resize(400, 400, { fit: 'cover', position: 'centre' })
      .jpeg({ quality: 80 })
      .toFile(temp);
    await fs.promises.rename(temp, filePath);
  } catch (err) {
    console.error('processPassportImage failed', err);
  }
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const ownerId = req.params?.employeeId || req.user.employeeId;
    const dir = path.join(UPLOAD_ROOT, ownerId);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    const prefix = file.fieldname === 'photo' ? 'photo_' : 'doc_';
    cb(null, `${prefix}${Date.now()}_${safe}`);
  }
});
const upload = multer({ storage });
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp']);

function isSupportedImageFile(file) {
  const mimetype = String(file.mimetype || '').toLowerCase();
  const extension = path.extname(file.originalname || '').toLowerCase();
  return mimetype.startsWith('image/') || IMAGE_EXTENSIONS.has(extension);
}

const bulkUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});
const bulkPhotoUpload = multer({
  storage: multer.memoryStorage(),
  preservePath: true,
  limits: { fileSize: 8 * 1024 * 1024, files: 1000 },
  fileFilter: (req, file, cb) => cb(null, isSupportedImageFile(file)),
});

const BULK_TEMPLATE_HEADERS = ['employeeId', 'name', 'designation', 'email', 'salary', 'role'];
const PDF_TEMPLATE_HEADERS = ['Employee ID', 'Name', 'Designation'];
const PDF_TEMPLATE_ROW_COUNT = 30;
const ROLE_VALUES = ['employee', 'restaurant-manager', 'company-manager', 'admin'];
const HEADER_ALIASES = {
  employeeid: 'employeeId',
  'employee id': 'employeeId',
  'employee code': 'employeeId',
  username: 'employeeId',
  'user name': 'employeeId',
  name: 'name',
  'full name': 'name',
  employee: 'name',
  designation: 'designation',
  position: 'designation',
  title: 'designation',
  'job title': 'designation',
  email: 'email',
  'email address': 'email',
  salary: 'salary',
  role: 'role',
};

function sanitized(employee) {
  const data = employee.toJSON ? employee.toJSON() : employee;
  const { passwordHash, ...rest } = data;
  return rest;
}

function normalizeHeader(header) {
  return String(header || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function cleanCell(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function parseSalary(value) {
  const cleaned = cleanCell(value).replace(/[^0-9.-]/g, '');
  const salary = Number(cleaned);
  return Number.isFinite(salary) ? salary : 0;
}

function parseRole(value) {
  const role = cleanCell(value).toLowerCase();
  return ROLE_VALUES.includes(role) ? role : 'employee';
}

function normalizeRelativePaths(value) {
  if (Array.isArray(value)) return value.map(cleanCell);
  if (!value) return [];
  const text = cleanCell(value);
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed.map(cleanCell);
  } catch (err) {
    // Accept plain repeated form fields as the normal path.
  }
  return [text];
}

function pathParts(value) {
  return cleanCell(value)
    .replace(/\\/g, '/')
    .split('/')
    .map(cleanCell)
    .filter(Boolean);
}

function fileNameFromPath(value) {
  const parts = pathParts(value);
  return parts.length ? parts[parts.length - 1] : 'photo.jpg';
}

function safeUploadName(value, fallback = 'photo.jpg') {
  const cleaned = fileNameFromPath(value || fallback).replace(/[^a-zA-Z0-9.\-_]/g, '_').slice(0, 120);
  return cleaned || fallback;
}

function inferImageExtension(file) {
  const extension = path.extname(file.originalname || '').toLowerCase();
  if (IMAGE_EXTENSIONS.has(extension)) return extension;
  const mimetype = String(file.mimetype || '').toLowerCase();
  if (mimetype.includes('png')) return '.png';
  if (mimetype.includes('webp')) return '.webp';
  if (mimetype.includes('gif')) return '.gif';
  if (mimetype.includes('bmp')) return '.bmp';
  return '.jpg';
}

function photoMatchCandidates(relativePath, fallbackName) {
  const parts = pathParts(relativePath || fallbackName);
  const fileName = parts.length ? parts[parts.length - 1] : cleanCell(fallbackName);
  const folders = parts.slice(0, -1).reverse();
  const stem = cleanCell(fileName).replace(/\.[^.]+$/, '');
  const candidates = [
    ...folders,
    stem,
    ...stem.split(/[^a-zA-Z0-9]+/).map(cleanCell).filter(Boolean),
  ];
  return Array.from(new Set(candidates.filter(Boolean)));
}

function randomChar(chars) {
  return chars[crypto.randomInt(0, chars.length)];
}

function generatePassword(length = 14) {
  const uppercase = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lowercase = 'abcdefghijkmnopqrstuvwxyz';
  const numbers = '23456789';
  const symbols = '!@#$%&*?';
  const all = uppercase + lowercase + numbers + symbols;
  const chars = [
    randomChar(uppercase),
    randomChar(lowercase),
    randomChar(numbers),
    randomChar(symbols),
  ];

  while (chars.length < length) {
    chars.push(randomChar(all));
  }

  for (let index = chars.length - 1; index > 0; index -= 1) {
    const swapIndex = crypto.randomInt(0, index + 1);
    [chars[index], chars[swapIndex]] = [chars[swapIndex], chars[index]];
  }

  return chars.join('');
}

function parseBulkSpreadsheetEmployees(file) {
  const workbook = XLSX.read(file.buffer, { type: 'buffer', cellDates: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    const err = new Error('The uploaded workbook does not contain any sheets.');
    err.status = 400;
    throw err;
  }

  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
    header: 1,
    defval: '',
    blankrows: false,
  });

  if (rows.length < 2) {
    const err = new Error('The uploaded file needs a header row and at least one employee row.');
    err.status = 400;
    throw err;
  }

  const columns = rows[0].map((header) => HEADER_ALIASES[normalizeHeader(header)] || null);
  if (!columns.includes('employeeId') || !columns.includes('name')) {
    const err = new Error('Missing required columns. Please include employeeId and name.');
    err.status = 400;
    throw err;
  }

  return rows.slice(1)
    .map((cells, index) => {
      const employee = { rowNumber: index + 2 };
      columns.forEach((key, columnIndex) => {
        if (key) employee[key] = cleanCell(cells[columnIndex]);
      });
      return employee;
    })
    .filter((row) => BULK_TEMPLATE_HEADERS.some((key) => cleanCell(row[key])));
}

function isPdfUpload(file) {
  const extension = path.extname(file.originalname || '').toLowerCase();
  return extension === '.pdf' || String(file.mimetype || '').toLowerCase().includes('pdf');
}

function pdfTextFieldValue(fieldMap, fieldName) {
  const field = fieldMap.get(fieldName);
  if (!field || typeof field.getText !== 'function') return '';
  return cleanCell(field.getText());
}

async function parseFillablePdfEmployees(buffer) {
  try {
    const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
    const form = pdfDoc.getForm();
    const fields = form.getFields();
    const fieldMap = new Map(fields.map((field) => [field.getName(), field]));
    const rowNumbers = new Set();

    fields.forEach((field) => {
      const match = field.getName().match(/^(employeeId|name|designation)_(\d+)$/i);
      if (match) rowNumbers.add(Number(match[2]));
    });

    return Array.from(rowNumbers)
      .sort((a, b) => a - b)
      .map((rowNumber) => ({
        rowNumber,
        employeeId: pdfTextFieldValue(fieldMap, `employeeId_${rowNumber}`),
        name: pdfTextFieldValue(fieldMap, `name_${rowNumber}`),
        designation: pdfTextFieldValue(fieldMap, `designation_${rowNumber}`),
      }))
      .filter((row) => ['employeeId', 'name', 'designation'].some((key) => cleanCell(row[key])));
  } catch (err) {
    return [];
  }
}

function isPdfColumnHeader(line) {
  const normalized = normalizeHeader(line);
  return normalized.includes('employee id') && normalized.includes('name') && normalized.includes('designation');
}

function isPdfNoiseLine(line) {
  const normalized = normalizeHeader(line);
  if (!normalized || isPdfColumnHeader(line)) return true;
  if (/^page \d+$/.test(normalized)) return true;
  return [
    'bulk employee pdf upload',
    'bulk employee upload',
    'employee import template',
    'fillable employee import template',
    'leave blank rows empty',
    'passwords are generated automatically',
    'upload this completed pdf',
  ].some((phrase) => normalized.includes(phrase));
}

function parseSeparatedPdfLine(line, rowNumber) {
  const cleanedLine = cleanCell(line).replace(/^\d+\s+(?=\S+\s*(\||\t|\s{2,}))/g, '');
  const delimiters = [/\s*\|\s*/g, /\t+/g, /\s{2,}/g, /\s*,\s*/g];

  for (const delimiter of delimiters) {
    const parts = cleanedLine.split(delimiter).map(cleanCell).filter(Boolean);
    if (parts.length >= 3) {
      return {
        rowNumber,
        employeeId: parts[0],
        name: parts[1],
        designation: parts.slice(2).join(' '),
      };
    }
  }

  return null;
}

function parsePdfTextEmployees(text) {
  const lines = String(text || '')
    .replace(/\u0000/g, '')
    .split(/\r?\n/)
    .map(cleanCell)
    .filter(Boolean);

  const headerIndex = lines.findIndex(isPdfColumnHeader);
  const dataLines = (headerIndex >= 0 ? lines.slice(headerIndex + 1) : lines)
    .filter((line) => !isPdfNoiseLine(line));

  const separatedRows = dataLines
    .map((line, index) => parseSeparatedPdfLine(line, index + 1))
    .filter(Boolean);

  if (separatedRows.length) return separatedRows;

  const rows = [];
  for (let index = 0; index + 2 < dataLines.length; index += 3) {
    rows.push({
      rowNumber: Math.floor(index / 3) + 1,
      employeeId: cleanCell(dataLines[index]),
      name: cleanCell(dataLines[index + 1]),
      designation: cleanCell(dataLines[index + 2]),
    });
  }
  return rows.filter((row) => ['employeeId', 'name', 'designation'].some((key) => cleanCell(row[key])));
}

async function parsePdfBulkEmployees(file) {
  const formRows = await parseFillablePdfEmployees(file.buffer);
  if (formRows.length) return formRows;

  const parsed = await pdfParse(file.buffer);
  const textRows = parsePdfTextEmployees(parsed.text);
  if (textRows.length) return textRows;

  const err = new Error('No employee rows found in the PDF. Use the PDF template columns: Employee ID, Name, Designation.');
  err.status = 400;
  throw err;
}

async function parseBulkEmployees(file) {
  if (isPdfUpload(file)) {
    return parsePdfBulkEmployees(file);
  }
  return parseBulkSpreadsheetEmployees(file);
}

function buildBulkTemplate() {
  const workbook = XLSX.utils.book_new();
  const sampleRows = [
    {
      employeeId: 'E1001',
      name: 'Aisha Rahman',
      designation: 'Service Crew',
      email: 'aisha.rahman@example.com',
      salary: 3000,
      role: 'employee',
    },
    {
      employeeId: 'E1002',
      name: 'Omar Khan',
      designation: 'Restaurant Supervisor',
      email: 'omar.khan@example.com',
      salary: 4500,
      role: 'restaurant-manager',
    },
  ];

  const templateSheet = XLSX.utils.json_to_sheet(sampleRows, {
    header: BULK_TEMPLATE_HEADERS,
  });
  templateSheet['!cols'] = [
    { wch: 16 },
    { wch: 26 },
    { wch: 24 },
    { wch: 34 },
    { wch: 14 },
    { wch: 22 },
  ];

  const instructions = [
    ['Bulk Employee Upload'],
    ['Required columns', 'employeeId, name'],
    ['Optional columns', 'designation, email, salary, role'],
    ['Role values', ROLE_VALUES.join(', ')],
    ['Login username', 'The employeeId becomes the username.'],
    ['Passwords', 'Passwords are generated automatically after upload.'],
    ['Tip', 'Delete the sample rows before uploading your real employee list.'],
  ];
  const instructionsSheet = XLSX.utils.aoa_to_sheet(instructions);
  instructionsSheet['!cols'] = [{ wch: 22 }, { wch: 80 }];

  XLSX.utils.book_append_sheet(workbook, instructionsSheet, 'Instructions');
  XLSX.utils.book_append_sheet(workbook, templateSheet, 'Employees');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

async function buildBulkPdfTemplate() {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle('Bulk Employee Upload Template');
  pdfDoc.setSubject('Fill employee rows and upload this PDF to create employees');

  const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const form = pdfDoc.getForm();
  const pageSize = [595.28, 841.89];
  const [pageWidth, pageHeight] = pageSize;
  const margin = 44;
  const tableWidth = pageWidth - margin * 2;
  const columnWidths = [132, 205, tableWidth - 132 - 205];
  const rowHeight = 26;
  const headerHeight = 28;
  const rowsPerPage = 20;
  const borderColor = rgb(0.82, 0.86, 0.91);
  const headerFill = rgb(0.94, 0.97, 1);
  const textColor = rgb(0.12, 0.16, 0.22);

  function drawTemplatePage(page, pageNumber) {
    page.drawText('Bulk Employee PDF Upload', {
      x: margin,
      y: pageHeight - 58,
      size: 20,
      font: boldFont,
      color: textColor,
    });
    page.drawText('Fill the columns below, save the PDF, then upload it in Bulk onboarding. Leave unused rows blank.', {
      x: margin,
      y: pageHeight - 82,
      size: 9.5,
      font: regularFont,
      color: rgb(0.37, 0.43, 0.52),
    });
    page.drawText('Employee ID is used as the username. Passwords are generated automatically after import.', {
      x: margin,
      y: pageHeight - 99,
      size: 9.5,
      font: regularFont,
      color: rgb(0.37, 0.43, 0.52),
    });
    page.drawText(`Page ${pageNumber}`, {
      x: pageWidth - margin - 42,
      y: 28,
      size: 9,
      font: regularFont,
      color: rgb(0.45, 0.5, 0.58),
    });
  }

  let rowNumber = 1;
  let pageNumber = 1;

  while (rowNumber <= PDF_TEMPLATE_ROW_COUNT) {
    const page = pdfDoc.addPage(pageSize);
    drawTemplatePage(page, pageNumber);

    const tableTop = pageHeight - 132;
    let x = margin;
    PDF_TEMPLATE_HEADERS.forEach((header, index) => {
      page.drawRectangle({
        x,
        y: tableTop - headerHeight,
        width: columnWidths[index],
        height: headerHeight,
        color: headerFill,
        borderColor,
        borderWidth: 1,
      });
      page.drawText(header, {
        x: x + 8,
        y: tableTop - 19,
        size: 10.5,
        font: boldFont,
        color: textColor,
      });
      x += columnWidths[index];
    });

    for (let row = 0; row < rowsPerPage && rowNumber <= PDF_TEMPLATE_ROW_COUNT; row += 1, rowNumber += 1) {
      const rowY = tableTop - headerHeight - rowHeight * (row + 1);
      x = margin;

      [
        { key: 'employeeId', width: columnWidths[0] },
        { key: 'name', width: columnWidths[1] },
        { key: 'designation', width: columnWidths[2] },
      ].forEach((column) => {
        page.drawRectangle({
          x,
          y: rowY,
          width: column.width,
          height: rowHeight,
          color: rgb(1, 1, 1),
          borderColor,
          borderWidth: 1,
        });

        const field = form.createTextField(`${column.key}_${rowNumber}`);
        field.addToPage(page, {
          x: x + 5,
          y: rowY + 4,
          width: column.width - 10,
          height: rowHeight - 8,
          borderWidth: 0,
          textColor,
          backgroundColor: rgb(1, 1, 1),
        });
        x += column.width;
      });
    }

    pageNumber += 1;
  }

  form.updateFieldAppearances(regularFont);
  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}

// create employee (admin use)
router.post('/', auth, asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'forbidden' });
  const { employeeId, name, email, password, salary, role, designation, shiftRoster, photoUrl } = req.body;
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(password || 'password', salt);
  try {
    const emp = await Employee.create({ employeeId, name, email, passwordHash, salary, role: role || 'employee', designation, shiftRoster, photoUrl });
    res.json(sanitized(emp));
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') {
      return res.status(400).json({ error: 'employeeId already exists' });
    }
    throw err;
  }
}));

router.get('/bulk-template', auth, asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'forbidden' });
  const buffer = buildBulkTemplate();
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="employee_bulk_upload_template.xlsx"');
  res.send(buffer);
}));

router.get('/bulk-template/pdf', auth, asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'forbidden' });
  const buffer = await buildBulkPdfTemplate();
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="employee_bulk_upload_template.pdf"');
  res.send(buffer);
}));

// Bulk PH template (employeeId, name, paidHolidays)
router.get('/bulk-ph-template', auth, asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'forbidden' });
  const workbook = XLSX.utils.book_new();
  const headers = ['employeeId','name','paidHolidays'];
  const sampleRows = [
    { employeeId: 'E1001', name: 'Aisha Rahman', paidHolidays: 2 },
    { employeeId: 'E1002', name: 'Omar Khan', paidHolidays: 1 },
  ];
  const sheet = XLSX.utils.json_to_sheet(sampleRows, { header: headers });
  XLSX.utils.book_append_sheet(workbook, sheet, 'PH Template');
  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="employee_ph_bulk_template.xlsx"');
  res.send(buffer);
}));

// Bulk annual leave template (employeeId, name, annualLeave)
router.get('/bulk-annual-leave-template', auth, asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'forbidden' });
  const workbook = XLSX.utils.book_new();
  const headers = ['employeeId','name','annualLeave'];
  const sampleRows = [
    { employeeId: 'E1001', name: 'Aisha Rahman', annualLeave: 20 },
    { employeeId: 'E1002', name: 'Omar Khan', annualLeave: 25 },
  ];
  const sheet = XLSX.utils.json_to_sheet(sampleRows, { header: headers });
  XLSX.utils.book_append_sheet(workbook, sheet, 'Annual Leave Template');
  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="employee_annual_leave_bulk_template.xlsx"');
  res.send(buffer);
}));

// Upload bulk annual leave and update employee profiles (sets annual leave entitlement)
router.post('/bulk-annual-leave-upload', auth, bulkUpload.single('file'), asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'forbidden' });
  if (!req.file) return res.status(400).json({ error: 'Excel or CSV file required' });

  console.log('Bulk annual leave upload: file received', req.file.originalname, req.file.size, 'bytes');
  const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  console.log('Bulk annual leave upload: rows parsed', rows.length);
  if (rows.length > 0) {
    console.log('First row keys:', Object.keys(rows[0]));
    console.log('First row values:', JSON.stringify(rows[0]));
  }
  const updated = [];
  const skipped = [];

  for (const row of rows) {
    const employeeId = cleanCell(row.employeeId || row['employeeId'] || row['Employee ID'] || row['EmployeeId'] || row['employee id']);
    const name = cleanCell(row.name || row.Name || row['Name']);
    const alText = cleanCell(row.annualLeave || row['annualLeave'] || row['AnnualLeave'] || row['annual leave'] || row['Annual Leave']);
    const al = Number(alText) || 0;
    console.log(`Processing row: employeeId="${employeeId}", name="${name}", annualLeave="${alText}" -> ${al}`);
    if (!employeeId && !name) {
      skipped.push({ row: row, reason: 'Missing employeeId and name' });
      continue;
    }
    let employee = null;
    if (employeeId) {
      employee = await Employee.findOne({ where: { employeeId } });
      console.log(`Search by employeeId "${employeeId}": ${employee ? 'FOUND' : 'NOT FOUND'}`);
    }
    if (!employee && name) {
      employee = await Employee.findOne({ where: { name } });
      console.log(`Search by name "${name}": ${employee ? 'FOUND' : 'NOT FOUND'}`);
    }
    if (!employee) {
      skipped.push({ row: row, reason: 'Employee not found' });
      continue;
    }
    // Update the annual leave entitlement in the employee's leaveEntitlements
    console.log(`Before: employee ${employee.employeeId} entitlements =`, JSON.stringify(employee.leaveEntitlements));
    // Create a NEW object so Sequelize detects the change (must not mutate existing reference)
    employee.leaveEntitlements = { ...(employee.leaveEntitlements || {}), annual: al };
    await employee.save();
    console.log(`After: updated ${employee.employeeId} annual leave to ${al}`);
    updated.push({ employeeId: employee.employeeId, name: employee.name, annualLeave: al });
  }

  console.log('Bulk annual leave upload result:', { updatedCount: updated.length, skippedCount: skipped.length });
  res.json({ updatedCount: updated.length, updated, skippedCount: skipped.length, skipped });
}));

router.get('/bulk-photo-template', auth, asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'forbidden' });
  const workbook = XLSX.utils.book_new();
  const instructions = [
    ['Bulk Photo Upload'],
    ['Use a single folder of employee photos.'],
    ['Each photo file should include the employee ID in the filename.'],
    ['Example filename', 'E1001.jpg'],
    ['Tip', 'If your photo files are nested in subfolders, the last file name will be used to match by employee ID.'],
    ['Note', 'You may also include a separate mapping workbook with employeeId and photoFileName columns if needed.'],
  ];
  const instructionSheet = XLSX.utils.aoa_to_sheet(instructions);
  const headers = ['employeeId','photoFileName','photoPath'];
  const sampleRows = [
    { employeeId: 'E1001', photoFileName: 'E1001.jpg', photoPath: 'photos/E1001.jpg' },
    { employeeId: 'E1002', photoFileName: 'E1002.png', photoPath: 'photos/E1002.png' },
  ];
  const templateSheet = XLSX.utils.json_to_sheet(sampleRows, { header: headers });
  XLSX.utils.book_append_sheet(workbook, instructionSheet, 'Instructions');
  XLSX.utils.book_append_sheet(workbook, templateSheet, 'Photo Mapping');
  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="employee_photo_upload_template.xlsx"');
  res.send(buffer);
}));

// Upload bulk PH and update employee profiles (increments paidHolidays)
router.post('/bulk-ph-upload', auth, bulkUpload.single('file'), asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'forbidden' });
  if (!req.file) return res.status(400).json({ error: 'Excel or CSV file required' });

  const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  const updated = [];
  const skipped = [];

  for (const row of rows) {
    const employeeId = cleanCell(row.employeeId || row['employeeId'] || row['Employee ID'] || row['EmployeeId'] || row['employee id']);
    const name = cleanCell(row.name || row.Name || row['Name']);
    const phText = cleanCell(row.paidHolidays || row.PH || row['paidHolidays'] || row['PH'] || row['PaidHolidays']);
    const ph = Number(phText) || 0;
    if (!employeeId && !name) {
      skipped.push({ row: row, reason: 'Missing employeeId and name' });
      continue;
    }
    let employee = null;
    if (employeeId) employee = await Employee.findOne({ where: { employeeId } });
    if (!employee && name) employee = await Employee.findOne({ where: { name } });
    if (!employee) {
      skipped.push({ row: row, reason: 'Employee not found' });
      continue;
    }
    const current = Number(employee.paidHolidays || 0);
    const newVal = current + ph;
    await employee.update({ paidHolidays: newVal });
    updated.push({ employeeId: employee.employeeId, name: employee.name, previous: current, added: ph, new: newVal });
  }

  res.json({ updatedCount: updated.length, updated, skippedCount: skipped.length, skipped });
}));

router.post('/bulk-upload', auth, bulkUpload.single('file'), asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'forbidden' });
  if (!req.file) return res.status(400).json({ error: 'PDF, Excel, or CSV file required' });

  const importedRows = await parseBulkEmployees(req.file);
  const seenEmployeeIds = new Set();
  const created = [];
  const credentials = [];
  const skipped = [];

  for (const row of importedRows) {
    const employeeId = cleanCell(row.employeeId);
    const name = cleanCell(row.name);
    const employeeKey = employeeId.toLowerCase();

    if (!employeeId || !name) {
      skipped.push({ rowNumber: row.rowNumber, employeeId, name, reason: 'employeeId and name are required' });
      continue;
    }

    if (seenEmployeeIds.has(employeeKey)) {
      skipped.push({ rowNumber: row.rowNumber, employeeId, name, reason: 'duplicate employeeId in upload file' });
      continue;
    }
    seenEmployeeIds.add(employeeKey);

    const existingEmployee = await Employee.findOne({ where: { employeeId } });
    if (existingEmployee) {
      skipped.push({ rowNumber: row.rowNumber, employeeId, name, reason: 'employeeId already exists' });
      continue;
    }

    const password = generatePassword();
    const passwordHash = await bcrypt.hash(password, 10);
    const employee = await Employee.create({
      employeeId,
      name,
      email: cleanCell(row.email),
      designation: cleanCell(row.designation),
      salary: parseSalary(row.salary),
      role: parseRole(row.role),
      passwordHash,
    });

    const safeEmployee = sanitized(employee);
    created.push(safeEmployee);
    credentials.push({
      employeeId,
      username: employeeId,
      password,
      name: safeEmployee.name,
      email: safeEmployee.email || '',
      designation: safeEmployee.designation || '',
      role: safeEmployee.role || 'employee',
    });
  }

  res.json({
    totalRows: importedRows.length,
    createdCount: created.length,
    skippedCount: skipped.length,
    created,
    skipped,
    credentials,
  });
}));

router.post('/bulk-photo-upload', auth, bulkPhotoUpload.array('photos', 1000), asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'forbidden' });
  const files = Array.isArray(req.files) ? req.files : [];
  if (!files.length) return res.status(400).json({ error: 'Upload at least one image file.' });

  const relativePaths = normalizeRelativePaths(req.body.relativePaths);
  const employees = await Employee.findAll({ attributes: ['id', 'employeeId', 'name', 'photoUrl'] });
  const employeesById = new Map(
    employees.map((employee) => [cleanCell(employee.employeeId).toLowerCase(), employee])
  );
  const matchedEmployeeIds = new Set();
  const updated = [];
  const skipped = [];
  const batchStamp = Date.now();

  for (const [index, file] of files.entries()) {
    const sourcePath = relativePaths[index] || file.originalname || fileNameFromPath(file.originalname);
    const candidates = photoMatchCandidates(sourcePath, file.originalname);
    const employee = candidates
      .map((candidate) => employeesById.get(cleanCell(candidate).toLowerCase()))
      .find(Boolean);

    if (!employee) {
      skipped.push({ filename: fileNameFromPath(sourcePath || file.originalname), reason: 'No employee ID match found' });
      continue;
    }

    const employeeKey = cleanCell(employee.employeeId).toLowerCase();
    if (matchedEmployeeIds.has(employeeKey)) {
      skipped.push({
        filename: fileNameFromPath(sourcePath || file.originalname),
        employeeId: employee.employeeId,
        reason: 'Another image already matched this employee in the same upload',
      });
      continue;
    }
    matchedEmployeeIds.add(employeeKey);

    const employeeDir = path.join(UPLOAD_ROOT, employee.employeeId);
    await fs.promises.mkdir(employeeDir, { recursive: true });

    let safeName = safeUploadName(sourcePath || file.originalname);
    if (!IMAGE_EXTENSIONS.has(path.extname(safeName).toLowerCase())) {
      safeName += inferImageExtension(file);
    }
    const filename = `photo_bulk_${batchStamp}_${String(index + 1).padStart(4, '0')}_${safeName}`;
    const filePath = path.join(employeeDir, filename);

    await fs.promises.writeFile(filePath, file.buffer);
    await processPassportImage(filePath);
    employee.photoUrl = `/uploads/${employee.employeeId}/${filename}`;
    await employee.save();

    updated.push({
      employeeId: employee.employeeId,
      name: employee.name,
      photoUrl: employee.photoUrl,
      filename: fileNameFromPath(sourcePath || file.originalname),
    });
  }

  res.json({
    receivedCount: files.length,
    matchedCount: updated.length,
    skippedCount: skipped.length,
    updated,
    skipped,
  });
}));

router.put('/:employeeId', auth, asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'forbidden' });
  const employee = await Employee.findOne({ where: { employeeId: req.params.employeeId } });
  if (!employee) return res.status(404).json({ error: 'employee not found' });

  const { name, email, salary, role, designation, password } = req.body;
  const updates = {
    name: name !== undefined ? name : employee.name,
    email: email !== undefined ? email : employee.email,
    salary: salary !== undefined ? salary : employee.salary,
    role: role !== undefined ? role : employee.role,
    designation: designation !== undefined ? designation : employee.designation,
  };

  if (password) {
    const salt = await bcrypt.genSalt(10);
    updates.passwordHash = await bcrypt.hash(password, salt);
  }

  await employee.update(updates);
  res.json(sanitized(employee));
}));

router.delete('/:employeeId', auth, asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'forbidden' });
  const employee = await Employee.findOne({ where: { employeeId: req.params.employeeId } });
  if (!employee) return res.status(404).json({ error: 'employee not found' });

  // Prevent admins from accidentally deleting their own account
  if (req.user.employeeId === employee.employeeId) return res.status(400).json({ error: 'cannot delete your own account' });

  await employee.destroy();

  // Remove uploaded files for this employee (uploads/<employeeId>)
  const dir = path.join(UPLOAD_ROOT, employee.employeeId);
  try {
    if (fs.existsSync(dir)) {
      if (fs.promises.rm) {
        await fs.promises.rm(dir, { recursive: true, force: true });
      } else {
        await fs.promises.rmdir(dir, { recursive: true });
      }
    }
  } catch (err) {
    console.error('Failed to remove uploads for', employee.employeeId, err);
    // don't fail the request if cleanup fails
  }

  res.json({ success: true });
}));

// upload profile photo
router.post('/me/photo', auth, upload.single('photo'), asyncHandler(async (req, res) => {
  const profile = req.user;
  if (!req.file) return res.status(400).json({ error: 'photo required' });
  const filePath = path.join(UPLOAD_ROOT, profile.employeeId, req.file.filename);
  // process image if possible
  await processPassportImage(filePath);
  profile.photoUrl = `/uploads/${profile.employeeId}/${req.file.filename}`;
  await profile.save();
  res.json({ photoUrl: profile.photoUrl });
}));

// admin: upload photo for any employee
router.post('/:employeeId/photo', auth, upload.single('photo'), asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'forbidden' });
  const employee = await Employee.findOne({ where: { employeeId: req.params.employeeId } });
  if (!employee) return res.status(404).json({ error: 'employee not found' });
  if (!req.file) return res.status(400).json({ error: 'photo required' });

  const filePath = path.join(UPLOAD_ROOT, employee.employeeId, req.file.filename);
  await processPassportImage(filePath);
  employee.photoUrl = `/uploads/${employee.employeeId}/${req.file.filename}`;
  await employee.save();
  res.json({ photoUrl: employee.photoUrl });
}));

// list employees for admins and managers
router.get('/', auth, asyncHandler(async (req, res) => {
  if (!canViewTeam(req.user.role)) return res.status(403).json({ error: 'forbidden' });
  const attributes = req.user.role === 'admin'
    ? ['id', 'employeeId', 'name', 'email', 'role', 'designation', 'salary', 'shiftRoster', 'documents', 'assets', 'photoUrl', 'createdAt']
    : ['id', 'employeeId', 'name', 'email', 'role', 'designation', 'shiftRoster', 'photoUrl', 'createdAt'];
  const employees = await Employee.findAll({ attributes, order: [['name', 'ASC']] });
  res.json(employees);
}));

// get own profile with attendance/payroll summary
router.get('/me', auth, asyncHandler(async (req, res) => {
  const attendanceDays = await Attendance.count({ where: { employeeId: req.user.id } });
  const payslipCount = await Payroll.count({ where: { employeeId: req.user.id } });
  const latestAttendance = await Attendance.findOne({ where: { employeeId: req.user.id }, order: [['updatedAt', 'DESC']] });
  res.json({
    ...sanitized(req.user),
    attendanceDays,
    payslipCount,
    latestAttendance: latestAttendance ? `Last update: ${latestAttendance.date}` : 'No attendance yet',
    leaveBalance: 10,
    documents: req.user.documents || [],
    assets: req.user.assets || [],
  });
}));

// assign asset to employee
router.post('/:employeeId/assets', auth, asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'forbidden' });
  const employee = await Employee.findOne({ where: { employeeId: req.params.employeeId } });
  if (!employee) return res.status(404).json({ error: 'employee not found' });

  const { name, serialNumber, assetType, model, description, status, assignedAt } = req.body;
  if (!name || !serialNumber || !assetType) return res.status(400).json({ error: 'asset name, serial number, and type are required' });

  const assets = employee.assets || [];
  const newAsset = {
    id: Date.now(),
    name,
    serialNumber,
    assetType,
    model: model || '',
    description: description || '',
    status: status || 'assigned',
    assignedAt: assignedAt ? new Date(assignedAt) : new Date(),
    createdAt: new Date(),
  };

  assets.push(newAsset);
  await employee.update({ assets });
  res.json(newAsset);
}));

// add a document for an employee
router.post('/:employeeId/documents', auth, upload.single('file'), asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'forbidden' });
  const employee = await Employee.findOne({ where: { employeeId: req.params.employeeId } });
  if (!employee) return res.status(404).json({ error: 'employee not found' });
  if (!req.file) return res.status(400).json({ error: 'file required' });

  const { docType, description, issueDate } = req.body;
  const docs = employee.documents || [];
  const entry = {
    id: Date.now(),
    filename: req.file.filename,
    originalname: req.file.originalname,
    size: req.file.size,
    url: `/uploads/${employee.employeeId}/${req.file.filename}`,
    uploadedAt: new Date(),
    docType: docType || 'General',
    description: description || '',
    issueDate: issueDate ? new Date(issueDate) : null,
  };
  docs.push(entry);
  await employee.update({ documents: docs });
  res.json(entry);
}));

router.put('/:employeeId/shift', auth, asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'forbidden' });
  const employee = await Employee.findOne({ where: { employeeId: req.params.employeeId } });
  if (!employee) return res.status(404).json({ error: 'employee not found' });

  const { shiftName, startTime, endTime, notes, shiftRoster } = req.body;
  const updatedShift = shiftRoster || { shiftName, startTime, endTime, notes };
  await employee.update({ shiftRoster: updatedShift });
  res.json({ shiftRoster: updatedShift });
}));

router.get('/:employeeId/attendance', auth, asyncHandler(async (req, res) => {
  const employee = await Employee.findOne({ where: { employeeId: req.params.employeeId } });
  if (!employee) return res.status(404).json({ error: 'employee not found' });
  if (!canViewEmployee(req.user, employee)) return res.status(403).json({ error: 'forbidden' });
  const records = await Attendance.findAll({ where: { employeeId: employee.id }, order: [['date', 'DESC']] });
  res.json(records);
}));

// get celebrations: birthdays and work anniversaries for current month
router.get('/celebrations', auth, asyncHandler(async (req, res) => {
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentDay = now.getDate();

  const attributes = ['id', 'employeeId', 'name', 'email', 'role', 'designation', 'photoUrl', 'dateOfBirth', 'createdAt'];
  const employees = await Employee.findAll({ attributes, order: [['name', 'ASC']] });

  const birthdays = [];
  const anniversaries = [];

  employees.forEach((emp) => {
    const empData = emp.toJSON();
    // Birthday check - month/day match
    if (empData.dateOfBirth) {
      const dob = new Date(empData.dateOfBirth);
      const dobMonth = dob.getMonth() + 1;
      const dobDay = dob.getDate();
      if (dobMonth === currentMonth) {
        birthdays.push({
          ...empData,
          isToday: dobMonth === currentMonth && dobDay === currentDay,
          birthDate: empData.dateOfBirth,
          age: currentMonth === dobMonth && currentDay >= dobDay ? now.getFullYear() - dob.getFullYear() : now.getFullYear() - dob.getFullYear() - 1,
        });
      }
    }
    // Work anniversary check - month match using createdAt
    if (empData.createdAt) {
      const joinDate = new Date(empData.createdAt);
      const joinMonth = joinDate.getMonth() + 1;
      const joinDay = joinDate.getDate();
      if (joinMonth === currentMonth) {
        const years = now.getFullYear() - joinDate.getFullYear();
        anniversaries.push({
          ...empData,
          isToday: joinMonth === currentMonth && joinDay === currentDay,
          joinDate: empData.createdAt,
          years: years >= 0 ? years : 0,
          designation: empData.designation || 'Team Member',
        });
      }
    }
  });

  res.json({ month: currentMonth, birthdays, anniversaries });
}));

// search employees by ID or name (for attendance info lookup)
router.get('/search/query', auth, asyncHandler(async (req, res) => {
  if (!canViewTeam(req.user.role)) return res.status(403).json({ error: 'forbidden' });
  const query = String(req.query.q || '').trim();
  if (!query || query.length < 1) return res.json([]);

  const attributes = ['id', 'employeeId', 'name', 'email', 'role', 'designation', 'shiftRoster', 'photoUrl'];
  const employees = await Employee.findAll({
    attributes,
    where: {
      [Op.or]: [
        { employeeId: { [Op.like]: `%${query}%` } },
        { name: { [Op.like]: `%${query}%` } },
      ],
    },
    order: [['name', 'ASC']],
    limit: 20,
  });
  res.json(employees);
}));

// get full employee profile with docs, assets, attendance and payroll
router.get('/:employeeId', auth, asyncHandler(async (req, res) => {
  const employee = await Employee.findOne({ where: { employeeId: req.params.employeeId } });
  if (!employee) return res.status(404).json({ error: 'employee not found' });
  if (!canViewEmployee(req.user, employee)) return res.status(403).json({ error: 'forbidden' });

  const attendanceRecords = await Attendance.findAll({ where: { employeeId: employee.id }, order: [['date', 'DESC']] });
  const canViewPayroll = req.user.role === 'admin' || req.user.role === 'company-manager' || req.user.id === employee.id;
  const payrollRecords = canViewPayroll
    ? await Payroll.findAll({ where: { employeeId: employee.id }, order: [['createdAt', 'DESC']], limit: 10 })
    : [];

  res.json({
    ...sanitized(employee),
    attendanceRecords,
    payrollRecords,
    documents: req.user.role === 'admin' || req.user.id === employee.id ? employee.documents || [] : [],
    assets: req.user.role === 'admin' || req.user.id === employee.id ? employee.assets || [] : [],
  });
}));

// Upload face photo for attendance verification (separate from profile photo)
router.post('/:employeeId/face-photo', auth, upload.single('photo'), asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'restaurant-manager' && req.user.role !== 'company-manager') {
    return res.status(403).json({ error: 'forbidden' });
  }
  const employee = await Employee.findOne({ where: { employeeId: req.params.employeeId } });
  if (!employee) return res.status(404).json({ error: 'employee not found' });
  if (!req.file) return res.status(400).json({ error: 'photo required' });

  const filePath = path.join(UPLOAD_ROOT, employee.employeeId, req.file.filename);
  await processPassportImage(filePath);
  employee.facePhotoUrl = `/uploads/${employee.employeeId}/${req.file.filename}`;
  await employee.save();
  res.json({ facePhotoUrl: employee.facePhotoUrl });
}));

// Check if employee has a registered face for attendance
router.get('/:employeeId/face-status', auth, asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'restaurant-manager' && req.user.role !== 'company-manager') {
    return res.status(403).json({ error: 'forbidden' });
  }
  const employee = await Employee.findOne({ where: { employeeId: req.params.employeeId } });
  if (!employee) return res.status(404).json({ error: 'employee not found' });
  
  const hasPhoto = Boolean(employee.facePhotoUrl);
  const photoExists = hasPhoto ? fs.existsSync(path.join(__dirname, '..', '..', employee.facePhotoUrl)) : false;
  
  res.json({
    employeeId: employee.employeeId,
    name: employee.name,
    hasRegisteredFace: hasPhoto && photoExists,
    facePhotoUrl: employee.facePhotoUrl,
    registeredAt: employee.updatedAt,
  });
}));

module.exports = router;
