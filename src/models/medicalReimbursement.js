const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const MedicalReimbursement = sequelize.define('MedicalReimbursement', {
    employeeId: { type: DataTypes.STRING, allowNull: false },
    amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    medicalType: {
      type: DataTypes.STRING,
      defaultValue: 'consultation',
      validate: {
        isIn: [['consultation', 'medication', 'surgery', 'diagnostic', 'dental', 'optical', 'emergency', 'other']],
      },
    },
    description: { type: DataTypes.TEXT, allowNull: false },
    hospitalName: { type: DataTypes.STRING, allowNull: false },
    receiptUrl: { type: DataTypes.STRING, defaultValue: '' },
    expenseDate: { type: DataTypes.DATEONLY, allowNull: false },
    status: {
      type: DataTypes.STRING,
      defaultValue: 'pending',
      validate: { isIn: [['pending', 'approved', 'rejected', 'reimbursed']] },
    },
    managerNote: { type: DataTypes.TEXT, defaultValue: '' },
    adminNote: { type: DataTypes.TEXT, defaultValue: '' },
    approvedAt: { type: DataTypes.DATE },
    reimbursedAt: { type: DataTypes.DATE },
  });
  return MedicalReimbursement;
};
