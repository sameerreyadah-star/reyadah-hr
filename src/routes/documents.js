const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const auth = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const { Employee } = require('../models');

const UPLOAD_ROOT = path.join(__dirname, '..', '..', 'uploads');
if (!fs.existsSync(UPLOAD_ROOT)) fs.mkdirSync(UPLOAD_ROOT, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const empId = req.user.employeeId;
    const dir = path.join(UPLOAD_ROOT, empId);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ts = Date.now();
    const safe = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    cb(null, `${ts}_${safe}`);
  }
});

const upload = multer({ storage });

router.post('/upload', auth, upload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'file required' });
  const emp = req.user;
  const { docType, description, issueDate, expiryDate } = req.body;
  const docs = emp.documents || [];
  const entry = {
    id: Date.now(),
    filename: req.file.filename,
    originalname: req.file.originalname,
    size: req.file.size,
    url: `/uploads/${emp.employeeId}/${req.file.filename}`,
    uploadedAt: new Date(),
    docType: docType || 'General',
    description: description || '',
    issueDate: issueDate ? new Date(issueDate) : null,
    expiryDate: expiryDate ? new Date(expiryDate) : null,
  };
  docs.push(entry);
  await emp.update({ documents: docs });
  res.json(entry);
}));

router.get('/me', auth, asyncHandler(async (req, res) => {
  const emp = req.user;
  res.json(emp.documents || []);
}));

module.exports = router;
