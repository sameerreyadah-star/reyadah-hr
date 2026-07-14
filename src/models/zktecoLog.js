const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const ZkTecoLog = sequelize.define('ZkTecoLog', {
    deviceId: { type: DataTypes.INTEGER, allowNull: false },
    zkUserId: { type: DataTypes.INTEGER, allowNull: false },       // ZK device user ID (numeric)
    employeeId: { type: DataTypes.STRING, allowNull: true },       // Your system employee ID
    transactionId: { type: DataTypes.INTEGER, allowNull: false },  // Device transaction ID
    punchTime: { type: DataTypes.DATE, allowNull: false },         // When punch occurred on device
    punchType: { type: DataTypes.INTEGER, defaultValue: 0 },       // 0=CheckIn, 1=CheckOut, 2=OvertimeIn, 3=OvertimeOut
    punchStatus: { type: DataTypes.STRING, allowNull: true },      // e.g., 'in', 'out', 'unknown'
    verified: { type: DataTypes.BOOLEAN, defaultValue: false },    // Fingerprint/face verified
    // Geofencing data (if mobile check-in or location-tracked)
    latitude: { type: DataTypes.DECIMAL(10, 7), allowNull: true },
    longitude: { type: DataTypes.DECIMAL(10, 7), allowNull: true },
    withinGeofence: { type: DataTypes.BOOLEAN, allowNull: true },
    geofenceDistance: { type: DataTypes.DECIMAL(10, 2), allowNull: true }, // meters
    // Sync metadata
    syncedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    syncStatus: { type: DataTypes.STRING, defaultValue: 'pending' }, // 'pending', 'synced', 'skipped', 'error'
    syncMessage: { type: DataTypes.TEXT, allowNull: true },
    // Raw device data
    rawData: { type: DataTypes.JSON, allowNull: true },
  });
  return ZkTecoLog;
};