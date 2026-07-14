/**
 * ZKTeco Attendance Sync Service
 * 
 * This service handles:
 * 1. Connecting to ZKTeco devices
 * 2. Pulling attendance logs
 * 3. Matching ZK user IDs to employee records
 * 4. Creating attendance records in the system
 * 5. Tracking sync state per device
 * 
 * It supports both manual sync (API-triggered) and 
 * automatic scheduled sync (via node-cron).
 */

const { Op, literal } = require('sequelize');
const { sequelize, ZkTecoDevice, ZkTecoLog, Attendance, Employee } = require('../models');
const zktecoService = require('./zktecoService');
const geofenceService = require('./geofenceService');

class SyncService {
  constructor() {
    this.isSyncing = false;
    this.syncResults = new Map(); // deviceId -> last sync result
  }

  /**
   * Sync attendance from a specific device
   * @param {number} deviceId - Database device ID
   * @returns {Promise<Object>} Sync result summary
   */
  async syncDevice(deviceId) {
    const device = await ZkTecoDevice.findByPk(deviceId);
    if (!device) {
      throw new Error(`Device ${deviceId} not found`);
    }
    if (!device.isActive) {
      return { deviceId, status: 'skipped', message: 'Device is inactive' };
    }

    const result = {
      deviceId: device.id,
      deviceName: device.name,
      status: 'started',
      newLogs: 0,
      syncedAttendance: 0,
      skippedLogs: 0,
      errors: [],
      startedAt: new Date(),
      completedAt: null,
    };

    try {
      // Update device status to connecting
      await device.update({ lastSyncStatus: 'connecting' });

      // Connect to device
      await zktecoService.connectDevice(device);

      // Get attendance logs
      const logs = await zktecoService.getAttendanceLogs(deviceId);
      result.totalLogs = logs.length;

      // Get existing transaction IDs to avoid duplicates
      const existingTxnIds = await this._getExistingTransactionIds(deviceId);

      // Get employee mapping from device config
      const userMapping = device.userMapping || {};

      let newLogCount = 0;
      let syncedCount = 0;
      let skippedCount = 0;

      // Process logs in chunks to avoid memory issues
      const CHUNK_SIZE = 100;
      for (let i = 0; i < logs.length; i += CHUNK_SIZE) {
        const chunk = logs.slice(i, i + CHUNK_SIZE);

        for (const log of chunk) {
          try {
            // Skip if already synced
            if (existingTxnIds.has(log.transactionId)) {
              skippedCount++;
              continue;
            }

            // Map ZK user ID to employee
            const employeeId = userMapping[String(log.zkUserId)] || null;

            // Create ZkTecoLog record
            await ZkTecoLog.create({
              deviceId: device.id,
              zkUserId: log.zkUserId,
              employeeId,
              transactionId: log.transactionId,
              punchTime: log.punchTime,
              punchType: log.punchType,
              punchStatus: log.punchStatus,
              verified: log.verified,
              syncStatus: employeeId ? 'pending' : 'skipped',
              syncMessage: employeeId
                ? 'Awaiting attendance sync'
                : `No employee mapping for ZK user ID ${log.zkUserId}`,
              latitude: log.latitude || null,
              longitude: log.longitude || null,
              withinGeofence: log.withinGeofence || null,
              geofenceDistance: log.geofenceDistance || null,
              rawData: log.rawData,
            });

            newLogCount++;

            // Create attendance record if employee is mapped
            if (employeeId) {
              await this._createAttendanceRecord(log, employeeId, device);
              syncedCount++;
            }
          } catch (logErr) {
            result.errors.push(`Log processing error: ${logErr.message}`);
            skippedCount++;
          }
        }
      }

      result.newLogs = newLogCount;
      result.syncedAttendance = syncedCount;
      result.skippedLogs = skippedCount;
      result.status = 'success';

      // Update device sync state
      const latestTxnId = logs.reduce(
        (max, log) => Math.max(max, log.transactionId),
        device.lastTransactionId || 0
      );

      await device.update({
        lastSyncAt: new Date(),
        lastSyncStatus: 'success',
        lastSyncError: null,
        totalTransactions: literal(`totalTransactions + ${newLogCount}`),
        lastTransactionId: Math.max(latestTxnId, device.lastTransactionId || 0),
      });

      // Store last sync result
      this.syncResults.set(deviceId, {
        status: 'success',
        newLogs: newLogCount,
        syncedAttendance: syncedCount,
        skippedLogs: skippedCount,
        errors: result.errors,
        timestamp: new Date(),
      });

    } catch (err) {
      result.status = 'error';
      result.errors.push(err.message);
      result.syncedAttendance = 0;

      // Update device status to error
      await device.update({
        lastSyncStatus: 'error',
        lastSyncError: err.message,
      });

      this.syncResults.set(deviceId, {
        status: 'error',
        message: err.message,
        timestamp: new Date(),
      });
    } finally {
      // Disconnect from device
      try {
        await zktecoService.disconnectDevice(deviceId);
      } catch (discErr) {
        // Ignore disconnect errors
      }

      result.completedAt = new Date();
    }

    return result;
  }

