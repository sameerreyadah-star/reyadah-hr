# Attendance System Prototype

Minimal Node.js + Express prototype for an HR/attendance system. Uses Sequelize with SQLite for development (Postgres-ready).

Quick start

1. Install dependencies:

```bash
npm install
```

2. Seed sample data:

```bash
npm run seed
```

3. Start server:

```bash
npm start
```

4. Open `public/index.html` in the browser via `http://localhost:3000`.

Credentials: employeeId `E001`, password `password`.

To use Postgres, set `DATABASE_URL` environment variable (Sequelize connection string).
