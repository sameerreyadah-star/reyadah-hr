const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const LeaveRequest = sequelize.define('LeaveRequest', {
    leaveType: { type: DataTypes.STRING, allowNull: false, defaultValue: 'Annual' },
    startDate: { type: DataTypes.DATEONLY, allowNull: false },
    endDate: { type: DataTypes.DATEONLY, allowNull: false },
    reason: { type: DataTypes.TEXT, allowNull: false },
    status: { type: DataTypes.STRING, allowNull: false, defaultValue: 'pending_manager' },
    managerApproval: {
      type: DataTypes.JSON,
      defaultValue: { status: 'pending', approverId: null, approverName: null, note: null, at: null },
    },
    companyApproval: {
      type: DataTypes.JSON,
      defaultValue: { status: 'pending', approverId: null, approverName: null, note: null, at: null },
    },
  });

  return LeaveRequest;
};
