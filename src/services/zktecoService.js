/**
 * ZKTeco Device Communication Service
 * 
 * This service communicates with ZKTeco biometric devices over TCP/IP.
 * It uses the `zkteco` npm package which implements the ZK protocol
 * used by ZKTeco devices (fingerprint/facial recognition terminals).
 * 
 * IMPORTANT: The `zkteco` npm package's ZKLib constructor expects
 * an ARRAY of device objects, NOT individual IP/port parameters:
 * 
 *   CORRECT:  new ZKLib([{ deviceIp: '192.168.1.100', devicePort: '4370' }])
 *   WRONG:    new ZKLib('192.168.1.100', 4370, ...)
 * 
 * Device types supported: inBio, SF, SL, MB, and other ZKTeco models
 * that support the standard ZK communication protocol on port 4370.
 */

const ZKLib = require('zkteco');

class ZkTecoService {
  constructor() {
    this.connections = new Map(); // deviceId -> { zkInstance, deviceIp, port }
  }

  /**
   * Connect to a ZKTeco device
   * @param {Object} device - Device config from DB
   * @param {number} device.id
   * @param {string} device.ipAddress
   * @param {number} device.port
   * @returns {Promise<Object>} Connection status
   */
  async connectDevice(device) {
    const deviceId = device.id;

    // Close existing connection if any
    await this.disconnectDevice(deviceId);

    try {
      // The zkteco library expects an array of { deviceIp, devicePort }
      const deviceArray = [
        {
          deviceIp: device.ipAddress,
          devicePort: String(device.port || 4370),
        },
      ];
      const zkInstance = new ZKLib(deviceArray);

      // Connect to the device
      await zkInstance.connectAll();

      this.connections.set(deviceId, {
        zkInstance,
        deviceIp: device.ipAddress,
        port: device.port || 4370,
        deviceInfo: device,
      });

      return { success: true, message: 'Connected successfully' };
    } catch (err) {
      this.connections.delete(deviceId);
      throw new Error(
        `Failed to connect to device ${device.ipAddress}: ${err.message}`
      );
    }
  }

  /**
   * Disconnect from a device
   * @param {number} deviceId
   */
  async disconnectDevice(deviceId) {
    const entry = this.connections.get(deviceId);
    if (entry) {
      try {
        await entry.zkInstance.disconnect(entry.deviceIp);
      } catch (e) {
        // Ignore disconnect errors
      }
      this.connections.delete(deviceId);
    }
  }

  /**
   * Get attendance logs from a device (real-time connection)
   * @param {number} deviceId - Database device ID
   * @returns {Promise<Array>} Array of attendance records
   */
  async getAttendanceLogs(deviceId) {
    const entry = this.connections.get(deviceId);
    if (!entry) {
      throw new Error('Device not connected. Call connectDevice first.');
    }

    const { zkInstance, deviceIp, deviceInfo } = entry;

    try {
      // Get attendance records - the library handles enable/disable internally
      const logs = await zkInstance.getAttendances(deviceIp);

      // If no logs returned, return empty array
      if (!logs || !Array.isArray(logs)) return [];

      return logs.map((log) => this._normalizeLog(log, deviceInfo || { id: deviceId }));
    } catch (err) {
      throw new Error(
        `Failed to get attendance logs from ${deviceIp}: ${err.message}`
      );
    }
  }

  /**
   * Get all users registered on the device
   * @param {number} deviceId
   * @returns {Promise<Array>} Array of user records
   */
  async getDeviceUsers(deviceId) {
    const entry = this.connections.get(deviceId);
    if (!entry) {
      throw new Error('Device not connected. Call connectDevice first.');
    }

    const { zkInstance, deviceIp } = entry;

    try {
      const users = await zkInstance.getUsers(deviceIp);
      return users || [];
    } catch (err) {
      throw new Error(`Failed to get users from device: ${err.message}`);
    }
  }

