const fs = require('fs');
const c = fs.readFileSync('src/routes/employees.js', 'utf8');

// Add the bulk role upload route before the final module.exports
const newRoute = `
// POST /api/employees/bulk-role-upload - Bulk assign roles from CSV/Excel
router.post('/bulk-role-upload', auth, bulkUpload.single('file'), asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'forbidden' });
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const XLSX = require('xlsx');
  const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  let updatedCount = 0;
  let skippedCount = 0;
  const skipped = [];
  const updated = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const employeeId = String(row.employeeId || row.employee_id || row['Employee ID'] || row['Employee No'] || '').trim();
    const role = String(row.role || row['Role'] || '').trim().toLowerCase();

    if (!employeeId || !role) {
      skipped.push({ row: i + 2, employeeId, reason: 'Missing employeeId or role' });
      skippedCount++;
      continue;
    }

    const employee = await Employee.findOne({ where: { employeeId } });
    if (!employee) {
      skipped.push({ row: i + 2, employeeId, reason: 'Employee not found' });
      skippedCount++;
      continue;
    }

    const allowedRoles = ['admin', 'restaurant-manager', 'company-manager', 'employee'];
    if (!allowedRoles.includes(role)) {
      skipped.push({ row: i + 2, employeeId, reason: 'Invalid role: ' + role });
      skippedCount++;
      continue;
    }

    employee.role = role;
    await employee.save();
    updated.push({ employeeId, name: employee.name, role });
    updatedCount++;
  }

  res.json({ updatedCount, skippedCount, updated, skipped });
});

`;

if (c.includes('/bulk-role-upload')) {
  console.log('Already exists');
  process.exit(0);
}

const result = c.replace('}));\n\nmodule.exports = router;', '}));' + newRoute + 'module.exports = router;');
fs.writeFileSync('src/routes/employees.js', result);
console.log('Added bulk role route');