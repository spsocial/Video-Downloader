// server.js - Backend สำหรับดาวน์โหลดวิดีโอ
const express = require('express');
const cors = require('cors');
const youtubedl = require('youtube-dl-exec');
const path = require('path');
const fs = require('fs');
require('dotenv').config();
const { GoogleGenerativeAI } = require("@google/generative-ai");
// ใน server.js ให้ comment หรือลบบรรทัดนี้ออก
// const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// สร้างโฟลเดอร์ downloads ถ้ายังไม่มี
if (!fs.existsSync('downloads')) {
    fs.mkdirSync('downloads');
}

// API endpoint สำหรับวิเคราะห์ด้วย Gemini

// เพิ่ม endpoint ใหม่ (ถ้าต้องการ)
app.post('/api/analyze-gemini', async (req, res) => {
    const { videoUrl, videoInfo, prompt } = req.body;
    
    try {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        
        const fullPrompt = `
        วิเคราะห์วิดีโอ: ${videoUrl}
        ชื่อ: ${videoInfo.title}
        ความยาว: ${videoInfo.duration} วินาที
        
        ${prompt}
        `;
        
        const result = await model.generateContent(fullPrompt);
        const response = await result.response;
        
        res.json({
            success: true,
            analysis: response.text()
        });
        
    } catch (error) {
        console.error('Gemini error:', error);
        res.status(500).json({
            success: false,
            error: 'ไม่สามารถวิเคราะห์ได้'
        });
    }
});

// API endpoint สำหรับดึงข้อมูลวิดีโอ
app.post('/api/video-info', async (req, res) => {
    const { url } = req.body;
    
    try {
        console.log('กำลังดึงข้อมูลจาก:', url);
        
        // สร้าง options สำหรับ youtube-dl
        const options = {
            dumpSingleJson: true,
            noCheckCertificates: true,
            noWarnings: true,
            preferFreeFormats: true,
            addHeader: [
                'referer:youtube.com',
                'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            ]
        };
        
        // ถ้าเป็น YouTube Shorts เพิ่ม option พิเศษ
        if (url.includes('/shorts/')) {
            options.format = 'best[height<=1080]';
            console.log('ตรวจพบ YouTube Shorts');
        }
        
        // ดึงข้อมูลวิดีโอ (ไม่ดาวน์โหลด)
        const info = await youtubedl(url, options);

        // ส่งข้อมูลกลับ
        res.json({
            success: true,
            data: {
                title: info.title || 'ไม่มีชื่อ',
                duration: info.duration || 0,
                thumbnail: info.thumbnail || '',
                platform: info.extractor || 'unknown',
                formats: info.formats ? info.formats.slice(0, 5) : []
            }
        });
        
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({
            success: false,
            error: 'ไม่สามารถดึงข้อมูลวิดีโอได้ กรุณาตรวจสอบ URL'
        });
    }
});

// API endpoint สำหรับดาวน์โหลดวิดีโอ
app.post('/api/download', async (req, res) => {
    const { url, quality = 'best' } = req.body;
    
    try {
        console.log('กำลังดาวน์โหลด:', url);
        
        // กำหนดชื่อไฟล์
        const filename = `video_${Date.now()}.mp4`;
        const outputPath = path.join('downloads', filename);
        
        // สร้าง options สำหรับดาวน์โหลด
        const options = {
            output: outputPath,
            format: quality === 'audio' ? 'bestaudio[ext=m4a]/best' : 'best[ext=mp4]/best',
            noCheckCertificates: true,
            noWarnings: true,
            addHeader: [
                'referer:youtube.com',
                'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            ]
        };
        
        // ถ้าเป็น YouTube Shorts
        if (url.includes('/shorts/')) {
            options.format = quality === 'audio' ? 'bestaudio[ext=m4a]/best' : 'best[height<=1080]/best';
        }
        
        // ดาวน์โหลดวิดีโอ
        await youtubedl(url, options);

        // ส่งไฟล์กลับ
        res.download(outputPath, (err) => {
            if (err) {
                console.error('Error sending file:', err);
            }
            // ลบไฟล์หลังส่งเสร็จ (optional)
            setTimeout(() => {
                fs.unlink(outputPath, (err) => {
                    if (err) console.error('Error deleting file:', err);
                });
            }, 60000); // ลบหลัง 1 นาที
        });
        
    } catch (error) {
        console.error('Download error:', error);
        res.status(500).json({
            success: false,
            error: 'ไม่สามารถดาวน์โหลดวิดีโอได้'
        });
    }
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', message: 'Server is running!' });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});