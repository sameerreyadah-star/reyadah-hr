const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const ZkTecoDevice = sequelize.define('ZkTecoDevice', {
    name: { type: DataTypes.STRING, allowNull: false },
    ipAddress: { type: DataTypes.STRING, allowNull: false },
    port: { type: DataTypes.INTEGER, defaultValue: 4370 },
    serialNumber: { type: DataTypes.STRING, allowNull: true },
    location: { type: DataTypes.STRING, allowNull: true },  // e.g., "Dubai Mall Outlet"
    outletName: { type: DataTypes.STRING, allowNull: true },
    // Geofencing configuration
    geofenceEnabled: { type: DataTypes.BOOLEAN, defaultValue: false },
    geofenceLatitude: { type: DataTypes.DECIMAL(10, 7), allowNull: true },
    geofenceLongitude: { type: DataTypes.DECIMAL(10, 7), allowNull: true },
    geofenceRadius: { type: DataTypes.INTEGER, defaultValue: 100 }, // meters
    // Sync configuration
    syncInterval: { type: DataTypes.INTEGER, defaultValue: 5 }, // minutes
    autoSync: { type: DataTypes.BOOLEAN, defaultValue: true },
    lastSyncAt: { type: DataTypes.DATE, allowNull: true },
    lastSyncStatus: { type: DataTypes.STRING, allowNull: true }, // 'success', 'error', 'connecting'
    lastSyncError: { type: DataTypes.TEXT, allowNull: true },
    totalTransactions: { type: DataTypes.INTEGER, defaultValue: 0 },
    lastTransactionId: { type: DataTypes.INTEGER, defaultValue: 0 }, // track last transaction ID
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
    // Device user mapping (ZK user ID -> employeeId mapping)
    userMapping: { type: DataTypes.JSON, defaultValue: {} }, // { "10": "E001", "11": "E002" }
    // Connection credentials
    connectionPassword: { type: DataTypes.STRING, defaultValue: '0' },
  });
  return ZkTecoDevice;
};