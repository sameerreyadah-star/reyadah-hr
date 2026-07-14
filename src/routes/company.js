/**
 * Company Route
 * 
 * Provides company-wide aggregated data:
 * - All employees overview
 * - All company assets (with add/edit/delete)
 * - All company documents (with employee context)
 * - Employee documents management
 */

const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const { Employee } = require('../models');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

// Configure multer for invoice uploads
const invoiceStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '..', '..', 'uploads', 'invoices');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    cb(null, `invoice_${Date.now()}_${safe}`);
  },
});
const uploadInvoice = multer({ storage: invoiceStorage, limits: { fileSize: 5 * 1024 * 1024 } });

const logoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '..', '..', 'images');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, 'Reyadah_Logo.png');
  },
});
const uploadLogo = multer({
  storage: logoStorage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (['image/jpeg', 'image/png', 'image/webp', 'image/jpg'].includes(file.mimetype)) return cb(null, true);
    return cb(new Error('Only image files are allowed'));
  },
});

router.post('/logo', auth, uploadLogo.single('logo'), asyncHandler(async (req, res) => {
  if (!['admin', 'company-manager', 'restaurant-manager'].includes(req.user.role)) {
    return res.status(403).json({ error: 'forbidden' });
  }
  if (!req.file) return res.status(400).json({ error: 'logo file is required' });
  res.json({ logoUrl: '/images/Reyadah_Logo.png', uploadedAt: new Date() });
}));

/**
 * GET /api/company/assets
 * Returns all assets across all employees with enhanced summaries
 */
router.get('/assets', auth, asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'forbidden' });

  const employees = await Employee.findAll({
    attributes: ['id', 'employeeId', 'name', 'email', 'designation', 'role', 'assets'],
  });

  const allAssets = [];
  employees.forEach(emp => {
    const empAssets = emp.assets || [];
    empAssets.forEach(asset => {
      allAssets.push({
        ...asset,
        employeeId: emp.employeeId,
        employeeName: emp.name,
        employeeDesignation: emp.designation,
        employeeEmail: emp.email,
      });
    });
  });

  // Sort by assigned date descending
  allAssets.sort((a, b) => new Date(b.createdAt || b.assignedAt || 0) - new Date(a.createdAt || a.assignedAt || 0));

  // Enhanced summaries
  const byType = {};
  const byStatus = {};
  let assigned = 0, available = 0, maintenance = 0;

  allAssets.forEach(asset => {
    const type = asset.assetType || 'Uncategorized';
    const status = (asset.status || 'assigned').toLowerCase();
    byType[type] = (byType[type] || 0) + 1;
    byStatus[status] = (byStatus[status] || 0) + 1;
    if (status === 'available') available++;
    else if (status === 'maintenance' || status === 'repair') maintenance++;
    else assigned++;
  });

  res.json({
    total: allAssets.length,
    assigned,
    available,
    maintenance,
    assets: allAssets,
    summary: { byType, byStatus },
    assetTypeList: Object.keys(byType),
  });
}));

/**
 * POST /api/company/assets
 * Create a new company asset and optionally assign to an employee
 */
router.post('/assets', auth, uploadInvoice.single('invoice'), asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'forbidden' });

  const { name, serialNumber, assetType, model, description, status, price, purchaseDate, assignToEmployeeId } = req.body;

  if (!name || !assetType) {
    return res.status(400).json({ error: 'Asset name and type are required' });
  }

  // Build the asset object
  const newAsset = {
    id: Date.now() + Math.floor(Math.random() * 1000),
    name,
    serialNumber: serialNumber || '',
    assetType,
    model: model || '',
    description: description || '',
    price: parseFloat(price) || 0,
    invoice: req.file ? `/uploads/invoices/${req.file.filename}` : '',
    invoiceName: req.file ? req.file.originalname : '',
    status: (status || 'available').toLowerCase(),
    purchaseDate: purchaseDate || null,
    assignedAt: null,
    createdAt: new Date(),
  };

  // If assigning to an employee
  if (assignToEmployeeId) {
    const employee = await Employee.findOne({ where: { employeeId: assignToEmployeeId } });
    if (employee) {
      newAsset.status = 'assigned';
      newAsset.assignedAt = new Date();
      const empAssets = employee.assets || [];
      empAssets.push(newAsset);
      await employee.update({ assets: empAssets });
      return res.status(201).json({ ...newAsset, employeeId: employee.employeeId, employeeName: employee.name });
    }
  }

  // Store as unassigned in a special "company" bucket
  // We'll use admin's first admin employee as the holder for unassigned assets
  const adminEmp = await Employee.findOne({ where: { role: 'admin' }, order: [['createdAt', 'ASC']] });
  if (adminEmp) {
    const companyAssets = adminEmp.assets || [];
    companyAssets.push({ ...newAsset, employeeId: '__unassigned__' });
    await adminEmp.update({ assets: companyAssets });
  }

  res.status(201).json(newAsset);
}));

