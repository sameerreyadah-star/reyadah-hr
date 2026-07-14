const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Loan = sequelize.define('Loan', {
    employeeId: { type: DataTypes.STRING, allowNull: false },
    amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    purpose: { type: DataTypes.TEXT, allowNull: false },
    totalInstallments: { type: DataTypes.INTEGER, allowNull: false },
    installmentAmount: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    paidInstallments: { type: DataTypes.INTEGER, defaultValue: 0 },
    remainingAmount: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    status: {
      type: DataTypes.STRING,
      defaultValue: 'pending',
      validate: { isIn: [['pending', 'approved', 'active', 'completed', 'rejected']] },
    },
    adminNote: { type: DataTypes.TEXT, defaultValue: '' },
    approvedAt: { type: DataTypes.DATE },
    completedAt: { type: DataTypes.DATE },
  });
  return Loan;
};