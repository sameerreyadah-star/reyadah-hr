const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const WorkTiming = sequelize.define('WorkTiming', {
    outletName: { type: DataTypes.STRING, allowNull: false },
    shiftStart: { type: DataTypes.STRING, allowNull: false }, // e.g. "09:00"
    shiftEnd: { type: DataTypes.STRING, allowNull: false },   // e.g. "18:00"
    breakStart: { type: DataTypes.STRING, allowNull: true },  // e.g. "13:00"
    breakEnd: { type: DataTypes.STRING, allowNull: true },    // e.g. "14:00"
    workingDays: { type: DataTypes.JSON, defaultValue: ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'] },
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
    description: { type: DataTypes.STRING, defaultValue: '' },
  });
  return WorkTiming;
};