// server.js - Backend สำหรับดาวน์โหลดวิดีโอ (Updated)
const express = require('express');
const cors = require('cors');
const youtubedl = require('youtube-dl-exec');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
require('dotenv').config();

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

// ฟังก์ชันแปลง Facebook share link เป็น direct link
async function convertFacebookShareLink(url) {
    try {
        // ถ้าเป็น share link
        if (url.includes('facebook.com/share/')) {
            console.log('กำลังแปลง Facebook share link...');

            // ลองดึง redirect URL
            try {
                const response = await axios.get(url, {
                    maxRedirects: 5,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    }
                });

                // ดึง URL จาก meta tag หรือ redirect
                const finalUrl = response.request.res.responseUrl || url;
                console.log('URL หลังแปลง:', finalUrl);
                return finalUrl;
            } catch (e) {
                console.log('ไม่สามารถ redirect ได้ ใช้ URL เดิม');
                return url;
            }
        }

        return url;
    } catch (error) {
        console.error('Error converting Facebook link:', error);
        return url;
    }
}

// ฟังก์ชันแปลง YouTube Shorts URL เป็น watch URL
function convertShortsUrl(url) {
    try {
        // ตรวจสอบว่าเป็น Shorts URL หรือไม่
        if (url.includes('/shorts/')) {
            // ดึง video ID จาก shorts URL
            const shortsMatch = url.match(/\/shorts\/([a-zA-Z0-9_-]+)/);
            if (shortsMatch && shortsMatch[1]) {
                const videoId = shortsMatch[1];
                const convertedUrl = `https://www.youtube.com/watch?v=${videoId}`;
                console.log('แปลง Shorts URL:', url, '->', convertedUrl);
                return convertedUrl;
            }
        }
        return url;
    } catch (error) {
        console.error('Error converting Shorts URL:', error);
        return url;
    }
}

// API endpoint สำหรับวิเคราะห์ด้วย Gemini
app.post('/api/analyze-gemini', async (req, res) => {
    const { videoUrl, videoInfo, prompt } = req.body;
    
    res.json({
        success: true,
        message: 'กรุณาใช้ Gemini โดยตรงที่ gemini.google.com'
    });
});

