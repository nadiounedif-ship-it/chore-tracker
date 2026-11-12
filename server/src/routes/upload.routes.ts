import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { authenticate } from '../middleware/auth.js';
import { v2 as cloudinary } from 'cloudinary';
import { config } from '../config.js';

export const uploadRouter = Router();

// Ensure local uploads directory exists
const uploadsDir = path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const cloudinaryEnabled = Boolean(config.cloudinary.cloudName && config.cloudinary.apiKey && config.cloudinary.apiSecret);
if (cloudinaryEnabled) cloudinary.config({ cloud_name: config.cloudinary.cloudName, api_key: config.cloudinary.apiKey, api_secret: config.cloudinary.apiSecret, secure: true });

const localStorage = multer.diskStorage({
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
  storage: cloudinaryEnabled ? multer.memoryStorage() : localStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (_req, file, cb) => {
    if (['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'].includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed.'));
    }
  },
});

/**
 * POST /api/upload
 */
uploadRouter.post('/', authenticate, upload.single('photo'), async (req: Request, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No image file uploaded.' });
  }

  let fileUrl: string;
  if (cloudinaryEnabled && req.file.buffer) {
    try {
      const result: any = await new Promise((resolve, reject) => {
        cloudinary.uploader.upload_stream({ folder: 'chore-manager', resource_type: 'image' }, (error, uploaded) => error ? reject(error) : resolve(uploaded)).end(req.file!.buffer);
      });
      fileUrl = result.secure_url;
    } catch (error) {
      console.error('[Upload] Cloudinary upload failed:', error instanceof Error ? error.message : 'unknown error');
      return res.status(502).json({ error: 'Photo storage is temporarily unavailable. Please try again.' });
    }
  } else {
    fileUrl = `/uploads/${req.file.filename}`;
  }
  return res.json({
    message: 'File uploaded successfully.',
    url: fileUrl,
    filename: req.file.filename || req.file.originalname,
    size: req.file.size,
  });
});
