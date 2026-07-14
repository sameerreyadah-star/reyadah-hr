/**
 * CLI script to sync all ZKTeco devices at once
 * Usage: node src/scripts/syncAll.js
 */
const { sequelize, ZkTecoDevice } = require('../models');
const syncService = require('../services/syncService');

async function main() {
  console.log('ZKTeco Sync - Starting sync for all active devices...\n');
  
  const devices = await ZkTecoDevice.findAll({ where: { isActive: true } });
  if (devices.length === 0) {
    console.log('No active devices found. Add a device first via the admin dashboard.');
    process.exit(0);
  }
  
  console.log(`Found ${devices.length} active device(s):`);
  devices.forEach(d => console.log(`  - ${d.name} (${d.ipAddress}:${d.port})`));
  console.log('');
  
  const results = await syncService.syncAllDevices();
  
  console.log('\n--- Sync Results ---');
  results.forEach(r => {
    console.log(`\nDevice: ${r.deviceName || r.deviceId}`);
    console.log(`  Status: ${r.status}`);
    if (r.status === 'success') {
      console.log(`  New logs: ${r.newLogs || 0}`);
      console.log(`  Attendance synced: ${r.syncedAttendance || 0}`);
      console.log(`  Skipped: ${r.skippedLogs || 0}`);
    }
    if (r.errors && r.errors.length) {
      console.log(`  Errors: ${r.errors.join(', ')}`);
    }
  });
  
  await sequelize.close();
  process.exit(0);
}

main().catch(err => {
  console.error('Sync failed:', err);
  process.exit(1);
});