// API endpoint สำหรับดึงข้อมูลวิดีโอ
app.post('/api/video-info', async (req, res) => {
    let { url } = req.body;

    try {
        console.log('URL ต้นฉบับ:', url);

        // แปลง YouTube Shorts URL ถ้าจำเป็น
        if (url.includes('/shorts/')) {
            url = convertShortsUrl(url);
        }

        // แปลง Facebook share link ถ้าจำเป็น
        if (url.includes('facebook.com/share/')) {
            url = await convertFacebookShareLink(url);
        }
        
        // สร้าง options สำหรับ yt-dlp
        const options = {
            dumpSingleJson: true,
            noCheckCertificates: true,
            noWarnings: true,
            preferFreeFormats: true,
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        };

        // เพิ่ม options พิเศษสำหรับ YouTube
        if (url.includes('youtube.com') || url.includes('youtu.be')) {
            console.log('เพิ่ม options สำหรับ YouTube');
            // ใช้หลาย client เพื่อเพิ่มโอกาสสำเร็จ
            options.extractorArgs = 'youtube:player_client=android,ios,web';
            // ปิดการตรวจสอบที่ไม่จำเป็น
            options.noPlaylist = true;
            // เพิ่ม headers เพื่อหลีกเลี่ยง bot detection
            options.addHeader = [
                'Accept-Language:en-US,en;q=0.9',
                'Accept:text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Sec-Fetch-Mode:navigate'
            ];
        }

        // เพิ่ม options พิเศษสำหรับ Facebook
        if (url.includes('facebook.com')) {
            console.log('เพิ่ม options สำหรับ Facebook');
            options.format = 'best';
            options.noPlaylist = true;
            // ลองใช้ extractor args สำหรับ Facebook
            options.extractorArgs = 'facebook:player_url=https://www.facebook.com';
            // เพิ่ม headers เพิ่มเติม
            options.addHeader = [
                'referer:https://www.facebook.com/',
                'accept-language:en-US,en;q=0.9'
            ];
        }
        
        console.log('กำลังดึงข้อมูลด้วย options:', JSON.stringify(options, null, 2));
        
        // ดึงข้อมูลวิดีโอ
        const info = await youtubedl(url, options);

        // ตรวจสอบว่ามีข้อมูลหรือไม่
        if (!info) {
            throw new Error('ไม่สามารถดึงข้อมูลวิดีโอได้');
        }

        // ส่งข้อมูลกลับ
        res.json({
            success: true,
            data: {
                title: info.title || 'ไม่มีชื่อ',
                duration: info.duration || 0,
                thumbnail: info.thumbnail || '',
                platform: info.extractor || 'unknown',
                formats: info.formats ? info.formats.slice(0, 5) : [],
                actualUrl: url // ส่ง URL ที่แปลงแล้วกลับไปด้วย
            }
        });
        
    } catch (error) {
        console.error('Error details:', error.message);
        console.error('Full error:', error);
        
        // ให้คำแนะนำเฉพาะตามปัญหา
        let errorMessage = 'ไม่สามารถดึงข้อมูลวิดีโอได้';
        
        if (error.message.includes('Unsupported URL')) {
            errorMessage = 'URL นี้ไม่รองรับ หรืออาจเป็นวิดีโอส่วนตัว';
        } else if (error.message.includes('Video unavailable')) {
            errorMessage = 'วิดีโอนี้ไม่พร้อมใช้งาน อาจถูกลบหรือเป็นส่วนตัว';
        } else if (error.message.includes('429')) {
            errorMessage = 'ถูกจำกัดการเข้าถึง กรุณารอสักครู่แล้วลองใหม่';
        } else if (url.includes('facebook.com')) {
            errorMessage = 'ไม่สามารถดึงข้อมูลจาก Facebook ได้ วิดีโอนี้อาจเป็นส่วนตัวหรือต้องการการล็อกอิน\n\nวิธีแก้ไข:\n1. ตรวจสอบว่าวิดีโอเป็นสาธารณะ\n2. ลองคัดลอก URL ใหม่จากแถบที่อยู่ขณะเปิดวิดีโอ\n3. หากเป็นวิดีโอใน Page/Group ส่วนตัว จะไม่สามารถดาวน์โหลดได้';
        }
        
        res.status(500).json({
            success: false,
            error: errorMessage,
            details: error.message
        });
    }
});

