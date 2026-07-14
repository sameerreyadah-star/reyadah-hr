const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Attendance = sequelize.define('Attendance', {
    date: { type: DataTypes.DATEONLY, allowNull: false },
    clockIn: { type: DataTypes.DATE },
    clockOut: { type: DataTypes.DATE },
    status: { type: DataTypes.STRING, allowNull: true }, // 'p' | 'a' | 'o' or null
    shift: { type: DataTypes.STRING, allowNull: true }, // shift code like 'OFIX', '23', etc.
    clockInPhoto: { type: DataTypes.STRING, allowNull: true }, // path to clock-in selfie
    clockOutPhoto: { type: DataTypes.STRING, allowNull: true }, // path to clock-out selfie
  });
  return Attendance;
};