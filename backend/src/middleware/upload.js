'use strict';

const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { env } = require('../config/env');
const { AppError } = require('./errorHandler');

// Allowed MIME types declared by client
const ALLOWED_MIME = new Set([
  'image/jpeg', 'image/jpg', 'image/png', 'image/webp',
  'image/gif', 'image/heic', 'image/heif',
]);

/**
 * Validate actual file content via magic bytes — prevents MIME spoofing.
 * HEIC/HEIF use ISO Base Media File Format (ftyp box) — magic bytes vary by
 * brand ('heic', 'heix', 'mif1', 'msf1') so we check the ftyp box signature
 * at offset 4 and accept any brand starting with 'he' or 'mif'.
 */
const hasValidMagicBytes = (buffer) => {
  if (!buffer || buffer.length < 4) return false;
  const [b0, b1, b2, b3] = buffer;

  const isJpeg = b0 === 0xff && b1 === 0xd8 && b2 === 0xff;
  const isPng  = b0 === 0x89 && b1 === 0x50 && b2 === 0x4e && b3 === 0x47;
  const isGif  = b0 === 0x47 && b1 === 0x49 && b2 === 0x46;
  // WebP: "RIFF" header at 0-3, "WEBP" at 8-11 — buffer check needs at least 12 bytes
  const isWebp = buffer.length >= 12 &&
    b0 === 0x52 && b1 === 0x49 && b2 === 0x46 && b3 === 0x46 &&
    buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50;
  // HEIC/HEIF: ISO BMFF — bytes 4-7 are 'ftyp', brand at 8-11 starts with 'he' or is 'mif1'
  const isHeic = buffer.length >= 12 &&
    buffer[4] === 0x66 && buffer[5] === 0x74 && buffer[6] === 0x79 && buffer[7] === 0x70 &&
    (
      (buffer[8] === 0x68 && buffer[9] === 0x65) || // 'he...' brand (heic, heix, hevc)
      (buffer[8] === 0x6d && buffer[9] === 0x69 && buffer[10] === 0x66) // 'mif1'
    );

  return isJpeg || isPng || isGif || isWebp || isHeic;
};

/** multer storage: memory storage so we can inspect buffer before writing to disk */
const memoryStorage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  if (!ALLOWED_MIME.has(file.mimetype)) {
    return cb(new AppError(400, 'INVALID_FILE_TYPE', 'Only JPEG, PNG, WebP, GIF, and HEIC images are allowed'));
  }
  cb(null, true);
};

/**
 * Build a multer instance configured for image uploads.
 * Uses memory storage so the magic bytes check runs before disk write.
 * Call req.saveUploadedFiles() after multer to flush to disk.
 *
 * @param {object} opts
 * @param {number} opts.maxCount  — max number of files (default 1)
 * @param {string} opts.field     — multipart field name (default 'image')
 */
const makeUpload = ({ maxCount = 1, field = 'image' } = {}) => {
  const upload = multer({
    storage: memoryStorage,
    limits: { fileSize: env.MAX_UPLOAD_SIZE, files: maxCount },
    fileFilter,
  });

  const multerMiddleware = maxCount === 1
    ? upload.single(field)
    : upload.array(field, maxCount);

  // After multer processes files they're in memory; this middleware validates
  // magic bytes and writes them to the target directory.
  const validateAndSave = (destDir) => async (req, res, next) => {
    const fs = require('fs');
    const files = req.files ?? (req.file ? [req.file] : []);

    if (files.length === 0) return next();

    try {
      fs.mkdirSync(destDir, { recursive: true });

      for (const file of files) {
        if (!hasValidMagicBytes(file.buffer)) {
          return next(new AppError(400, 'INVALID_FILE_CONTENT', 'File content does not match a supported image format'));
        }
        const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
        const filename = `${uuidv4()}${ext}`;
        const filepath = path.join(destDir, filename);
        fs.writeFileSync(filepath, file.buffer);
        file.savedPath = filepath;
        file.savedFilename = filename;
      }
      next();
    } catch (err) {
      next(err);
    }
  };

  return { multerMiddleware, validateAndSave };
};

module.exports = { makeUpload };
