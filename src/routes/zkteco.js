const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const { ZkTecoDevice, ZkTecoLog } = require('../models');
const zktecoService = require('../services/zktecoService');
const syncService = require('../services/syncService');
const geofenceService = require('../services/geofenceService');

// --- Device Management ---

// List all devices
router.get('/', auth, asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'forbidden' });

  const devices = await ZkTecoDevice.findAll({ order: [['name', 'ASC']] });
  res.json(devices);
}));

// Get sync logs before dynamic /:id routes
router.get('/logs', auth, asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'forbidden' });

  const { deviceId, employeeId, status, fromDate, toDate, limit } = req.query;
  const filters = {};
  if (deviceId) filters.deviceId = parseInt(deviceId, 10);
  if (employeeId) filters.employeeId = employeeId;
  if (status) filters.status = status;
  if (fromDate) filters.fromDate = fromDate;
  if (toDate) filters.toDate = toDate;

  const logs = await syncService.getSyncLogs(filters);
  const limitedLogs = limit ? logs.slice(0, parseInt(limit, 10)) : logs;
  res.json(limitedLogs);
}));

// Get single device
router.get('/:id', auth, asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'forbidden' });

  const device = await ZkTecoDevice.findByPk(req.params.id);
  if (!device) return res.status(404).json({ error: 'Device not found' });

  // Add geofence display info
  const geofenceDisplay = geofenceService.getGeofenceDisplay(device);
  // Add last sync info
  const lastSync = syncService.getLastSyncResult(device.id);

  res.json({
    ...device.toJSON(),
    geofenceDisplay,
    lastSyncResult: lastSync,
  });
}));

// Create a new device
router.post('/', auth, asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'forbidden' });

  const { name, ipAddress, port, serialNumber, location, outletName,
          geofenceEnabled, geofenceLatitude, geofenceLongitude, geofenceRadius,
          syncInterval, autoSync, connectionPassword, userMapping } = req.body;

  if (!name || !ipAddress) {
    return res.status(400).json({ error: 'Device name and IP address are required' });
  }

  const device = await ZkTecoDevice.create({
    name,
    ipAddress,
    port: port || 4370,
    serialNumber: serialNumber || null,
    location: location || null,
    outletName: outletName || null,
    geofenceEnabled: geofenceEnabled || false,
    geofenceLatitude: geofenceLatitude || null,
    geofenceLongitude: geofenceLongitude || null,
    geofenceRadius: geofenceRadius || 100,
    syncInterval: syncInterval || 5,
    autoSync: autoSync !== undefined ? autoSync : true,
    connectionPassword: connectionPassword || '0',
    userMapping: userMapping || {},
  });

  res.status(201).json(device);
}));

// Update a device
router.put('/:id', auth, asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'forbidden' });

  const device = await ZkTecoDevice.findByPk(req.params.id);
  if (!device) return res.status(404).json({ error: 'Device not found' });

  const allowedFields = [
    'name', 'ipAddress', 'port', 'serialNumber', 'location', 'outletName',
    'geofenceEnabled', 'geofenceLatitude', 'geofenceLongitude', 'geofenceRadius',
    'syncInterval', 'autoSync', 'isActive', 'connectionPassword', 'userMapping',
  ];

  const updates = {};
  for (const field of allowedFields) {
    if (req.body[field] !== undefined) {
      updates[field] = req.body[field];
    }
  }

  await device.update(updates);
  res.json(device);
}));

// Delete a device
router.delete('/:id', auth, asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'forbidden' });

  const device = await ZkTecoDevice.findByPk(req.params.id);
  if (!device) return res.status(404).json({ error: 'Device not found' });

  // Disconnect if connected
  await zktecoService.disconnectDevice(device.id);

  // Delete associated logs
  await ZkTecoLog.destroy({ where: { deviceId: device.id } });

  // Delete device
  await device.destroy();
  res.json({ success: true });
}));

// --- Connection Management ---

// Test connection to a device (without saving)
router.post('/test-connection', auth, asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'forbidden' });

  const { ipAddress, port } = req.body;
  if (!ipAddress) return res.status(400).json({ error: 'IP address is required' });

  const result = await zktecoService.testConnection(ipAddress, port || 4370);
  res.json(result);
}));

// Connect to a device
router.post('/:id/connect', auth, asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'forbidden' });

  const device = await ZkTecoDevice.findByPk(req.params.id);
  if (!device) return res.status(404).json({ error: 'Device not found' });

  try {
    const result = await zktecoService.connectDevice(device);
    // Update device serial number if available
    try {
      const info = await zktecoService.getDeviceInfo(device.id);
      if (info.serialNumber && !device.serialNumber) {
        await device.update({ serialNumber: info.serialNumber });
      }
    } catch (e) {
      // non-critical, ignore
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}));

// Disconnect from a device
router.post('/:id/disconnect', auth, asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'forbidden' });

  await zktecoService.disconnectDevice(req.params.id);
  res.json({ success: true });
}));

