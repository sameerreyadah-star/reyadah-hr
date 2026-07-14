const bcrypt = require('bcrypt');
const { sequelize, Employee } = require('./models');

async function seed() {
  await sequelize.sync({ force: true });
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash('password', salt);
  await Employee.create({ employeeId: 'E001', name: 'Samir Mulla', email: 'samir@example.com', passwordHash, role: 'admin', salary: 5000 });
  await Employee.create({ employeeId: 'E002', name: 'Bob Employee', email: 'bob@example.com', passwordHash, role: 'employee', salary: 3000 });
  console.log('Seed complete. Users: E001 (admin - Samir), E002 (employee) — password: password');
  process.exit(0);
}

seed().catch(err => { console.error(err); process.exit(1); });