  /**
   * Sync attendance from all active devices
   * @returns {Promise<Array<Object>>} Array of sync results per device
   */
  async syncAllDevices() {
    if (this.isSyncing) {
      return [{ status: 'error', message: 'Sync already in progress' }];
    }

    this.isSyncing = true;
    const results = [];

    try {
      const devices = await ZkTecoDevice.findAll({
        where: { isActive: true },
        order: [['name', 'ASC']],
      });

      for (const device of devices) {
        try {
          const result = await this.syncDevice(device.id);
          results.push(result);
        } catch (err) {
          results.push({
            deviceId: device.id,
            deviceName: device.name,
            status: 'error',
            errors: [err.message],
          });
        }
      }
    } finally {
      this.isSyncing = false;
    }

    return results;
  }

  /**
   * Sync a single device with retry logic
   * @param {number} deviceId
   * @param {Object} options
   */
  async syncDeviceWithRetry(deviceId, options = {}) {
    const maxAttempts = 3;
    let lastError;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await this.syncDevice(deviceId);
      } catch (err) {
        lastError = err;
        if (attempt < maxAttempts) {
          // Wait before retrying (exponential backoff)
          await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
        }
      }
    }

    throw lastError;
  }

  /**
   * Get the last sync result for a device
   * @param {number} deviceId
   * @returns {Object|null}
   */
  getLastSyncResult(deviceId) {
    return this.syncResults.get(deviceId) || null;
  }

  /**
   * Create attendance record in the main system from a ZK log
   */
  async _createAttendanceRecord(log, employeeId, device) {
    // Find the employee
    const employee = await Employee.findOne({ where: { employeeId } });
    if (!employee) {
      // Update the ZkTecoLog to indicate error
      await ZkTecoLog.update(
        { syncStatus: 'error', syncMessage: `Employee ${employeeId} not found` },
        { where: { transactionId: log.transactionId, deviceId: device.id } }
      );
      return;
    }

    // Create date key from punch time
    const date = log.punchTime.toISOString().slice(0, 10);

    // Find or create attendance record
    const existingAttendance = await Attendance.findOne({
      where: { employeeId: employee.id, date },
    });

    if (log.punchStatus === 'in' || log.punchType === 0 || log.punchType === 4) {
      // Check-in punch
      if (!existingAttendance) {
        await Attendance.create({
          employeeId: employee.id,
          date,
          clockIn: log.punchTime,
          status: 'p',
        });
      } else if (!existingAttendance.clockIn) {
        await existingAttendance.update({
          clockIn: log.punchTime,
          status: 'p',
        });
      }
    } else if (log.punchStatus === 'out' || log.punchType === 1 || log.punchType === 5) {
      // Check-out punch
      if (existingAttendance) {
        if (!existingAttendance.clockOut) {
          await existingAttendance.update({
            clockOut: log.punchTime,
            status: 'p',
          });
        }
      } else {
        // Check-out without check-in - create full record
        await Attendance.create({
          employeeId: employee.id,
          date,
          clockOut: log.punchTime,
          status: 'p',
        });
      }
    }

    // Mark ZkTecoLog as synced
    await ZkTecoLog.update(
      {
        syncStatus: 'synced',
        syncMessage: `Attendance updated for ${date}`,
        employeeId,
      },
      { where: { transactionId: log.transactionId, deviceId: device.id } }
    );
  }

  /**
   * Get set of already-processed transaction IDs for a device
   */
  async _getExistingTransactionIds(deviceId) {
    const logs = await ZkTecoLog.findAll({
      where: { deviceId },
      attributes: ['transactionId'],
      raw: true,
    });
    return new Set(logs.map((log) => log.transactionId));
  }

  /**
   * Export sync logs with optional date filter
   */
  async getSyncLogs(filters = {}) {
    const where = {};

    if (filters.deviceId) where.deviceId = filters.deviceId;
    if (filters.employeeId) where.employeeId = filters.employeeId;
    if (filters.status) where.syncStatus = filters.status;
    if (filters.fromDate || filters.toDate) {
      where.punchTime = {};
      if (filters.fromDate) where.punchTime[Op.gte] = new Date(filters.fromDate);
      if (filters.toDate) where.punchTime[Op.lte] = new Date(filters.toDate);
    }

    return ZkTecoLog.findAll({
      where,
      include: [
        { model: ZkTecoDevice, attributes: ['name', 'ipAddress', 'location', 'outletName'] },
      ],
      order: [['punchTime', 'DESC']],
      limit: 1000,
    });
  }
}

module.exports = new SyncService();