/**
 * PUT /api/company/assets/:assetId
 * Update an asset (including reassign, status change)
 */
router.put('/assets/:assetId', auth, uploadInvoice.single('invoice'), asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'forbidden' });

  const assetId = parseInt(req.params.assetId, 10) || req.params.assetId;
  const { name, serialNumber, assetType, model, description, status, price, purchaseDate, assignToEmployeeId } = req.body;

  // Find the asset across all employees
  const employees = await Employee.findAll({ attributes: ['id', 'employeeId', 'name', 'assets'] });
  let foundAsset = null;
  let sourceEmployee = null;

  for (const emp of employees) {
    const empAssets = emp.assets || [];
    const idx = empAssets.findIndex(a => a.id === assetId || String(a.id) === String(assetId));
    if (idx >= 0) {
      foundAsset = empAssets[idx];
      sourceEmployee = emp;
      break;
    }
  }

  if (!foundAsset) {
    return res.status(404).json({ error: 'Asset not found' });
  }

  // Remove from current employee
  const updatedAssets = (sourceEmployee.assets || []).filter(a => a.id !== assetId && String(a.id) !== String(assetId));

  // Update fields
  const updated = {
    ...foundAsset,
    name: name || foundAsset.name,
    serialNumber: serialNumber !== undefined ? serialNumber : foundAsset.serialNumber,
    assetType: assetType || foundAsset.assetType,
    model: model !== undefined ? model : foundAsset.model,
    description: description !== undefined ? description : foundAsset.description,
    price: price !== undefined ? parseFloat(price) : foundAsset.price,
    purchaseDate: purchaseDate !== undefined ? purchaseDate : foundAsset.purchaseDate,
    status: (status || foundAsset.status).toLowerCase(),
    invoice: req.file ? `/uploads/invoices/${req.file.filename}` : foundAsset.invoice,
    invoiceName: req.file ? req.file.originalname : foundAsset.invoiceName,
  };

  // If reassigning
  if (assignToEmployeeId && assignToEmployeeId !== sourceEmployee.employeeId) {
    const targetEmp = await Employee.findOne({ where: { employeeId: assignToEmployeeId } });
    if (targetEmp) {
      updated.status = 'assigned';
      updated.assignedAt = new Date();
      updated.employeeId = targetEmp.employeeId;
      updated.employeeName = targetEmp.name;
      const targetAssets = targetEmp.assets || [];
      targetAssets.push(updated);
      await targetEmp.update({ assets: targetAssets });
      await sourceEmployee.update({ assets: updatedAssets });
      return res.json(updated);
    }
  }

  // Keep with same employee
  updatedAssets.push(updated);
  await sourceEmployee.update({ assets: updatedAssets });
  res.json(updated);
}));

/**
 * DELETE /api/company/assets/:assetId
 * Delete an asset
 */
router.delete('/assets/:assetId', auth, asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'forbidden' });

  const assetId = parseInt(req.params.assetId, 10) || req.params.assetId;
  const employees = await Employee.findAll({ attributes: ['id', 'employeeId', 'assets'] });

  for (const emp of employees) {
    const empAssets = emp.assets || [];
    const filtered = empAssets.filter(a => a.id !== assetId && String(a.id) !== String(assetId));
    if (filtered.length !== empAssets.length) {
      await emp.update({ assets: filtered });
      return res.json({ success: true, message: 'Asset deleted successfully' });
    }
  }

  return res.status(404).json({ error: 'Asset not found' });
}));

/**
 * GET /api/company/documents
 * Returns all documents across all employees
 */
router.get('/documents', auth, asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'forbidden' });

  const employees = await Employee.findAll({
    attributes: ['id', 'employeeId', 'name', 'email', 'designation', 'role', 'documents'],
  });

  const allDocs = [];
  employees.forEach(emp => {
    const empDocs = emp.documents || [];
    empDocs.forEach(doc => {
      allDocs.push({
        ...doc,
        employeeId: emp.employeeId,
        employeeName: emp.name,
        employeeDesignation: emp.designation,
        employeeEmail: emp.email,
      });
    });
  });

  allDocs.sort((a, b) => new Date(b.uploadedAt || 0) - new Date(a.uploadedAt || 0));

  res.json({
    total: allDocs.length,
    documents: allDocs,
    summary: {
      byType: aggregateBy(allDocs, 'docType'),
    },
  });
}));

/**
 * GET /api/company/employee-documents/:employeeId
 * Returns documents for a specific employee
 */
