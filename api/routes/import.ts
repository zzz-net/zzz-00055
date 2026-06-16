import { Router, Request } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { importPoints, importDefects, importRectification } from '../services/importService.js';
import { importFullData } from '../services/fullDataImportService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const uploadDir = path.join(__dirname, '../../data/uploads');
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  },
});

const upload = multer({ storage });

const router = Router();

router.post('/points', upload.single('file'), async (req: Request & { file?: Express.Multer.File }, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: '请上传CSV文件' });
    }
    
    const result = await importPoints(req.file.path, req.file.originalname);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/defects', upload.single('file'), async (req: Request & { file?: Express.Multer.File }, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: '请上传JSON文件' });
    }
    
    const result = await importDefects(req.file.path, req.file.originalname);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/rectification', upload.single('file'), async (req: Request & { file?: Express.Multer.File }, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: '请上传CSV文件' });
    }
    
    const result = await importRectification(req.file.path, req.file.originalname);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/full', upload.single('file'), async (req: Request & { file?: Express.Multer.File }, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: '请上传完整数据JSON文件' });
    }

    const fileContent = fs.readFileSync(req.file.path, 'utf-8');
    fs.promises.unlink(req.file.path).catch(() => {});

    let data: any;
    try {
      data = JSON.parse(fileContent);
    } catch {
      return res.status(400).json({ success: false, message: 'JSON 格式无效' });
    }

    const result = await importFullData(data);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
