// server.js
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 8080;

const DATA_DIR = path.join(__dirname, 'data');
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');

// 确保基础目录存在
[DATA_DIR, BACKUPS_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// 配置 multer 存储，动态目录：backups/<backupName>/images
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const backupName = req.body.backupName || 'default_backup';
        const dir = path.join(BACKUPS_DIR, backupName, 'images');
        fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
        cb(null, originalName);
    }
});
const upload = multer({ 
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }
});

app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));

// 日志
app.use((req, res, next) => {
    console.log(`[${new Date().toLocaleString()}] ${req.method} ${req.url}`);
    next();
});

// ---------- 原有接口保留（兼容）----------
app.get('/api/health', (req, res) => {
    res.json({ code: 0, message: '服务正常', timestamp: new Date().toLocaleString() });
});

// ---------- 新上传接口 ----------
app.post('/api/upload', (req, res) => {
    try {
        const { backupName, goodsList, categories } = req.body;
        if (!backupName || !goodsList || !Array.isArray(goodsList)) {
            return res.status(400).json({ code: 1, message: '缺少 backupName 或 goodsList' });
        }
        
        // 创建备份目录
        const backupDir = path.join(BACKUPS_DIR, backupName);
        fs.mkdirSync(backupDir, { recursive: true });
        const jsonFile = path.join(backupDir, 'backup.json');
        
        const saveData = {
            backupName,
            goodsList,
            categories: categories || [],
            serverReceivedTime: new Date().toLocaleString()
        };
        fs.writeFileSync(jsonFile, JSON.stringify(saveData, null, 2));
        
        console.log(`[上传成功] 备份名: ${backupName}, 商品数: ${goodsList.length}`);
        res.json({ code: 0, message: '上传成功', data: { backupName, count: goodsList.length } });
    } catch (error) {
        console.error('上传失败:', error);
        res.status(500).json({ code: 1, message: '服务器错误：' + error.message });
    }
});

// ---------- 图片上传 ----------
app.post('/api/upload/image', upload.single('file'), (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ code: 1, message: '没有收到图片文件' });
        console.log(`[图片上传] 备份: ${req.body.backupName}, 文件: ${req.file.filename}`);
        res.json({ code: 0, message: '图片上传成功', data: { filename: req.file.filename } });
    } catch (error) {
        res.status(500).json({ code: 1, message: '图片上传失败' });
    }
});

// ---------- 获取备份列表 ----------
app.get('/api/backups', (req, res) => {
    try {
        if (!fs.existsSync(BACKUPS_DIR)) return res.json({ code: 0, data: [] });
        const dirs = fs.readdirSync(BACKUPS_DIR, { withFileTypes: true })
            .filter(d => d.isDirectory())
            .map(d => {
                const jsonPath = path.join(BACKUPS_DIR, d.name, 'backup.json');
                let info = { name: d.name, count: 0, time: '' };
                if (fs.existsSync(jsonPath)) {
                    try {
                        const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
                        info.count = data.goodsList?.length || 0;
                        info.time = data.serverReceivedTime || '';
                    } catch (e) {}
                }
                return info;
            });
        res.json({ code: 0, data: dirs });
    } catch (error) {
        res.status(500).json({ code: 1, message: '读取列表失败' });
    }
});

// ---------- 下载指定备份 ----------
app.get('/api/download', (req, res) => {
    const backupName = req.query.name;
    if (!backupName) return res.status(400).json({ code: 1, message: '缺少备份名' });
    try {
        const jsonPath = path.join(BACKUPS_DIR, backupName, 'backup.json');
        if (!fs.existsSync(jsonPath)) return res.status(404).json({ code: 1, message: '备份不存在' });
        const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
        res.json({
            code: 0,
            message: '下载成功',
            data: {
                goodsList: data.goodsList || [],
                categories: data.categories || [],
                backupTime: data.serverReceivedTime || ''
            }
        });
    } catch (error) {
        res.status(500).json({ code: 1, message: '服务器错误' });
    }
});

// ---------- 删除备份 ----------
app.post('/api/delbackup', (req, res) => {
    const backupName = req.body.name;
    if (!backupName) return res.status(400).json({ code: 1, message: '缺少备份名' });
    try {
        const backupDir = path.join(BACKUPS_DIR, backupName);
        if (fs.existsSync(backupDir)) {
            fs.rmSync(backupDir, { recursive: true, force: true });
            console.log(`[删除备份] ${backupName}`);
            res.json({ code: 0, message: '删除成功' });
        } else {
            res.status(404).json({ code: 1, message: '备份不存在' });
        }
    } catch (error) {
        res.status(500).json({ code: 1, message: '删除失败' });
    }
});

// ---------- 静态图片访问 ----------
app.use('/api/images', express.static(BACKUPS_DIR));

// 启动
app.listen(PORT, '0.0.0.0', () => {
    console.log(`========================================`);
    console.log(`商品备份服务已启动（多备份版）`);
    console.log(`端口: ${PORT}`);
    console.log(`备份目录: ${BACKUPS_DIR}`);
    console.log(`========================================`);
});