// Get device info (serial, firmware, etc.)
router.get('/:id/info', auth, asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'forbidden' });

  try {
    const info = await zktecoService.getDeviceInfo(req.params.id);
    res.json(info);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}));

// Get users from device
router.get('/:id/users', auth, asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'forbidden' });

  try {
    const users = await zktecoService.getDeviceUsers(req.params.id);
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}));

// Set users on device
router.post('/:id/users', auth, asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'forbidden' });

  const { mappings } = req.body;
  if (!Array.isArray(mappings) || mappings.length === 0) {
    return res.status(400).json({ error: 'Mappings array is required' });
  }

  try {
    const result = await zktecoService.setDeviceUsers(req.params.id, mappings);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}));

// --- Sync Operations ---

// Sync a single device (pull attendance logs)
router.post('/:id/sync', auth, asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'forbidden' });

  try {
    const result = await syncService.syncDeviceWithRetry(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}));

// Sync all devices
router.post('/sync-all', auth, asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'forbidden' });

  const results = await syncService.syncAllDevices();
  res.json({ results, timestamp: new Date() });
}));

// Get sync status for all devices
router.get('/sync/status', auth, asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'forbidden' });

  const devices = await ZkTecoDevice.findAll({
    where: { isActive: true },
    attributes: ['id', 'name', 'ipAddress', 'location', 'outletName', 'lastSyncAt', 'lastSyncStatus', 'lastSyncError', 'totalTransactions', 'autoSync', 'syncInterval'],
    order: [['name', 'ASC']],
  });

  const syncStatuses = devices.map((device) => ({
    ...device.toJSON(),
    lastSyncResult: syncService.getLastSyncResult(device.id),
    isSyncing: syncService.isSyncing,
  }));

  res.json({
    globalSyncing: syncService.isSyncing,
    devices: syncStatuses,
  });
}));

// --- Employee Mapping ---

// Update employee mapping for a device
router.put('/:id/mapping', auth, asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'forbidden' });

  const device = await ZkTecoDevice.findByPk(req.params.id);
  if (!device) return res.status(404).json({ error: 'Device not found' });

  const { userMapping } = req.body;
  if (!userMapping || typeof userMapping !== 'object') {
    return res.status(400).json({ error: 'userMapping object is required (e.g., { "10": "E001", "11": "E002" })' });
  }

  await device.update({ userMapping });
  res.json(device);
}));

// Get current employee mapping
router.get('/:id/mapping', auth, asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'forbidden' });

  const device = await ZkTecoDevice.findByPk(req.params.id);
  if (!device) return res.status(404).json({ error: 'Device not found' });

  res.json({ userMapping: device.userMapping || {} });
}));

// --- Geofencing ---

// Validate a location against a device's geofence
router.post('/:id/geofence/validate', auth, asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'forbidden' });

  const device = await ZkTecoDevice.findByPk(req.params.id);
  if (!device) return res.status(404).json({ error: 'Device not found' });

  const { latitude, longitude } = req.body;
  if (latitude === undefined || longitude === undefined) {
    return res.status(400).json({ error: 'latitude and longitude are required' });
  }

  const result = geofenceService.validatePunch(device, {
    latitude: parseFloat(latitude),
    longitude: parseFloat(longitude),
  });

  res.json({
    deviceId: device.id,
    deviceName: device.name,
    geofenceEnabled: device.geofenceEnabled,
    ...result,
  });
}));

// Validate location against all devices
router.post('/geofence/validate-all', auth, asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'forbidden' });

  const { latitude, longitude } = req.body;
  if (latitude === undefined || longitude === undefined) {
    return res.status(400).json({ error: 'latitude and longitude are required' });
  }

  const devices = await ZkTecoDevice.findAll({ where: { isActive: true } });
  const results = geofenceService.validateForAllDevices(devices, {
    latitude: parseFloat(latitude),
    longitude: parseFloat(longitude),
  });

  res.json(results);
}));

// --- Dashboard Statistics ---

// Get ZKTeco device dashboard stats
router.get('/stats/dashboard', auth, asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'forbidden' });

  const totalDevices = await ZkTecoDevice.count();
  const activeDevices = await ZkTecoDevice.count({ where: { isActive: true } });
  const devicesWithGeofence = await ZkTecoDevice.count({ where: { geofenceEnabled: true, isActive: true } });

  const devices = await ZkTecoDevice.findAll({ attributes: ['id', 'name', 'lastSyncStatus', 'lastSyncAt', 'totalTransactions', 'geofenceEnabled', 'userMapping'] });

  const totalTransactions = devices.reduce((sum, d) => sum + (d.totalTransactions || 0), 0);
  const mappedEmployees = devices.reduce((sum, d) => sum + Object.keys(d.userMapping || {}).length, 0);
  const devicesOnline = devices.filter((d) => d.lastSyncStatus === 'success').length;
  const devicesError = devices.filter((d) => d.lastSyncStatus === 'error').length;

  res.json({
    totalDevices,
    activeDevices,
    devicesOnline,
    devicesError,
    devicesWithGeofence,
    totalTransactions,
    mappedEmployees,
  });
}));

module.exports = router;
