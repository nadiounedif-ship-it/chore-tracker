import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { authenticate } from '../middleware/auth.js';

export const uploadRouter = Router();

// Ensure local uploads directory exists
const uploadsDir = path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed.'));
    }
  },
});

/**
 * POST /api/upload
 */
uploadRouter.post('/', authenticate, upload.single('photo'), (req: Request, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No image file uploaded.' });
  }

  // URL path accessible via Express static
  const fileUrl = `/uploads/${req.file.filename}`;
  return res.json({
    message: 'File uploaded successfully.',
    url: fileUrl,
    filename: req.file.filename,
    size: req.file.size,
  });
});
