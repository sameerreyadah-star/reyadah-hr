const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Payroll = sequelize.define('Payroll', {
    month: { type: DataTypes.INTEGER, allowNull: false },
    year: { type: DataTypes.INTEGER, allowNull: false },
    // Salary components
    basicSalary: { type: DataTypes.DECIMAL(12,2), defaultValue: 0 },
    housingAllowance: { type: DataTypes.DECIMAL(12,2), defaultValue: 0 },
    transportAllowance: { type: DataTypes.DECIMAL(12,2), defaultValue: 0 },
    foodAllowance: { type: DataTypes.DECIMAL(12,2), defaultValue: 0 },
    otherAllowances: { type: DataTypes.DECIMAL(12,2), defaultValue: 0 },
    gross: { type: DataTypes.DECIMAL(12,2), defaultValue: 0 },
    // Deductions
    absentDeduction: { type: DataTypes.DECIMAL(12,2), defaultValue: 0 },
    loanDeduction: { type: DataTypes.DECIMAL(12,2), defaultValue: 0 },
    advanceDeduction: { type: DataTypes.DECIMAL(12,2), defaultValue: 0 },
    insuranceDeduction: { type: DataTypes.DECIMAL(12,2), defaultValue: 0 },
    taxDeduction: { type: DataTypes.DECIMAL(12,2), defaultValue: 0 },
    otherDeductions: { type: DataTypes.DECIMAL(12,2), defaultValue: 0 },
    totalDeductions: { type: DataTypes.DECIMAL(12,2), defaultValue: 0 },
    // UAE Gratuity
    gratuityAmount: { type: DataTypes.DECIMAL(12,2), defaultValue: 0 },
    gratuityDays: { type: DataTypes.DECIMAL(8,2), defaultValue: 0 },
    gratuityEligible: { type: DataTypes.BOOLEAN, defaultValue: false },
    serviceYears: { type: DataTypes.DECIMAL(6,2), defaultValue: 0 },
    // Net
    net: { type: DataTypes.DECIMAL(12,2), defaultValue: 0 },
    // Payment tracking
    paymentStatus: {
      type: DataTypes.STRING,
      defaultValue: 'pending',
      validate: { isIn: [['pending', 'processing', 'paid', 'cancelled']] },
    },
    paymentDate: { type: DataTypes.DATE },
    paymentMethod: { type: DataTypes.STRING, defaultValue: 'bank_transfer' },
    transactionReference: { type: DataTypes.STRING },
    paidBy: { type: DataTypes.STRING },
    paidAt: { type: DataTypes.DATE },
    // Detailed breakdown
    details: { type: DataTypes.JSON, defaultValue: {} },
    // Notes
    notes: { type: DataTypes.TEXT, defaultValue: '' },
  });
  return Payroll;
};
