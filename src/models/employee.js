const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Employee = sequelize.define('Employee', {
    employeeId: { type: DataTypes.STRING, unique: true, allowNull: false },
    name: { type: DataTypes.STRING, allowNull: false },
    email: { type: DataTypes.STRING },
    passwordHash: { type: DataTypes.STRING },
    role: { type: DataTypes.STRING, defaultValue: 'employee' },
    designation: { type: DataTypes.STRING },
    salary: { type: DataTypes.DECIMAL(10,2), defaultValue: 0 },
    documents: { type: DataTypes.JSON, defaultValue: [] },
    assets: { type: DataTypes.JSON, defaultValue: [] },
    shiftRoster: { type: DataTypes.JSON, defaultValue: {} },
    photoUrl: { type: DataTypes.STRING },
    facePhotoUrl: { type: DataTypes.STRING },
    dateOfBirth: { type: DataTypes.DATEONLY },
    leaveEntitlements: { type: DataTypes.JSON, defaultValue: {} },
    paidHolidays: { type: DataTypes.INTEGER, defaultValue: 0 },
    // New fields for enhanced employee management
    fines: { type: DataTypes.JSON, defaultValue: [] },           // [{id, amount, reason, date, type, status}]
    emergencyContact: { type: DataTypes.JSON, defaultValue: {} }, // {name, phone, relation}
    bankDetails: { type: DataTypes.JSON, defaultValue: {} },      // {accountName, accountNumber, bankName, iban}
    education: { type: DataTypes.JSON, defaultValue: [] },        // [{degree, institution, year, grade}]
    visaInfo: { type: DataTypes.JSON, defaultValue: {} },         // {passportNo, passportExpiry, visaExpiry, emiratesId}
    contractInfo: { type: DataTypes.JSON, defaultValue: {} },     // {startDate, probationEnd, contractEnd, contractType}
    department: { type: DataTypes.STRING },
    phone: { type: DataTypes.STRING },
    nationality: { type: DataTypes.STRING },
    leaveAdjustments: { type: DataTypes.JSON, defaultValue: [] }, // [{id, type, days, reason, createdBy, createdAt}]
  });
  return Employee;
};
