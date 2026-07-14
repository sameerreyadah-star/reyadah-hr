const jwt = require('jsonwebtoken');
const config = require('../config/config');
const { Employee } = require('../models');

async function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: 'missing token' });
  const token = header.replace('Bearer ', '');
  try {
    const data = jwt.verify(token, config.jwtSecret);
    const user = await Employee.findByPk(data.id);
    if (!user) return res.status(401).json({ error: 'invalid token' });
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'invalid token' });
  }
}

module.exports = auth;
