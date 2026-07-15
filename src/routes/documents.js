const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const auth = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const { Employee } = require('../models');
const cloudinaryUpload = require('../services/cloudinaryUpload');

// Use memory storage so we can upload the buffer to Cloudinary
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB limit for documents
});

router.post('/upload', auth, upload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'file required' });
  const emp = req.user;
  const { docType, description, issueDate, expiryDate } = req.body;

  // Determine resource type based on file mimetype
  const isImage = req.file.mimetype.startsWith('image/');
  const resourceType = isImage ? 'image' : 'raw';

  // Upload to Cloudinary
  const cloudResult = await cloudinaryUpload.uploadBuffer(req.file.buffer, {
    folder: `reyadah/documents/${emp.employeeId}`,
    publicId: `${Date.now()}_${req.file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_')}`,
    resourceType,
  });

  // Create a NEW array to ensure Sequelize detects the change (JSON field)
  const docs = [...(emp.documents || [])];
  const entry = {
    id: Date.now(),
    filename: req.file.originalname,
    originalname: req.file.originalname,
    size: cloudResult.bytes,
    url: cloudResult.secureUrl,
    publicId: cloudResult.publicId,
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
