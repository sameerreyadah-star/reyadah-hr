const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const AirTicketReimbursement = sequelize.define('AirTicketReimbursement', {
    employeeId: { type: DataTypes.STRING, allowNull: false },
    amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    ticketType: {
      type: DataTypes.STRING,
      defaultValue: 'domestic',
      validate: {
        isIn: [['domestic', 'international']],
      },
    },
    purpose: { type: DataTypes.STRING, allowNull: false },
    departureCity: { type: DataTypes.STRING, allowNull: false },
    destinationCity: { type: DataTypes.STRING, allowNull: false },
    airline: { type: DataTypes.STRING, allowNull: false },
    ticketNumber: { type: DataTypes.STRING, allowNull: false },
    departureDate: { type: DataTypes.DATEONLY, allowNull: false },
    returnDate: { type: DataTypes.DATEONLY },
    invoiceUrl: { type: DataTypes.STRING, defaultValue: '' },
    ticketImageUrl: { type: DataTypes.STRING, defaultValue: '' },
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
  return AirTicketReimbursement;
};
