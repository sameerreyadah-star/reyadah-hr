const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const { Role } = require('../models');

// GET /api/roles - List all roles
router.get('/', auth, asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'forbidden' });
  const roles = await Role.findAll({ order: [['name', 'ASC']] });
  res.json(roles);
}));

// POST /api/roles - Create a new role
router.post('/', auth, asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'forbidden' });
  const { name, label, description } = req.body;
  if (!name || !label) return res.status(400).json({ error: 'name and label are required' });
  
  const existing = await Role.findOne({ where: { name } });
  if (existing) return res.status(409).json({ error: 'Role already exists' });
  
  const role = await Role.create({ name, label, description, permissions: [], isActive: true });
  res.status(201).json(role);
}));

// PUT /api/roles/:id - Update a role
router.put('/:id', auth, asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'forbidden' });
  const role = await Role.findByPk(req.params.id);
  if (!role) return res.status(404).json({ error: 'Role not found' });
  
  const { name, label, description, isActive } = req.body;
  if (name !== undefined) role.name = name;
  if (label !== undefined) role.label = label;
  if (description !== undefined) role.description = description;
  if (isActive !== undefined) role.isActive = isActive;
  await role.save();
  res.json(role);
}));

// DELETE /api/roles/:id - Delete a role
router.delete('/:id', auth, asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'forbidden' });
  const role = await Role.findByPk(req.params.id);
  if (!role) return res.status(404).json({ error: 'Role not found' });
  // Prevent deleting core roles
  if (['admin', 'company-manager', 'restaurant-manager', 'employee'].includes(role.name)) {
    return res.status(400).json({ error: 'Cannot delete core system roles' });
  }
  await role.destroy();
  res.json({ message: 'Role deleted successfully' });
}));

module.exports = router;