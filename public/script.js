// script.js - จัดการการทำงานฝั่ง Frontend

// เก็บ URL ปัจจุบัน
let currentVideoUrl = '';

// DOM Elements
const urlInput = document.getElementById('urlInput');
const checkBtn = document.getElementById('checkBtn');
const status = document.getElementById('status');
const videoInfo = document.getElementById('videoInfo');
const loader = document.getElementById('loader');

// Event Listeners
checkBtn.addEventListener('click', checkVideo);
urlInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') checkVideo();
});

// ฟังก์ชันตรวจสอบวิดีโอ
async function checkVideo() {
    const url = urlInput.value.trim();
    
    // ตรวจสอบ URL
    if (!url) {
        showStatus('กรุณาใส่ URL วิดีโอ', 'error');
        return;
    }
    
    if (!isValidUrl(url)) {
        showStatus('URL ไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง', 'error');
        return;
    }
    
    // เก็บ URL
    currentVideoUrl = url;
    
    // แสดง loader
    showLoader(true);
    hideStatus();
    hideVideoInfo();
    
    try {
        // เรียก API เพื่อดึงข้อมูลวิดีโอ
        const response = await fetch('/api/video-info', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ url })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showVideoInfo(result.data);
            showStatus('พบวิดีโอแล้ว! เลือกคุณภาพที่ต้องการดาวน์โหลด', 'success');
        } else {
            let errorMessage = result.error || 'ไม่สามารถดึงข้อมูลวิดีโอได้';
            // เพิ่มคำแนะนำสำหรับ Facebook
            if (url.includes('facebook.com') && result.details) {
                errorMessage += '\n\nคำแนะนำ: ลองใช้ URL จากแถบที่อยู่ของเบราว์เซอร์ขณะเปิดวิดีโอ หรือวิดีโอนี้อาจเป็นส่วนตัว';
            }
            showStatus(errorMessage, 'error');
        }
        
    } catch (error) {
        console.error('Error:', error);
        showStatus('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง', 'error');
    } finally {
        showLoader(false);
    }
}

// แสดงข้อมูลวิดีโอ
function showVideoInfo(data) {
    // ใส่ข้อมูล
    document.getElementById('thumbnail').src = data.thumbnail || 'https://via.placeholder.com/200x120?text=No+Thumbnail';
    document.getElementById('videoTitle').textContent = data.title;
    document.getElementById('platform').textContent = data.platform;
    document.getElementById('duration').textContent = formatDuration(data.duration);
    
    // แสดงส่วนข้อมูล
    videoInfo.classList.remove('hidden');
    
    // เพิ่ม event listeners สำหรับปุ่มดาวน์โหลด
    const downloadBtns = document.querySelectorAll('.btn-download');
    downloadBtns.forEach(btn => {
        btn.onclick = () => downloadVideo(btn.dataset.quality);
    });
}

// ฟังก์ชันดาวน์โหลดวิดีโอ
async function downloadVideo(quality) {
    if (!currentVideoUrl) {
        showStatus('กรุณาตรวจสอบวิดีโอก่อนดาวน์โหลด', 'error');
        return;
    }
    
    showLoader(true);
    showStatus('กำลังเตรียมดาวน์โหลด... อาจใช้เวลาสักครู่', 'success');
    
    try {
        const response = await fetch('/api/download', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                url: currentVideoUrl,
                quality: quality
            })
        });
        
        if (response.ok) {
            // สร้าง blob จาก response
            const blob = await response.blob();
            
            // สร้าง download link
            const downloadUrl = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = downloadUrl;
            a.download = `video_${Date.now()}.${quality === 'audio' ? 'mp3' : 'mp4'}`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(downloadUrl);
            
            showStatus('ดาวน์โหลดสำเร็จ! ✅', 'success');
        } else {
            const error = await response.json();
            showStatus(error.error || 'ไม่สามารถดาวน์โหลดได้', 'error');
        }
        
    } catch (error) {
        console.error('Download error:', error);
        showStatus('เกิดข้อผิดพลาดในการดาวน์โหลด', 'error');
    } finally {
        showLoader(false);
    }
}

// ฟังก์ชันตรวจสอบ URL
function isValidUrl(string) {
    try {
        const url = new URL(string);
        // ตรวจสอบว่าเป็น URL จากแพลตฟอร์มที่รองรับ
        const supportedDomains = [
            'youtube.com', 'youtu.be',
            'tiktok.com',
            'facebook.com', 'fb.watch',
            'instagram.com',
            'twitter.com', 'x.com'
        ];
        
        return supportedDomains.some(domain => url.hostname.includes(domain));
    } catch (_) {
        return false;
    }
}

// ฟังก์ชันแปลงเวลา
function formatDuration(seconds) {
    if (!seconds) return 'ไม่ทราบ';
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

// ฟังก์ชันแสดง/ซ่อนต่างๆ
function showStatus(message, type) {
    status.textContent = message;
    status.className = `status ${type}`;
    status.classList.remove('hidden');
}

function hideStatus() {
    status.classList.add('hidden');
}

function showLoader(show) {
    if (show) {
        loader.classList.remove('hidden');
    } else {
        loader.classList.add('hidden');
    }
}

function hideVideoInfo() {
    videoInfo.classList.add('hidden');
}

// ตรวจสอบ server status เมื่อโหลดหน้า
window.addEventListener('load', async () => {
    try {
        const response = await fetch('/api/health');
        const data = await response.json();
        console.log('Server status:', data);
    } catch (error) {
        console.error('Server connection error:', error);
        showStatus('ไม่สามารถเชื่อมต่อกับ server ได้', 'error');
    }
});