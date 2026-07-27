const fs = require('fs');
let c = fs.readFileSync('src/routes/employees.js', 'utf8');

// Fix canViewTeam to also allow custom roles (any role that's not 'employee')
c = c.replace(
  "return TEAM_VIEW_ROLES.includes(role);",
  "return TEAM_VIEW_ROLES.includes(role) || (role && role !== 'employee');"
);

fs.writeFileSync('src/routes/employees.js', c);
console.log('Fixed canViewTeam to allow custom roles');