// API endpoint สำหรับดาวน์โหลดวิดีโอ
app.post('/api/download', async (req, res) => {
    let { url, quality = 'best' } = req.body;

    try {
        console.log('กำลังดาวน์โหลด:', url);
        console.log('คุณภาพ:', quality);

        // แปลง YouTube Shorts URL ถ้าจำเป็น
        if (url.includes('/shorts/')) {
            url = convertShortsUrl(url);
        }

        // แปลง Facebook share link ถ้าจำเป็น
        if (url.includes('facebook.com/share/')) {
            url = await convertFacebookShareLink(url);
        }
        
        // กำหนดชื่อไฟล์
        const ext = quality === 'audio' ? 'mp3' : 'mp4';
        const filename = `video_${Date.now()}.${ext}`;
        const outputPath = path.join('downloads', filename);
        
        // สร้าง options สำหรับดาวน์โหลด
        const options = {
            output: outputPath,
            noCheckCertificates: true,
            noWarnings: true,
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        };

        // เพิ่ม options พิเศษสำหรับ YouTube
        if (url.includes('youtube.com') || url.includes('youtu.be')) {
            console.log('เพิ่ม options สำหรับ YouTube');
            // ใช้หลาย client เพื่อเพิ่มโอกาสสำเร็จ
            options.extractorArgs = 'youtube:player_client=android,ios,web';
            // ปิดการตรวจสอบที่ไม่จำเป็น
            options.noPlaylist = true;
            // เพิ่ม headers เพื่อหลีกเลี่ยง bot detection
            options.addHeader = [
                'Accept-Language:en-US,en;q=0.9',
                'Accept:text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Sec-Fetch-Mode:navigate'
            ];
        }
        
        // กำหนด format ตามคุณภาพที่เลือก
        if (quality === 'audio') {
            options.format = 'bestaudio[ext=m4a]/bestaudio/best';
            options.extractAudio = true;
            options.audioFormat = 'mp3';
            options.audioQuality = 0;
        } else {
            // สำหรับวิดีโอ
            if (url.includes('facebook.com')) {
                options.format = 'best[ext=mp4]/best';
            } else {
                options.format = 'best[ext=mp4]/best';
            }
        }
        
        // เพิ่ม option พิเศษสำหรับ Facebook
        if (url.includes('facebook.com')) {
            options.noPlaylist = true;
            options.extractorArgs = 'facebook:player_url=https://www.facebook.com';
            // เพิ่ม headers เพิ่มเติม
            options.addHeader = [
                'referer:https://www.facebook.com/',
                'accept-language:en-US,en;q=0.9'
            ];
        }
        
        console.log('Download options:', JSON.stringify(options, null, 2));
        
        // ดาวน์โหลดวิดีโอ
        await youtubedl(url, options);

        // ตรวจสอบว่าไฟล์ถูกสร้างหรือไม่
        if (!fs.existsSync(outputPath)) {
            throw new Error('ไม่สามารถสร้างไฟล์ได้');
        }

        // ส่งไฟล์กลับ
        res.download(outputPath, (err) => {
            if (err) {
                console.error('Error sending file:', err);
                if (!res.headersSent) {
                    res.status(500).json({
                        success: false,
                        error: 'ไม่สามารถส่งไฟล์ได้'
                    });
                }
            }
            
            // ลบไฟล์หลังส่งเสร็จ
            setTimeout(() => {
                fs.unlink(outputPath, (err) => {
                    if (err) console.error('Error deleting file:', err);
                });
            }, 60000); // ลบหลัง 1 นาที
        });
        
    } catch (error) {
        console.error('Download error:', error.message);
        console.error('Full error:', error);
        
        // ให้คำแนะนำเฉพาะตามปัญหา
        let errorMessage = 'ไม่สามารถดาวน์โหลดวิดีโอได้';
        
        if (error.message.includes('ERROR: Unsupported URL')) {
            errorMessage = 'URL นี้ไม่รองรับ ลองคัดลอก URL ใหม่จากแถบที่อยู่ของเบราว์เซอร์';
        } else if (error.message.includes('ERROR: Video unavailable')) {
            errorMessage = 'วิดีโอนี้ไม่พร้อมใช้งาน อาจเป็นวิดีโอส่วนตัวหรือถูกลบ';
        } else if (error.message.includes('ERROR: Private video')) {
            errorMessage = 'วิดีโอนี้เป็นส่วนตัว ไม่สามารถดาวน์โหลดได้';
        } else if (error.message.includes('format')) {
            errorMessage = 'ไม่พบรูปแบบวิดีโอที่ต้องการ ลองเลือกคุณภาพอื่น';
        }
        
        res.status(500).json({
            success: false,
            error: errorMessage,
            details: error.message
        });
    }
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        message: 'Server is running!',
        ytdlpVersion: 'latest',
        supportedPlatforms: ['YouTube', 'YouTube Shorts', 'Facebook', 'TikTok', 'Instagram', 'Twitter/X']
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log('📺 รองรับ: YouTube, YouTube Shorts, Facebook, TikTok, Instagram, Twitter');
    console.log('💡 Tip: สำหรับ Facebook ควรใช้ URL จากแถบที่อยู่ของเบราว์เซอร์');
});