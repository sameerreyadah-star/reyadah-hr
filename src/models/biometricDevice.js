const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const BiometricDevice = sequelize.define('BiometricDevice', {
    name: { type: DataTypes.STRING, allowNull: false },
    model: { type: DataTypes.STRING, defaultValue: '' },
    serialNumber: { type: DataTypes.STRING, defaultValue: '' },
    location: { type: DataTypes.STRING, defaultValue: '' },
    notes: { type: DataTypes.TEXT, defaultValue: '' },
    apiKey: { type: DataTypes.STRING, allowNull: false, unique: true },
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
    lastSyncAt: { type: DataTypes.DATE, allowNull: true },
    lastSyncStatus: { type: DataTypes.STRING, allowNull: true },
    totalTransactions: { type: DataTypes.INTEGER, defaultValue: 0 },
  });
  return BiometricDevice;
};