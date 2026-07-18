/**
 * Biometric Device Integration API
 * 
 * This API allows ZKTeco (or any biometric device vendor) to push
 * attendance logs directly into the Reyadah HR system.
 * 
 * Authentication: API Key (sent via X-API-Key header)
 * 
 * Endpoints:
 *   POST /api/biometric/attendance  - Push attendance logs
 *   POST /api/biometric/register    - Register a device
 *   GET  /api/biometric/health      - Health check
 * 
 * Expected attendance payload:
 * {
 *   "deviceId": "ZK-001",
 *   "logs": [
 *     {
 *       "employeeId": "E001",       // Employee ID in your system
 *       "punchTime": "2026-07-18T08:30:00",  // ISO datetime
 *       "punchType": "in",           // "in" or "out"
 *       "punchMode": "fingerprint",  // "fingerprint", "face", "card", "pin"
 *       "verified": true
 *     }
 *   ]
 * }
 */

const express = require('express');
const router = express.Router();
const asyncHandler = require('../utils/asyncHandler');
const { Employee, Attendance, BiometricDevice, BiometricLog } = require('../models');
const { Op } = require('sequelize');

// ==================== API KEY AUTHENTICATION ====================

// Simple API key validation
async function validateApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  
  if (!apiKey) {
    return res.status(401).json({ 
      success: false, 
      error: 'Missing API key. Provide it via X-API-Key header.' 
    });
  }

  try {
    const device = await BiometricDevice.findOne({ 
      where: { apiKey, isActive: true } 
    });
    
    if (!device) {
      return res.status(403).json({ 
        success: false, 
        error: 'Invalid or inactive API key.' 
      });
    }

    req.biometricDevice = device;
    next();
  } catch (err) {
    return res.status(500).json({ 
      success: false, 
      error: 'Authentication error.' 
    });
  }
}

// ==================== ENDPOINTS ====================

/**
 * POST /api/biometric/register
 * Register a new biometric device and generate API key
 * Requires admin JWT token
 */
router.post('/register', require('../middleware/auth'), asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Only admins can register devices.' });
  }

  const { name, model, serialNumber, location, notes } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Device name is required.' });
  }

  // Generate a secure API key
  const crypto = require('crypto');
  const apiKey = 'rh_' + crypto.randomBytes(24).toString('hex');

  const device = await BiometricDevice.create({
    name,
    model: model || '',
    serialNumber: serialNumber || '',
    location: location || '',
    notes: notes || '',
    apiKey,
    isActive: true,
  });

  res.status(201).json({
    success: true,
    message: 'Device registered successfully. Share the API key with the vendor.',
    device: {
      id: device.id,
      name: device.name,
      model: device.model,
      serialNumber: device.serialNumber,
      apiKey: device.apiKey,  // Show once
      createdAt: device.createdAt,
    },
  });
}));

/**
 * POST /api/biometric/attendance
 * Push attendance logs from biometric device
 * Authenticated via X-API-Key header
 */
