/**
 * CLEJS - Generic Camera Subsystem
 * Supports any USB Webcam (auto-enumeration), Open Wi-Fi/IP Camera (MJPEG/HTTP),
 * Optical Crosshair / Reticle Overlay (Digital Edge Finder), and Viewport Docking
 */

export class CLECameraEngine {
  constructor(bridge) {
    this.bridge = bridge;
    this.activeType = 'none'; // 'usb' | 'wifi' | 'none'
    this.stream = null;
    this.selectedDeviceId = localStorage.getItem('cle.cam.deviceId') || '';
    this.wifiUrl = localStorage.getItem('cle.cam.wifiUrl') || 'http://192.168.1.150:8080/video';
    this.reticleMode = 'crosshair'; // 'none' | 'crosshair' | 'bullseye' | 'grid'
    this.reticleColor = '#00ff66';   // High-contrast green
    this.cameraOffset = { X: 0.0, Y: 0.0 }; // Offset from camera center to spindle/laser center (mm)
    this.docked = false; // Viewport corner dock toggle
  }

  // Enumerate all available USB video inputs on the system
  async getAvailableDevices() {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return [];
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter(d => d.kind === 'videoinput');
    } catch (e) {
      console.warn('[CLE Camera] Device enumeration error:', e);
      return [];
    }
  }

  // Start USB Webcam with auto-selection or selected deviceId
  async startUSBCamera(deviceId = this.selectedDeviceId) {
    this.stopCamera();
    try {
      const constraints = {
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 }
        }
      };

      if (deviceId) {
        constraints.video.deviceId = { exact: deviceId };
      }

      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.selectedDeviceId = deviceId;
      localStorage.setItem('cle.cam.deviceId', deviceId);
      this.activeType = 'usb';

      const videoEl = document.getElementById('cle-cam-video');
      const imgEl = document.getElementById('cle-cam-img');
      const placeholder = document.getElementById('cle-cam-placeholder');

      if (videoEl) {
        videoEl.srcObject = this.stream;
        videoEl.style.display = 'block';
      }
      if (imgEl) imgEl.style.display = 'none';
      if (placeholder) placeholder.style.display = 'none';

      this.updateReticleCanvas();
      this.bridge.notify('USB Camera started (720p @ 30 FPS)', 'ok');
      return true;
    } catch (err) {
      console.error('[CLE Camera] Start USB cam error:', err);
      this.bridge.notify(`Could not open camera: ${err.message}`, 'error');
      return false;
    }
  }

  // Start Open Wi-Fi / IP Camera (MJPEG / HTTP stream)
  startWiFiCamera(url = this.wifiUrl) {
    this.stopCamera();
    this.wifiUrl = url;
    localStorage.setItem('cle.cam.wifiUrl', url);
    this.activeType = 'wifi';

    const videoEl = document.getElementById('cle-cam-video');
    const imgEl = document.getElementById('cle-cam-img');
    const placeholder = document.getElementById('cle-cam-placeholder');

    if (videoEl) {
      videoEl.style.display = 'none';
      videoEl.srcObject = null;
    }
    if (imgEl) {
      imgEl.src = url;
      imgEl.style.display = 'block';
    }
    if (placeholder) placeholder.style.display = 'none';

    this.updateReticleCanvas();
    this.bridge.notify(`Connecting to Wi-Fi camera at ${url}...`, 'ok');
  }

  stopCamera() {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    const videoEl = document.getElementById('cle-cam-video');
    const imgEl = document.getElementById('cle-cam-img');
    const placeholder = document.getElementById('cle-cam-placeholder');

    if (videoEl) {
      videoEl.style.display = 'none';
      videoEl.srcObject = null;
    }
    if (imgEl) {
      imgEl.style.display = 'none';
      imgEl.src = '';
    }
    if (placeholder) placeholder.style.display = 'flex';

    this.activeType = 'none';
    this.clearReticleCanvas();
  }

  // Draw optical crosshair / alignment reticle over video feed
  updateReticleCanvas() {
    const canvas = document.getElementById('cle-cam-canvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const w = canvas.width = canvas.clientWidth || 320;
    const h = canvas.height = canvas.clientHeight || 200;
    ctx.clearRect(0, 0, w, h);

    if (this.reticleMode === 'none') return;

    ctx.strokeStyle = this.reticleColor;
    ctx.lineWidth = 1.5;
    const cx = w / 2;
    const cy = h / 2;

    if (this.reticleMode === 'crosshair' || this.reticleMode === 'bullseye') {
      // Horizontal and vertical hair
      ctx.beginPath();
      ctx.moveTo(0, cy); ctx.lineTo(w, cy);
      ctx.moveTo(cx, 0); ctx.lineTo(cx, h);
      ctx.stroke();

      // Tick marks along hair (5mm virtual visual scale)
      const tickStep = 15;
      for (let x = cx - 60; x <= cx + 60; x += tickStep) {
        ctx.beginPath(); ctx.moveTo(x, cy - 4); ctx.lineTo(x, cy + 4); ctx.stroke();
      }
      for (let y = cy - 60; y <= cy + 60; y += tickStep) {
        ctx.beginPath(); ctx.moveTo(cx - 4, y); ctx.lineTo(cx + 4, y); ctx.stroke();
      }
    }

    if (this.reticleMode === 'bullseye') {
      // Concentric alignment circles
      [15, 35, 60].forEach(r => {
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
      });
    }

    if (this.reticleMode === 'grid') {
      ctx.lineWidth = 0.8;
      ctx.strokeStyle = 'rgba(0, 255, 100, 0.4)';
      const step = 20;
      for (let x = 0; x < w; x += step) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
      }
      for (let y = 0; y < h; y += step) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      }
      // Center accent
      ctx.strokeStyle = this.reticleColor;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(w, cy); ctx.moveTo(cx, 0); ctx.lineTo(cx, h); ctx.stroke();
    }
  }

  clearReticleCanvas() {
    const canvas = document.getElementById('cle-cam-canvas');
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }

  // Optical Zero: Sets current WCS to 0,0 factoring in optional camera offset
  zeroToCrosshair() {
    const fluid = this.bridge.fluidnc;
    if (!fluid || !fluid.isConnected) {
      this.bridge.notify('Connect to FluidNC first.', 'error');
      return;
    }
    const targetX = this.cameraOffset.X;
    const targetY = this.cameraOffset.Y;
    fluid.sendGCode(`G10 L20 P1 X${targetX} Y${targetY}`);
    this.bridge.notify(`Zeroed WCS to Optical Crosshair (Offset X:${targetX} Y:${targetY})`, 'ok');
  }

  // Workpiece Snapshot Capture
  captureSnapshot() {
    const video = document.getElementById('cle-cam-video');
    const img = document.getElementById('cle-cam-img');
    const canvas = document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 720;
    const ctx = canvas.getContext('2d');

    if (this.activeType === 'usb' && video && video.readyState >= 2) {
      ctx.drawImage(video, 0, 0, 1280, 720);
    } else if (this.activeType === 'wifi' && img) {
      ctx.drawImage(img, 0, 0, 1280, 720);
    } else {
      this.bridge.notify('No active camera feed to capture.', 'error');
      return;
    }

    const dataUrl = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `workpiece_snapshot_${Date.now()}.png`;
    a.click();
    this.bridge.notify('Workpiece snapshot captured & downloaded.', 'ok');
  }

  // Toggle Viewport Docking (Picture-in-Picture)
  toggleViewportDock(docked) {
    this.docked = docked !== undefined ? docked : !this.docked;
    const camBox = document.getElementById('cle-cam-wrapper');
    if (!camBox) return;

    if (this.docked) {
      camBox.style.position = 'fixed';
      camBox.style.bottom = '20px';
      camBox.style.right = '20px';
      camBox.style.width = '300px';
      camBox.style.zIndex = '900';
      camBox.style.boxShadow = '0 8px 24px var(--shadow)';
    } else {
      camBox.style.position = 'relative';
      camBox.style.bottom = 'auto';
      camBox.style.right = 'auto';
      camBox.style.width = '100%';
      camBox.style.zIndex = 'auto';
      camBox.style.boxShadow = 'none';
    }
  }
}
