module.exports = {
  jwtSecret: process.env.JWT_SECRET || 'change_this_secret',
  databaseUrl: process.env.DATABASE_URL || null,
};
