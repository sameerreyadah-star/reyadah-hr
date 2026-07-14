const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const config = require('../config/config');
const asyncHandler = require('../utils/asyncHandler');
const { Employee } = require('../models');

router.post('/login', asyncHandler(async (req, res) => {
  const { employeeId, password } = req.body;
  if (!employeeId || !password) return res.status(400).json({ error: 'employeeId and password required' });
  const user = await Employee.findOne({ where: { employeeId } });
  if (!user) return res.status(401).json({ error: 'invalid credentials' });
  const ok = await bcrypt.compare(password, user.passwordHash || '');
  if (!ok) return res.status(401).json({ error: 'invalid credentials' });
  const token = jwt.sign({ id: user.id, employeeId: user.employeeId, role: user.role }, config.jwtSecret, { expiresIn: '8h' });
  res.json({ token });
}));

module.exports = router;
