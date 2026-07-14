require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const cron = require('node-cron');
const { sequelize } = require('./models');

const authRoutes = require('./routes/auth');
const employeeRoutes = require('./routes/employees');
const attendanceRoutes = require('./routes/attendance');
const payrollRoutes = require('./routes/payroll');
const documentsRoutes = require('./routes/documents');
const leaveRoutes = require('./routes/leaves');
const companyRoutes = require('./routes/company');
const zktecoRoutes = require('./routes/zkteco');
const aiBotRoutes = require('./routes/aiBot');
const requestsRoutes = require('./routes/requests');
const reportsRoutes = require('./routes/reports');
const holidaysRoutes = require('./routes/holidays');
const auditLogsRoutes = require('./routes/auditLogs');
const eosRoutes = require('./routes/eos');
const employeesManagementRoutes = require('./routes/employeesManagement');

const syncService = require('./services/syncService');
const zktecoService = require('./services/zktecoService');
const { Employee } = require('./models');

// Schedule end-of-month annual leave increment (adds 2 days to every employee)
cron.schedule('59 23 28-31 * *', async () => {
  try {
    // Check if today is the last day of the month
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (tomorrow.getMonth() === now.getMonth()) return; // Not last day
    
    console.log('[Cron] End of month - adding 2 annual leave days to all employees');
    const employees = await Employee.findAll();
    let count = 0;
    for (const employee of employees) {
      const entitlements = employee.leaveEntitlements || {};
      const current = Number(entitlements.annual) || 0;
      employee.leaveEntitlements = { ...entitlements, annual: current + 2 };
      await employee.save();
      count++;
    }
    console.log(`[Cron] Added 2 annual leave days to ${count} employees`);
  } catch (err) {
    console.error('[Cron] Error adding annual leave days:', err.message);
  }
});
// End of month cron for annual leave increment

console.log('[Cron] End-of-month auto annual leave increment scheduler started');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use('/api/auth', authRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/leaves', leaveRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/payroll', payrollRoutes);
app.use('/api/documents', documentsRoutes);
app.use('/api/company', companyRoutes);
app.use('/api/zkteco', zktecoRoutes);
app.use('/api/ai-bot', aiBotRoutes);
app.use('/api/requests', requestsRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/holidays', holidaysRoutes);
app.use('/api/audit-logs', auditLogsRoutes);
app.use('/api/eos', eosRoutes);
app.use('/api/employees-management', employeesManagementRoutes);

// error handling
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  const status = err.status || 500;
  res.status(status).json({ error: err.message || 'Internal server error' });
});

// serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));
app.use('/images', express.static(path.join(__dirname, '..', 'images')));

// serve frontend
app.use(express.static(path.join(__dirname, '..', 'public')));

const PORT = process.env.PORT || 3000;

// Schedule auto-sync for ZKTeco devices
async function scheduleDeviceSyncs() {
  const { ZkTecoDevice } = require('./models');
  
  // Run sync every 5 minutes by default (will match per-device intervals)
  cron.schedule('*/5 * * * *', async () => {
    try {
      const autoSyncDevices = await ZkTecoDevice.findAll({
        where: { isActive: true, autoSync: true },
      });
      
      for (const device of autoSyncDevices) {
        if (device.autoSync && !syncService.isSyncing) {
          console.log(`[ZKTeco Auto-Sync] Starting sync for device: ${device.name} (${device.ipAddress})`);
          syncService.syncDevice(device.id).then((result) => {
            console.log(`[ZKTeco Auto-Sync] Completed for ${device.name}:`, 
              `${result.syncedAttendance} synced, ${result.skippedLogs} skipped`);
          }).catch((err) => {
            console.error(`[ZKTeco Auto-Sync] Error for ${device.name}:`, err.message);
          });
        }
      }
    } catch (err) {
      console.error('[ZKTeco Auto-Sync] Error:', err.message);
    }
  });
  
  console.log('[ZKTeco] Auto-sync scheduler started (every 5 minutes)');
}

async function start() {
  const syncOptions = process.env.DB_SYNC_ALTER === 'true' ? { alter: true } : {};
  await sequelize.sync(syncOptions);
  
  // Start ZKTeco auto-sync scheduler
  await scheduleDeviceSyncs();
  
  const server = app.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
  });
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} is already in use. Open http://localhost:${PORT} if the site is already running, or set PORT to another value and start again.`);
      process.exit(1);
    }
    throw err;
  });
  
  // Clean shutdown
  process.on('SIGINT', async () => {
    console.log('\nShutting down...');
    await zktecoService.clearAllConnections();
    server.close(() => process.exit(0));
  });
  
  process.on('SIGTERM', async () => {
    console.log('\nShutting down...');
    await zktecoService.clearAllConnections();
    server.close(() => process.exit(0));
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