router.post('/attendance', validateApiKey, asyncHandler(async (req, res) => {
  const { logs, deviceId: externalDeviceId } = req.body;
  const device = req.biometricDevice;

  if (!logs || !Array.isArray(logs) || logs.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Request must include a "logs" array with at least one entry.',
    });
  }

  if (logs.length > 500) {
    return res.status(400).json({
      success: false,
      error: 'Maximum 500 logs per request. Send in batches.',
    });
  }

  const results = {
    totalReceived: logs.length,
    synced: 0,
    skipped: 0,
    errors: [],
  };

  for (const log of logs) {
    try {
      // Validate required fields
      if (!log.employeeId || !log.punchTime) {
        results.skipped++;
        results.errors.push(`Missing employeeId or punchTime for log`);
        continue;
      }

      // Find employee
      const employee = await Employee.findOne({ 
        where: { employeeId: String(log.employeeId).trim() } 
      });
      
      if (!employee) {
        results.skipped++;
        results.errors.push(`Employee "${log.employeeId}" not found in system`);
        continue;
      }

      // Parse punch time
      const punchTime = new Date(log.punchTime);
      if (isNaN(punchTime.getTime())) {
        results.skipped++;
        results.errors.push(`Invalid punchTime "${log.punchTime}" for employee ${log.employeeId}`);
        continue;
      }

      // Determine punch type (in/out)
      let punchType = 'unknown';
      const typeStr = String(log.punchType || '').toLowerCase();
      if (typeStr === 'in' || typeStr === '0' || typeStr === 'check-in') {
        punchType = 'in';
      } else if (typeStr === 'out' || typeStr === '1' || typeStr === 'check-out') {
        punchType = 'out';
      }

      // Create date key from punch time
      const date = punchTime.toISOString().slice(0, 10);

      // Log the biometric event
      await BiometricLog.create({
        deviceId: device.id,
        employeeId: employee.employeeId,
        punchTime,
        punchType,
        punchMode: log.punchMode || 'fingerprint',
        verified: log.verified !== false,
        rawData: log,
        syncStatus: 'synced',
      });

      // Find or create attendance record for this date
      const existingAttendance = await Attendance.findOne({
        where: { employeeId: employee.id, date },
      });

      if (punchType === 'in') {
        if (!existingAttendance) {
          await Attendance.create({
            employeeId: employee.id,
            date,
            clockIn: punchTime,
            status: 'p',
          });
        } else if (!existingAttendance.clockIn) {
          await existingAttendance.update({
            clockIn: punchTime,
            status: 'p',
          });
        } else {
          // Already has clock-in - log as additional punch
          results.skipped++;
          results.errors.push(`Employee ${log.employeeId} already has clock-in for ${date}`);
          continue;
        }
      } else if (punchType === 'out') {
        if (existingAttendance) {
          if (!existingAttendance.clockOut) {
            await existingAttendance.update({
              clockOut: punchTime,
              status: 'p',
            });
          } else {
            results.skipped++;
            results.errors.push(`Employee ${log.employeeId} already has clock-out for ${date}`);
            continue;
          }
        } else {
          // Clock-out without clock-in - create record
          await Attendance.create({
            employeeId: employee.id,
            date,
            clockOut: punchTime,
            status: 'p',
          });
        }
      } else {
        results.skipped++;
        results.errors.push(`Unknown punchType "${log.punchType}" for employee ${log.employeeId}`);
        continue;
      }

      results.synced++;

    } catch (err) {
      results.skipped++;
      results.errors.push(`Error processing log: ${err.message}`);
    }
  }

  // Update device last sync info
  await device.update({
    lastSyncAt: new Date(),
    lastSyncStatus: results.errors.length === results.totalReceived ? 'error' : 'success',
    totalTransactions: (device.totalTransactions || 0) + results.synced,
  });

  res.json({
    success: true,
    message: `Processed ${results.totalReceived} logs: ${results.synced} synced, ${results.skipped} skipped`,
    results,
  });
}));

/**
 * GET /api/biometric/health
 * Health check endpoint (no auth required)
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Reyadah HR Biometric Integration API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    documentation: 'Contact Reyadah HR admin for API documentation',
  });
});

/**
 * GET /api/biometric/devices
 * List registered devices (admin only)
 */
router.get('/devices', require('../middleware/auth'), asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const devices = await BiometricDevice.findAll({
    order: [['createdAt', 'DESC']],
  });

  // Return full API keys for admin management
  const devicesList = devices.map(d => ({
    id: d.id,
    name: d.name,
    model: d.model,
    serialNumber: d.serialNumber,
    location: d.location,
    isActive: d.isActive,
    lastSyncAt: d.lastSyncAt,
    lastSyncStatus: d.lastSyncStatus,
    totalTransactions: d.totalTransactions,
    apiKey: d.apiKey || null,
    createdAt: d.createdAt,
  }));

  res.json(devicesList);
}));

/**
 * DELETE /api/biometric/devices/:id
 * Deactivate a device (admin only)
 */
router.delete('/devices/:id', require('../middleware/auth'), asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const device = await BiometricDevice.findByPk(req.params.id);
  if (!device) {
    return res.status(404).json({ error: 'Device not found' });
  }

  await device.destroy();
  res.json({ success: true, message: 'Device deleted permanently' });
}));

module.exports = router;