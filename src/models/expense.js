const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Expense = sequelize.define('Expense', {
    employeeId: { type: DataTypes.STRING, allowNull: false },
    amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    category: {
      type: DataTypes.STRING,
      defaultValue: 'other',
      validate: {
        isIn: [['travel', 'office-supplies', 'meals', 'transport', 'utilities', 'other']],
      },
    },
    description: { type: DataTypes.TEXT, allowNull: false },
    expenseDate: { type: DataTypes.DATEONLY, allowNull: false },
    invoiceUrl: { type: DataTypes.STRING, defaultValue: '' },
    status: {
      type: DataTypes.STRING,
      defaultValue: 'pending',
      validate: { isIn: [['pending', 'approved', 'rejected', 'reimbursed']] },
    },
    adminNote: { type: DataTypes.TEXT, defaultValue: '' },
    reimbursedAt: { type: DataTypes.DATE },
  });
  return Expense;
};