  /**
   * Set user mapping on device (ZK user ID -> employeeId)
   * @param {number} deviceId
   * @param {Array} mappings - Array of { zkUserId, employeeId, name }
   */
  async setDeviceUsers(deviceId, mappings) {
    const entry = this.connections.get(deviceId);
    if (!entry) {
      throw new Error('Device not connected. Call connectDevice first.');
    }

    const { zkInstance, deviceIp } = entry;

    try {
      for (const mapping of mappings) {
        // ZKTeco devices use numeric user IDs
        const userId = parseInt(mapping.zkUserId, 10);
        if (isNaN(userId)) continue;

        // Set user on device: setUser(deviceIp, uid, userid, name, password, role, cardno)
        await zkInstance.setUser(
          deviceIp,
          userId,
          mapping.employeeId,
          mapping.name || '',
          '0'
        );
      }

      return { success: true, count: mappings.length };
    } catch (err) {
      throw new Error(`Failed to set users on device: ${err.message}`);
    }
  }

  /**
   * Get device info (serial number, firmware version, etc.)
   * @param {number} deviceId
   * @returns {Promise<Object>} Device info
   */
  async getDeviceInfo(deviceId) {
    const entry = this.connections.get(deviceId);
    if (!entry) {
      throw new Error('Device not connected. Call connectDevice first.');
    }

    const { zkInstance, deviceIp } = entry;

    try {
      // Get serial number (returns first device's serial in the array)
      const serialNumber = await zkInstance.getSerialNumber();

      // Get device info (user counts, log counts, capacity)
      let info = null;
      try {
        info = await zkInstance.getInfo(deviceIp);
      } catch (e) {
        // non-critical
      }

      // Get device time
      let time = null;
      try {
        time = await zkInstance.getTime(deviceIp);
      } catch (e) {
        // non-critical
      }

      return {
        serialNumber: serialNumber || '',
        firmwareVersion: '',
        deviceName: '',
        platform: '',
        faceDBVersion: '',
        time,
        userCounts: (info && info.userCounts) || 0,
        logCounts: (info && info.logCounts) || 0,
        logCapacity: (info && info.logCapacity) || 0,
      };
    } catch (err) {
      throw new Error(`Failed to get device info: ${err.message}`);
    }
  }

  /**
   * Test connection to a device without persisting it
   * @param {string} ipAddress
   * @param {number} port
   * @returns {Promise<Object>} Test result with device info
   */
  async testConnection(ipAddress, port = 4370) {
    let zkInstance = null;
    try {
      const devices = [{ deviceIp: ipAddress, devicePort: String(port) }];
      zkInstance = new ZKLib(devices);
      await zkInstance.connectAll();

      // Try to get serial number to confirm connection works
      let serialNumber = '';
      try {
        serialNumber = await zkInstance.getSerialNumber();
      } catch (e) {
        // serial number may not be available on all models
      }

      // Disconnect
      await zkInstance.disconnect(ipAddress);

      return {
        success: true,
        serialNumber: serialNumber || '',
        deviceName: '',
        message: 'Device connection successful',
      };
    } catch (err) {
      // Clean up on failure
      if (zkInstance) {
        try {
          await zkInstance.disconnect(ipAddress);
        } catch (e) {
          // ignore cleanup errors
        }
      }
      return {
        success: false,
        serialNumber: '',
        deviceName: '',
        message: `Connection failed: ${err.message}`,
      };
    }
  }

  /**
   * Normalize raw ZK attendance log to common format
   */
  _normalizeLog(log, device) {
    const punchTime = log.recordTime
      ? new Date(log.recordTime)
      : new Date();
    const punchType = parseInt(log.type, 10) || 0;

    // Determine punch status
    let punchStatus = 'unknown';
    if (punchType === 0) punchStatus = 'in'; // Check-in
    else if (punchType === 1) punchStatus = 'out'; // Check-out
    else if (punchType === 4) punchStatus = 'in'; // Fingerprint in (some models)
    else if (punchType === 5) punchStatus = 'out'; // Fingerprint out (some models)

    return {
      zkUserId: parseInt(log.userId, 10) || 0,
      transactionId:
        parseInt(log.id, 10) ||
        parseInt(log.timestamp, 10) ||
        Date.now(),
      punchTime,
      punchType,
      punchStatus,
      verified:
        log.verified === '1' || log.verified === 1 || log.status === true,
      deviceId: device.id,
      rawData: log,
    };
  }

  /**
   * Clear all connections (e.g., on shutdown)
   */
  async clearAllConnections() {
    const deviceIds = Array.from(this.connections.keys());
    for (const id of deviceIds) {
      await this.disconnectDevice(id);
    }
  }
}

module.exports = new ZkTecoService();