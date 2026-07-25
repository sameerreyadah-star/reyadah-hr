const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Role = sequelize.define('Role', {
    name: { type: DataTypes.STRING, allowNull: false, unique: true },
    label: { type: DataTypes.STRING, allowNull: false },
    description: { type: DataTypes.STRING, defaultValue: '' },
    permissions: { type: DataTypes.JSON, defaultValue: [] },
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
  });
  return Role;
};