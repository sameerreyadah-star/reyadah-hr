/**
 * Migration script to add UAE gratuity columns to the Payroll table
 * Run: node src/scripts/migrate-payroll.js
 */
require('dotenv').config();
const { Sequelize } = require('sequelize');
const config = require('../config/config');

async function migrate() {
  const sequelize = new Sequelize(config.databaseUrl, { logging: console.log });

  try {
    // Check if columns exist first
    const tableInfo = await sequelize.getQueryInterface().describeTable('Payrolls');
    
    const columnsToAdd = {
      gratuityAmount: { type: Sequelize.DECIMAL(12,2), defaultValue: 0 },
      gratuityDays: { type: Sequelize.DECIMAL(8,2), defaultValue: 0 },
      gratuityEligible: { type: Sequelize.BOOLEAN, defaultValue: false },
      serviceYears: { type: Sequelize.DECIMAL(6,2), defaultValue: 0 },
    };

    for (const [colName, colDef] of Object.entries(columnsToAdd)) {
      if (!tableInfo[colName]) {
        console.log(`Adding column: ${colName}`);
        await sequelize.getQueryInterface().addColumn('Payrolls', colName, colDef);
        console.log(`✅ Column ${colName} added successfully`);
      } else {
        console.log(`Column ${colName} already exists`);
      }
    }

    console.log('✅ Migration completed successfully');
  } catch (err) {
    console.error('Migration failed:', err.message);
    console.log('Trying alternative: sync with alter...');
    
    // Fallback: use sync alter
    const { Payroll } = require('../models');
    const { sequelize: seq } = require('../models');
    await seq.sync({ alter: true });
    console.log('✅ Sync with alter completed');
  } finally {
    await sequelize.close();
    process.exit(0);
  }
}

migrate().catch(err => {
  console.error('Fatal migration error:', err);
  process.exit(1);
});