router.get('/employee-documents/:employeeId', auth, asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'forbidden' });

  const employee = await Employee.findOne({
    where: { employeeId: req.params.employeeId },
    attributes: ['id', 'employeeId', 'name', 'email', 'designation', 'role', 'documents'],
  });

  if (!employee) return res.status(404).json({ error: 'Employee not found' });

  res.json({
    employee: {
      employeeId: employee.employeeId,
      name: employee.name,
      email: employee.email,
      designation: employee.designation,
      role: employee.role,
    },
    total: (employee.documents || []).length,
    documents: employee.documents || [],
  });
}));

// ==================== BULK ASSET UPLOAD ====================
// Configure multer for Excel/CSV upload in memory
const bulkUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

/**
 * GET /api/company/assets/template
 * Download a template Excel file for bulk asset upload
 */
router.get('/assets/template', auth, asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'forbidden' });

  const XLSX = require('xlsx');
  const workbook = XLSX.utils.book_new();
  const headers = ['employeeId', 'name', 'serialNumber', 'assetType', 'model', 'description', 'price'];
  const sampleRows = [
    headers,
    ['E001', 'John Doe', 'SN-LAP-001', 'Laptop', 'Dell Latitude 5420', 'Office laptop', '4500'],
    ['E002', 'Jane Smith', 'SN-PH-001', 'Phone', 'iPhone 14', 'Company phone', '3500'],
  ];
  const sheet = XLSX.utils.aoa_to_sheet(sampleRows);
  sheet['!cols'] = headers.map(() => ({ wch: 20 }));
  XLSX.utils.book_append_sheet(workbook, sheet, 'Assets');

  const instructions = [
    ['Bulk Asset Upload Instructions'],
    [''],
    ['employeeId', 'Required. Must match an existing employee ID in the system.'],
    ['name', 'Asset name (e.g. Dell Laptop).'],
    ['serialNumber', 'Serial number or asset tag.'],
    ['assetType', 'Type of asset (Laptop, Phone, Monitor, Keyboard, etc.).'],
    ['model', 'Model of the asset (optional).'],
    ['description', 'Additional details (optional).'],
    ['price', 'Price in AED (optional, numbers only).'],
    [''],
    ['Tip: Delete the sample rows before uploading your real asset list.'],
  ];
  const instrSheet = XLSX.utils.aoa_to_sheet(instructions);
  instrSheet['!cols'] = [{ wch: 22 }, { wch: 80 }];
  XLSX.utils.book_append_sheet(workbook, instrSheet, 'Instructions');

  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="asset_bulk_upload_template.xlsx"');
  res.send(buffer);
}));

/**
 * POST /api/company/assets/bulk-upload
 * Upload an Excel/CSV file with asset data and assign assets to employees
 * Expected columns: employeeId, name, serialNumber, assetType, model, description, price
 */
router.post('/assets/bulk-upload', auth, bulkUpload.single('file'), asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'forbidden' });
  if (!req.file) return res.status(400).json({ error: 'File is required' });

  const XLSX = require('xlsx');
  const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });

  if (!rows || rows.length < 1) {
    return res.status(400).json({ error: 'No asset rows found in the file' });
  }

  const assigned = [];
  const skipped = [];
  const errors = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const employeeId = String(row.employeeId || '').trim();
    const name = String(row.name || '').trim();
    const serialNumber = String(row.serialNumber || '').trim();
    const assetType = String(row.assetType || '').trim();
    const model = String(row.model || '').trim();
    const description = String(row.description || '').trim();
    const price = parseFloat(row.price) || 0;

    if (!employeeId || !name) {
      skipped.push({ row: i + 2, employeeId, name, reason: 'Missing employeeId or name' });
      continue;
    }

    if (!assetType) {
      skipped.push({ row: i + 2, employeeId, name, reason: 'Missing assetType' });
      continue;
    }

    try {
      const employee = await Employee.findOne({ where: { employeeId } });
      if (!employee) {
        skipped.push({ row: i + 2, employeeId, name, reason: 'Employee not found' });
        continue;
      }

      const newAsset = {
        id: Date.now() + Math.floor(Math.random() * 1000) + i,
        name,
        serialNumber,
        assetType,
        model,
        description,
        price,
        status: 'assigned',
        assignedAt: new Date(),
        createdAt: new Date(),
      };

      const empAssets = employee.assets || [];
      empAssets.push(newAsset);
      await employee.update({ assets: empAssets });
      assigned.push({ employeeId: employee.employeeId, name: employee.name, asset: name, serialNumber });
    } catch (err) {
      errors.push({ row: i + 2, employeeId, error: err.message });
    }
  }

  res.json({
    totalRows: rows.length,
    assignedCount: assigned.length,
    skippedCount: skipped.length,
    errorCount: errors.length,
    assigned,
    skipped,
    errors,
  });
}));

function aggregateBy(arr, field) {
  const counts = {};
  arr.forEach(item => {
    const val = item[field] || 'Uncategorized';
    counts[val] = (counts[val] || 0) + 1;
  });
  return counts;
}

module.exports = router;
