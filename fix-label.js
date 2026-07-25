const fs = require('fs');
const c = fs.readFileSync('public/app.js', 'utf8');
const old = "auditLog: 'Audit Log'";
const newL = "auditLog: 'Audit Log',\n    workTimings: 'Attendance Correction'";
if (c.includes(old + ',')) {
  const r = c.replace(old + ',', newL);
  fs.writeFileSync('public/app.js', r);
  console.log('Added label');
} else {
  console.log('Not found');
}