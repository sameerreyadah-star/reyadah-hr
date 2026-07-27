const fs = require('fs');

// 1. Register route in src/index.js
let idx = fs.readFileSync('src/index.js', 'utf8');
if (!idx.includes("require('./routes/outlets')")) {
  idx = idx.replace(
    "const roleRoutes = require('./routes/roles');",
    "const roleRoutes = require('./routes/roles');\nconst outletRoutes = require('./routes/outlets');"
  );
  idx = idx.replace(
    "app.use('/api/roles', roleRoutes);",
    "app.use('/api/roles', roleRoutes);\napp.use('/api/outlets', outletRoutes);"
  );
  fs.writeFileSync('src/index.js', idx);
  console.log('Registered outlets route');
}

// 2. Include outlet in auth profile
let authJs = fs.readFileSync('src/routes/auth.js', 'utf8');
if (!authJs.includes("outlet:")) {
  authJs = authJs.replace(
    "const user = {",
    "const user = {\n    outlet: employee.outlet,"
  );
  fs.writeFileSync('src/routes/auth.js', authJs);
  console.log('Added outlet to auth profile');
}

console.log('Done');