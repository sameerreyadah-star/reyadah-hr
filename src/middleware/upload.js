const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure selfies directory exists
const selfiesDir = path.join(__dirname, '..', '..', 'uploads', 'selfies');
if (!fs.existsSync(selfiesDir)) {
  fs.mkdirSync(selfiesDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, selfiesDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `selfie_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${path.extname(file.originalname) || '.jpg'}`;
    cb(null, uniqueName);
  },
});

const fileFilter = (req, file, cb) => {
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only image files (JPEG, PNG, WebP) are allowed'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
});

module.exports = upload;