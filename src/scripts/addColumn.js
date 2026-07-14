const { sequelize } = require('../models');
const { QueryTypes } = require('sequelize');

async function main() {
  try {
    // Check if column exists first
    const employeeTableInfo = await sequelize.query("PRAGMA table_info('Employees')", { type: QueryTypes.SELECT });
    const attendanceTableInfo = await sequelize.query("PRAGMA table_info('Attendances')", { type: QueryTypes.SELECT });
    const hasFacePhotoUrl = employeeTableInfo.some(col => col.name === 'facePhotoUrl');
    
    if (!hasFacePhotoUrl) {
      await sequelize.query("ALTER TABLE Employees ADD COLUMN facePhotoUrl TEXT;");
      console.log('✅ Added facePhotoUrl column to Employees table');
    } else {
      console.log('✅ facePhotoUrl column already exists');
    }
    
    const hasPaidHolidays = employeeTableInfo.some(col => col.name === 'paidHolidays');
    
    if (!hasPaidHolidays) {
      await sequelize.query("ALTER TABLE Employees ADD COLUMN paidHolidays INTEGER DEFAULT 0;");
      console.log('✅ Added paidHolidays column to Employees table');
    } else {
      console.log('✅ paidHolidays column already exists');
    }
    
    const hasClockInPhoto = attendanceTableInfo.some(col => col.name === 'clockInPhoto');
    if (!hasClockInPhoto) {
      await sequelize.query("ALTER TABLE Attendances ADD COLUMN clockInPhoto TEXT;");
      console.log('✅ Added clockInPhoto column to Attendances table');
    }
    
    const hasClockOutPhoto = attendanceTableInfo.some(col => col.name === 'clockOutPhoto');
    if (!hasClockOutPhoto) {
      await sequelize.query("ALTER TABLE Attendances ADD COLUMN clockOutPhoto TEXT;");
      console.log('✅ Added clockOutPhoto column to Attendances table');
    }
    
    console.log('✅ Database schema fix completed');
  } catch (err) {
    console.error('Error:', err.message);
  }
  process.exit(0);
}

main();
