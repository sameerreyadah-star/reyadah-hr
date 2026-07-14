const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Ticket = sequelize.define('Ticket', {
    employeeId: { type: DataTypes.STRING, allowNull: false },
    subject: { type: DataTypes.STRING, allowNull: false },
    category: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'attendance',
      validate: {
        isIn: [['attendance', 'work-from-home', 'shift-change', 'technical', 'hr', 'other']],
      },
    },
    description: { type: DataTypes.TEXT, allowNull: false },
    priority: {
      type: DataTypes.STRING,
      defaultValue: 'medium',
      validate: { isIn: [['low', 'medium', 'high', 'urgent']] },
    },
    status: {
      type: DataTypes.STRING,
      defaultValue: 'open',
      validate: { isIn: [['open', 'in-progress', 'resolved', 'closed']] },
    },
    adminResponse: { type: DataTypes.TEXT, defaultValue: '' },
    attachmentUrl: { type: DataTypes.STRING, defaultValue: '' },
    resolvedAt: { type: DataTypes.DATE },
  });
  return Ticket;
};