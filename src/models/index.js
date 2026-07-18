const { Sequelize } = require('sequelize');
const config = require('../config/config');
const path = require('path');

let sequelize;
if (config.databaseUrl) {
  sequelize = new Sequelize(config.databaseUrl, { logging: false });
} else {
  const storage = path.join(__dirname, '..', '..', 'database.sqlite');
  sequelize = new Sequelize({ dialect: 'sqlite', storage, logging: false });
}

const Employee = require('./employee')(sequelize);
const Attendance = require('./attendance')(sequelize);
const Payroll = require('./payroll')(sequelize);
const LeaveRequest = require('./leave')(sequelize);
const ZkTecoDevice = require('./zktecoDevice')(sequelize);
const ZkTecoLog = require('./zktecoLog')(sequelize);
const Ticket = require('./ticket')(sequelize);
const Expense = require('./expense')(sequelize);
const Loan = require('./loan')(sequelize);
const MedicalReimbursement = require('./medicalReimbursement')(sequelize);
const AirTicketReimbursement = require('./airTicketReimbursement')(sequelize);
const WorkTiming = require('./workTiming')(sequelize);
const BiometricDevice = require('./biometricDevice')(sequelize);
const BiometricLog = require('./biometricLog')(sequelize);

Employee.hasMany(Attendance, { foreignKey: 'employeeId' });
Attendance.belongsTo(Employee, { foreignKey: 'employeeId' });

Employee.hasMany(Payroll, { foreignKey: 'employeeId' });
Payroll.belongsTo(Employee, { foreignKey: 'employeeId' });

Employee.hasMany(LeaveRequest, { foreignKey: 'employeeId' });
LeaveRequest.belongsTo(Employee, { foreignKey: 'employeeId' });

ZkTecoDevice.hasMany(ZkTecoLog, { foreignKey: 'deviceId' });
ZkTecoLog.belongsTo(ZkTecoDevice, { foreignKey: 'deviceId' });

Employee.hasMany(Ticket, { foreignKey: 'employeeId', sourceKey: 'employeeId' });
Ticket.belongsTo(Employee, { foreignKey: 'employeeId', targetKey: 'employeeId' });

Employee.hasMany(Expense, { foreignKey: 'employeeId', sourceKey: 'employeeId' });
Expense.belongsTo(Employee, { foreignKey: 'employeeId', targetKey: 'employeeId' });

Employee.hasMany(Loan, { foreignKey: 'employeeId', sourceKey: 'employeeId' });
Loan.belongsTo(Employee, { foreignKey: 'employeeId', targetKey: 'employeeId' });

Employee.hasMany(MedicalReimbursement, { foreignKey: 'employeeId', sourceKey: 'employeeId' });
MedicalReimbursement.belongsTo(Employee, { foreignKey: 'employeeId', targetKey: 'employeeId' });

Employee.hasMany(AirTicketReimbursement, { foreignKey: 'employeeId', sourceKey: 'employeeId' });
AirTicketReimbursement.belongsTo(Employee, { foreignKey: 'employeeId', targetKey: 'employeeId' });

BiometricDevice.hasMany(BiometricLog, { foreignKey: 'deviceId' });
BiometricLog.belongsTo(BiometricDevice, { foreignKey: 'deviceId' });

module.exports = { sequelize, Employee, Attendance, Payroll, LeaveRequest, ZkTecoDevice, ZkTecoLog, Ticket, Expense, Loan, MedicalReimbursement, AirTicketReimbursement, WorkTiming, BiometricDevice, BiometricLog };
