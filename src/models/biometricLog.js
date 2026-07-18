const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const BiometricLog = sequelize.define('BiometricLog', {
    deviceId: { type: DataTypes.INTEGER, allowNull: false },
    employeeId: { type: DataTypes.STRING, allowNull: false },
    punchTime: { type: DataTypes.DATE, allowNull: false },
    punchType: { type: DataTypes.STRING, defaultValue: 'unknown' }, // 'in', 'out', 'unknown'
    punchMode: { type: DataTypes.STRING, defaultValue: 'fingerprint' }, // 'fingerprint', 'face', 'card', 'pin'
    verified: { type: DataTypes.BOOLEAN, defaultValue: true },
    syncStatus: { type: DataTypes.STRING, defaultValue: 'pending' }, // 'pending', 'synced', 'error'
    rawData: { type: DataTypes.JSONB, defaultValue: {} },
  });
  return BiometricLog;
};