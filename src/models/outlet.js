const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Outlet = sequelize.define('Outlet', {
    name: { type: DataTypes.STRING, allowNull: false, unique: true },
    outletId: { type: DataTypes.STRING, unique: true },
    description: { type: DataTypes.STRING, defaultValue: '' },
    address: { type: DataTypes.STRING, defaultValue: '' },
    phone: { type: DataTypes.STRING, defaultValue: '' },
    email: { type: DataTypes.STRING, defaultValue: '' },
    logoUrl: { type: DataTypes.STRING, defaultValue: '' },
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
    managerId: { type: DataTypes.STRING, defaultValue: '' }, // employeeId of manager
  });
  return Outlet;
};