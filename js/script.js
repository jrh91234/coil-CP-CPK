// -----------------------------------------------------
// 1. CONFIGURATION & MASTER DATA
// -----------------------------------------------------
const AppConfig = {
    // ⚠️ นำ Web App URL ที่ได้จากการกด Deploy ใน Apps Script ของคุณมาใส่ตรงนี้
    GOOGLE_SHEET_URL: "https://script.google.com/macros/s/AKfycbw_z0CSt6TNiYiFTiuXflXzpAw8-NESmuSJEmKNALrgV8QV53NOHUKP8O5XwD6M8c2r/exec",
    USE_GOOGLE_SHEET: true // เปลี่ยนเป็น false หากต้องการทดสอบแบบ In-Memory โดยไม่ต่อเน็ต
};

// ตารางการสุ่มตัวอย่างทุก 2 ชั่วโมง (เว้นช่วงพัก)
const SAMPLING_SCHEDULE = {
    day: {
        slots:  ['08:01','10:01','13:00','15:00','17:30','19:30'], // กะเช้า 08:01-20:00
        breaks: [['12:00','13:00'],['17:00','17:30']]              // พักกลางวัน, พักเย็น
    },
    night: {
        slots:  ['20:01','22:01','01:00','03:00','05:30','07:30'], // กะดึก 20:01-08:00
        breaks: [['00:00','01:00'],['05:00','05:30']]              // พักเที่ยงคืน, พักเช้า
    }
};

// Chart.js plugin: เส้นแนวตั้งประสีส้มแสดงเวลาสุ่มตัวอย่าง + แถบเทาช่วงพัก (ใช้เฉพาะ drill-down view)
const _samplingLinesPlugin = {
    id: 'samplingLines',
    afterDraw(chart) {
        const slots = chart._samplingSlots;
        if (!slots || !slots.length) return;
        const isNight = chart._isNightShift || false;
        const breaks = chart._shiftBreaks || [];
        const labels = chart.data.labels;
        const xScale = chart.scales.x;
        const ctx = chart.ctx;
        const { top, bottom } = chart.chartArea;

        const toMins = t => {
            const m = String(t || '').match(/^(\d{2}):(\d{2})$/);
            if (!m) return -1;
            let v = +m[1] * 60 + +m[2];
            if (isNight && v < 720) v += 1440; // หลังเที่ยงคืนให้นับเป็นวันถัดไป
            return v;
        };
        const labelMins = labels.map(toMins);

        const getPx = sm => {
            if (sm < 0) return null;
            const exactIdx = labelMins.indexOf(sm);
            if (exactIdx >= 0) return xScale.getPixelForValue(exactIdx);
            let bi = -1, ai = -1;
            for (let i = 0; i < labelMins.length; i++) {
                if (labelMins[i] >= 0 && labelMins[i] <= sm) bi = i;
                if (ai < 0 && labelMins[i] >= 0 && labelMins[i] > sm) ai = i;
            }
            if (bi >= 0 && ai >= 0) {
                const t = (sm - labelMins[bi]) / (labelMins[ai] - labelMins[bi]);
                return xScale.getPixelForValue(bi) + t * (xScale.getPixelForValue(ai) - xScale.getPixelForValue(bi));
            }
            if (bi >= 0) return xScale.getPixelForValue(bi);
            if (ai >= 0) return xScale.getPixelForValue(ai);
            return null;
        };

        // วาดแถบสีเทาช่วงพัก
        breaks.forEach(([bStart, bEnd]) => {
            const psm = toMins(bStart);
            const pem = toMins(bEnd);
            const px1 = getPx(psm);
            const px2 = getPx(pem);
            if (px1 === null || px2 === null) return;
            ctx.save();
            ctx.fillStyle = 'rgba(156,163,175,0.18)';
            ctx.fillRect(px1, top, px2 - px1, bottom - top);
            ctx.strokeStyle = 'rgba(156,163,175,0.5)';
            ctx.lineWidth = 1;
            ctx.setLineDash([3, 3]);
            ctx.beginPath(); ctx.moveTo(px1, top); ctx.lineTo(px1, bottom); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(px2, top); ctx.lineTo(px2, bottom); ctx.stroke();
            ctx.fillStyle = 'rgba(107,114,128,0.75)';
            ctx.font = 'bold 7px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('พัก', (px1 + px2) / 2, top + 10);
            ctx.restore();
        });

        // วาดเส้นส้มเวลาสุ่มตัวอย่าง
        slots.forEach(slot => {
            const sm = toMins(slot);
            const px = getPx(sm);
            if (px === null) return;

            ctx.save();
            ctx.strokeStyle = 'rgba(251,146,60,0.75)';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([5, 4]);
            ctx.beginPath();
            ctx.moveTo(px, top);
            ctx.lineTo(px, bottom);
            ctx.stroke();
            ctx.fillStyle = 'rgba(194,65,12,0.9)';
            ctx.font = 'bold 8px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(slot, px, top + 10);
            ctx.restore();
        });
    }
};

// อัปเดตชื่อ Part ให้ตรงกับค่าใน Google Sheet หน้า Config เป๊ะๆ
const PART_SPECS = {
    "S1B29288-JR (10A)": { // 10A
        "item2": { name: "Item 2: Dimension 24.5 +/- 1.0 mm", target: 24.5, lsl: 23.5, usl: 25.5 },
        "item3": { name: "Item 3: Dimension 5.9 +/- 0.4 mm", target: 5.9, lsl: 5.5, usl: 6.3 },
        "item4": { name: "Item 4: Dimension 8.10 +/- 1.0 mm", target: 8.1, lsl: 7.1, usl: 9.1 },
        "item5": { name: "Item 5: Dimension 1.07 + 0.20 mm", target: 1.17, lsl: 1.07, usl: 1.27 },
        "item6": { name: "Item 6: Diameter ø 8.2 +/- 0.25 mm", target: 8.2, lsl: 7.95, usl: 8.45, type: "gauge" },
        "item7": { name: "Item 7: ความยาวรวม Max 31.00", target: 31.0, lsl: null, usl: 31.0 }
    },
    "S1B71819-JR (16A)": { // 16A
        "item2": { name: "Item 2: Dimension 24.5 +/- 1.0 mm", target: 24.5, lsl: 23.5, usl: 25.5 },
        "item3": { name: "Item 3: Dimension 5.9 +/- 0.4 mm", target: 5.9, lsl: 5.5, usl: 6.3 },
        "item4": { name: "Item 4: Dimension 8.10 +/- 1.0 mm", target: 8.1, lsl: 7.1, usl: 9.1 },
        "item5": { name: "Item 5: Dimension 1.35 + 0.20 mm", target: 1.45, lsl: 1.35, usl: 1.55 },
        "item6": { name: "Item 6: Diameter ø 8.2 +/- 0.25 mm", target: 8.2, lsl: 7.95, usl: 8.45, type: "gauge" },
        "item7": { name: "Item 7: ความยาวรวม Max 31.00", target: 31.0, lsl: null, usl: 31.0 }
    },
    "S1B29292-JR (20A)": { // 20A
        "item2": { name: "Item 2: Dimension 24.5 +/- 1.0 mm", target: 24.5, lsl: 23.5, usl: 25.5 },
        "item3": { name: "Item 3: Dimension 5.9 +/- 0.4 mm", target: 5.9, lsl: 5.5, usl: 6.3 },
        "item4": { name: "Item 4: Dimension 8.10 +/- 1.0 mm", target: 8.1, lsl: 7.1, usl: 9.1 },
        "item5": { name: "Item 5: Dimension 1.65 + 0.20 mm", target: 1.75, lsl: 1.65, usl: 1.85 },
        "item6": { name: "Item 6: Diameter ø 8.2 +/- 0.25 mm", target: 8.2, lsl: 7.95, usl: 8.45, type: "gauge" },
        "item7": { name: "Item 7: ความยาวรวม Max 31.00", target: 31.0, lsl: null, usl: 31.0 }
    },
    "51207080HC-JR (25/32A)": { // 32A
        "item2": { name: "Item 2: Dimension 25 +0.5/- 1.0 mm", target: 25.0, lsl: 24.0, usl: 25.5 },
        "item3": { name: "Item 3: Dimension 5.9 +/- 0.4 mm", target: 5.9, lsl: 5.5, usl: 6.3 },
        "item4": { name: "Item 4: Dimension 8.60 +/- 1.0 mm", target: 8.6, lsl: 7.6, usl: 9.6 },
        "item5": { name: "Item 5: Dimension 2.24 +/- 0.08 mm", target: 2.24, lsl: 2.16, usl: 2.32 },
        "item6": { name: "Item 6: Diameter ø 12.8 +/- 0.25 mm", target: 12.8, lsl: 12.55, usl: 13.05, type: "gauge" },
        "item7": { name: "Item 7: ความยาวรวม Max 31.00", target: 31.0, lsl: null, usl: 31.0 }
    }
};

// Cache รูปภาพจาก cloud โดยใช้ composite key = "partName|itemKey"
// เช่น "S1B29292-JR (20A)|item2" เพื่อแยกรูปแต่ละรุ่นชิ้นงานออกจากกัน
const ITEM_IMAGES = {};

// -----------------------------------------------------
// 2. UTILITIES (Math & Statistics)
// -----------------------------------------------------
class StatUtils {
    static mean(arr) {
        return arr.reduce((a, b) => a + b, 0) / arr.length;
    }

    static stdDev(arr, meanVal) {
        if (arr.length <= 1) return 0;
        const variance = arr.reduce((sum, val) => sum + Math.pow(val - meanVal, 2), 0) / (arr.length - 1);
        return Math.sqrt(variance);
    }

    // แปลง timestamp จาก toLocaleString('th-TH') → Date object (เฉพาะวัน)
    static parseThaiDate(timestamp) {
        if (!timestamp) return null;
        try {
            const clean = String(timestamp).replace(',', '').trim();
            const datePart = clean.split(' ')[0];
            const parts = datePart.split('/');
            if (parts.length !== 3) return null;
            let [d, m, y] = parts.map(Number);
            if (y > 2500) y -= 543; // Buddhist Era → CE
            const result = new Date(y, m - 1, d);
            return isNaN(result.getTime()) ? null : result;
        } catch { return null; }
    }

    // แปลง timestamp จาก toLocaleString('th-TH') → Date object (รวมเวลา)
    // รองรับทั้ง 24h ("17/6/2569 17:30:00") และ 12h ("17/6/2569, 5:30:00 PM")
    static parseThaiDateTime(timestamp) {
        if (!timestamp) return null;
        try {
            const clean = String(timestamp).replace(',', '').trim();
            const parts = clean.split(/\s+/);
            const datePart = parts[0];
            const timePart = parts[1] || '0:0:0';
            const ampm = (parts[2] || '').toLowerCase();
            const dp = datePart.split('/');
            if (dp.length !== 3) return null;
            let [d, m, y] = dp.map(Number);
            if (y > 2500) y -= 543;
            let [h, min, s] = timePart.split(':').map(v => Number(v) || 0);
            if (ampm === 'pm' && h < 12) h += 12;
            if (ampm === 'am' && h === 12) h = 0;
            const result = new Date(y, m - 1, d, h, min, s);
            return isNaN(result.getTime()) ? null : result;
        } catch { return null; }
    }

    static dateToISO(d) {
        if (!d) return '';
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }

    // วันผลิต: ก่อน 08:00 นับเป็นวันก่อนหน้า (shift boundary 08:00→07:59)
    static prodDateISO(timestamp) {
        const dt = StatUtils.parseThaiDateTime(timestamp);
        if (!dt) return '?';
        if (dt.getHours() < 8) dt.setDate(dt.getDate() - 1);
        return StatUtils.dateToISO(dt);
    }

    // Standard normal CDF (Abramowitz & Stegun approximation)
    static normalCDF(z) {
        const t = 1 / (1 + 0.2316419 * Math.abs(z));
        const d = 0.3989423 * Math.exp(-z * z / 2);
        const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.7814779 + t * (-1.8212560 + t * 1.3302744))));
        return z > 0 ? 1 - p : p;
    }

    // คำนวณ DPMO จาก mean, sigma และ spec limits
    static calcDPMO(mean, sigma, usl, lsl) {
        if (sigma <= 0) return 0;
        let pDefect = 0;
        if (usl !== null) pDefect += 1 - StatUtils.normalCDF((usl - mean) / sigma);
        if (lsl !== null) pDefect += StatUtils.normalCDF((lsl - mean) / sigma);
        return Math.round(Math.min(pDefect, 1) * 1_000_000);
    }

    // Sigma Level จาก Cpk (short-term)
    static sigmaLevel(cpk) {
        return (parseFloat(cpk) * 3).toFixed(2);
    }

    static calculateCapability(dataArray, usl, lsl) {
        if (dataArray.length < 2) return { cp: "-", cpk: "-", mean: "-" };

        const mean = this.mean(dataArray);
        const sigma = this.stdDev(dataArray, mean);

        if (sigma === 0) return { cp: "-", cpk: "-", mean: mean.toFixed(3) };

        let cp = null, cpu = null, cpl = null, cpk = null;

        if (usl !== null && lsl !== null) {
            cp = (usl - lsl) / (6 * sigma);
            cpu = (usl - mean) / (3 * sigma);
            cpl = (mean - lsl) / (3 * sigma);
            cpk = Math.min(cpu, cpl);
        } else if (usl !== null) {
            cpu = (usl - mean) / (3 * sigma);
            cpk = cpu;
        } else if (lsl !== null) {
            cpl = (mean - lsl) / (3 * sigma);
            cpk = cpl;
        }

        return {
            mean: mean.toFixed(3),
            cp: cp !== null ? cp.toFixed(2) : "-",
            cpk: cpk !== null ? cpk.toFixed(2) : "-"
        };
    }
}

// -----------------------------------------------------
// 3. DATA SERVICES (API Layer & Background Sync)
// -----------------------------------------------------
class InMemoryService {
    constructor() { this.data = []; }
    async save(record) {
        record.timestamp = new Date().toLocaleString('th-TH', { hour12: false });
        this.data.push(record);
        return { success: true };
    }
    async getAll() { return this.data; }
    getLocalData() { return this.data; }
    async getMasterData() {
        return {
            operators: ["พนักงาน 1", "พนักงาน 2"],
            machineAssignments: { "Machine_CWM-01": "S1B29288-JR (10A)" }
        };
    }
}

class GoogleSheetService {
    constructor(url, onSyncUpdate) {
        this.url = url;
        this.onSyncUpdate = onSyncUpdate;
        this.pendingQueue = JSON.parse(localStorage.getItem('cpk_pending_queue') || '[]');
        this.cachedData = [];
        this.isSyncing = false;
    }

    _saveQueueToLocal() {
        localStorage.setItem('cpk_pending_queue', JSON.stringify(this.pendingQueue));
        if (this.onSyncUpdate) this.onSyncUpdate(this.pendingQueue.length);
    }

    async save(record) {
        record.timestamp = new Date().toLocaleString('th-TH', { hour12: false });
        this.pendingQueue.push(record);
        this.cachedData.push(record);
        this._saveQueueToLocal();
        this.syncBackground();
        return { success: true };
    }

    async getAll() {
        try {
            const response = await fetch(`${this.url}?action=get`);
            const result = await response.json();
            const serverData = result.data || [];

            if (this.pendingQueue.length > 0) {
                this.pendingQueue = this.pendingQueue.filter(pending => {
                    const isAlreadyOnServer = serverData.some(server =>
                        server.part === pending.part &&
                        server.parameter === pending.parameter &&
                        server.operator === pending.operator &&
                        String(server.value) === String(pending.value)
                    );
                    return !isAlreadyOnServer;
                });
                this._saveQueueToLocal();
            }

            this.cachedData = [...serverData, ...this.pendingQueue];
            this.syncBackground();
            return this.cachedData;
        } catch (error) {
            console.error("Error fetching from Google Sheets:", error);
            return this.cachedData.length > 0 ? this.cachedData : this.pendingQueue;
        }
    }

    getLocalData() {
        return this.cachedData;
    }

    async syncBackground() {
        if (this.isSyncing || this.pendingQueue.length === 0) return;
        this.isSyncing = true;
        if (this.onSyncUpdate) this.onSyncUpdate(this.pendingQueue.length);

        while (this.pendingQueue.length > 0) {
            const recordToSync = this.pendingQueue[0];
            try {
                const response = await fetch(this.url, {
                    method: 'POST',
                    body: JSON.stringify({ action: "add", data: recordToSync }),
                    headers: { 'Content-Type': 'text/plain;charset=utf-8' }
                });
                const result = await response.json();

                if (result.success) {
                    this.pendingQueue.shift();
                    this._saveQueueToLocal();
                } else {
                    break;
                }
            } catch (error) {
                break;
            }
        }
        this.isSyncing = false;
        if (this.onSyncUpdate) this.onSyncUpdate(this.pendingQueue.length);
    }

    async getMasterData() {
        try {
            const response = await fetch(`${this.url}?action=get_master`);
            const result = await response.json();
            return result.data || { operators: [], machineAssignments: {} };
        } catch (error) {
            console.error("Error fetching Master Data:", error);
            return { operators: [], machineAssignments: {} };
        }
    }
}

// -----------------------------------------------------
// Sigma Zone Plugin (Chart.js custom plugin)
// วาด background zones ±1σ/±2σ/±3σ และ label บนกราฟ bell curve
// -----------------------------------------------------
const sigmaZonePlugin = {
    id: 'sigmaZones',
    beforeDraw(chart) {
        const opts = chart.options.plugins.sigmaZones;
        if (!opts || !opts.enabled || !opts.sigma || opts.sigma <= 0) return;

        const { ctx, scales: { x, y } } = chart;
        const { mean, sigma } = opts;

        // Zone backgrounds: center → outer
        const zones = [
            { from: mean - sigma,     to: mean + sigma,     color: 'rgba(34,197,94,0.10)' },
            { from: mean - 2 * sigma, to: mean - sigma,     color: 'rgba(234,179,8,0.12)' },
            { from: mean + sigma,     to: mean + 2 * sigma, color: 'rgba(234,179,8,0.12)' },
            { from: mean - 3 * sigma, to: mean - 2 * sigma, color: 'rgba(239,68,68,0.10)' },
            { from: mean + 2 * sigma, to: mean + 3 * sigma, color: 'rgba(239,68,68,0.10)' },
        ];

        zones.forEach(({ from, to, color }) => {
            const left  = Math.max(x.getPixelForValue(from), x.left);
            const right = Math.min(x.getPixelForValue(to),   x.right);
            if (left >= right) return;
            ctx.save();
            ctx.fillStyle = color;
            ctx.fillRect(left, y.top, right - left, y.bottom - y.top);
            ctx.restore();
        });

        // Sigma lines + labels
        const lines = [
            { val: mean - 3 * sigma, label: '−3σ', color: 'rgba(239,68,68,0.7)' },
            { val: mean - 2 * sigma, label: '−2σ', color: 'rgba(234,179,8,0.8)' },
            { val: mean - sigma,     label: '−1σ', color: 'rgba(34,197,94,0.8)' },
            { val: mean,             label:  'μ',  color: 'rgba(99,102,241,0.9)' },
            { val: mean + sigma,     label: '+1σ', color: 'rgba(34,197,94,0.8)' },
            { val: mean + 2 * sigma, label: '+2σ', color: 'rgba(234,179,8,0.8)' },
            { val: mean + 3 * sigma, label: '+3σ', color: 'rgba(239,68,68,0.7)' },
        ];

        lines.forEach(({ val, label, color }) => {
            const px = x.getPixelForValue(val);
            if (px < x.left || px > x.right) return;

            ctx.save();
            ctx.strokeStyle = color;
            ctx.setLineDash(label === 'μ' ? [6, 3] : [4, 4]);
            ctx.lineWidth = label === 'μ' ? 2 : 1.5;
            ctx.beginPath();
            ctx.moveTo(px, y.top);
            ctx.lineTo(px, y.bottom);
            ctx.stroke();

            // Label inside top of chart
            ctx.fillStyle = color;
            ctx.font = 'bold 10px sans-serif';
            ctx.textAlign = 'center';
            ctx.setLineDash([]);
            ctx.fillText(label, px, y.top + 12);
            ctx.restore();
        });
    }
};

// -----------------------------------------------------
// 4. VIEW (UI Management)
// -----------------------------------------------------
class DashboardUI {
    static _setupTypeColor(type) {
        if (type === 'roll_change') return 'rgb(234, 88, 12)';
        if (type === 'out_of_spec') return 'rgb(147, 51, 234)';
        return 'rgb(59, 130, 246)';
    }

    constructor() {
        this.chartInstances = {};
        this.bellChartInstance = null;
        this.bellCurveMode = null; // 'numeric' | 'gauge'
        this.showSixSigma = false;
        this._currentItemKey = null;
        this.elements = {
            machineSelect: document.getElementById('machine-id'),
            partSelect: document.getElementById('part-id'),
            paramSelect: document.getElementById('parameter-id'),
            specDisplay: document.getElementById('spec-display'),
            measuredContainer: document.getElementById('measured-values-container'),
            chartsContainer: document.getElementById('charts-container'),
            overviewPartTitle: document.getElementById('overview-part-title'),
            tbody: document.getElementById('data-table-body'),
            btnSubmit: document.getElementById('submit-btn'),
            statusText: document.getElementById('connection-status'),
            kpiCount: document.getElementById('kpi-count'),
            kpiMeanLabel: document.getElementById('kpi-mean-label'),
            kpiMean: document.getElementById('kpi-mean'),
            kpiCpLabel: document.getElementById('kpi-cp-label'),
            kpiCp: document.getElementById('kpi-cp'),
            kpiCpkLabel: document.getElementById('kpi-cpk-label'),
            kpiCpk: document.getElementById('kpi-cpk'),
            kpiCpkCard: document.getElementById('kpi-cpk-card')
        };

        // โหลดรูปภาพจาก Cloud เมื่อเปิดหน้า (fire-and-forget)
        if (AppConfig.USE_GOOGLE_SHEET) this._loadImagesFromCloud();

        // ผูก upload/delete ผ่าน event delegation บน document (ปุ่มถูกสร้าง dynamic)
        document.addEventListener('change', (e) => {
            if (e.target.id !== 'inline-file-input') return;
            const file = e.target.files?.[0];
            if (!file || !this._currentItemKey) return;
            e.target.value = '';
            this._compressAndUploadImage(this._currentItemKey, file);
        });

        document.addEventListener('click', (e) => {
            if (e.target.closest('#inline-delete-btn')) {
                if (!this._currentItemKey) return;
                if (!confirm('ลบรูปภาพนี้ออกหรือไม่?')) return;
                this._deleteImageFromCloud(this._currentItemKey);
            }
        });
    }

    static _setupTypeColor(type) {
        if (type === 'roll_change') return 'rgb(234, 88, 12)';     // orange
        if (type === 'out_of_spec') return 'rgb(147, 51, 234)';    // purple
        return 'rgb(59, 130, 246)';                                 // blue (default)
    }
    static _setupTypeColorAlpha(type, alpha) {
        if (type === 'roll_change') return `rgba(234, 88, 12, ${alpha})`;
        if (type === 'out_of_spec') return `rgba(147, 51, 234, ${alpha})`;
        return `rgba(59, 130, 246, ${alpha})`;
    }

    clearImagePanel() {
        this._currentItemKey = null;
        const panel = document.getElementById('item-image-panel');
        if (panel) panel.classList.add('hidden');
    }

    _ensureImagePanelDOM() {
        if (document.getElementById('item-image-panel')) return;
        const panel = document.createElement('div');
        panel.id = 'item-image-panel';
        panel.className = 'hidden bg-white rounded-xl shadow-sm border overflow-hidden';
        panel.innerHTML = `
            <div class="flex items-center justify-between px-4 py-2 bg-gray-50 border-b">
                <h3 id="item-image-panel-title" class="text-sm font-bold text-gray-700">ตำแหน่งวัด</h3>
                <div class="flex items-center gap-3">
                    <label class="cursor-pointer inline-flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 font-medium select-none">
                        <svg id="inline-upload-icon" xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                        </svg>
                        <svg id="inline-upload-spinner" class="hidden h-3.5 w-3.5 shrink-0 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path>
                        </svg>
                        <span id="inline-upload-text">อัพโหลดรูปภาพ</span>
                        <input type="file" accept="image/*" id="inline-file-input" class="hidden">
                    </label>
                    <button id="inline-delete-btn"
                            class="hidden inline-flex items-center gap-1 text-xs text-red-500 hover:text-red-700 font-medium">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                        ลบรูป
                    </button>
                </div>
            </div>
            <div class="flex items-center justify-center bg-gray-50 min-h-[160px] max-h-[280px] overflow-hidden">
                <img id="item-image-inline" src="" alt="ตำแหน่งวัด"
                     class="hidden w-full max-h-[280px] object-contain">
                <div id="item-image-none" class="text-center text-gray-400 py-10">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-10 w-10 mx-auto mb-2 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <p class="text-sm">ยังไม่มีรูปภาพ</p>
                    <p class="text-xs text-gray-300 mt-0.5">กดอัพโหลดรูปภาพด้านบน</p>
                </div>
            </div>
        `;
        const kpiContainer = this.elements.kpiCpkCard?.parentElement;
        if (kpiContainer?.parentNode) {
            kpiContainer.parentNode.insertBefore(panel, kpiContainer.nextSibling);
        }
    }

    _updateImagePanel(itemKey, itemName, imageUrl) {
        this._currentItemKey = itemKey;
        const panel = document.getElementById('item-image-panel');
        if (!panel) return;
        panel.classList.remove('hidden');
        const titleEl = document.getElementById('item-image-panel-title');
        if (titleEl) titleEl.textContent = `ตำแหน่งวัด — ${itemName || itemKey}`;
        const imgEl = document.getElementById('item-image-inline');
        const noneEl = document.getElementById('item-image-none');
        const deleteBtn = document.getElementById('inline-delete-btn');
        if (imageUrl) {
            imgEl.src = imageUrl;
            imgEl.classList.remove('hidden');
            noneEl?.classList.add('hidden');
            deleteBtn?.classList.remove('hidden');
        } else {
            imgEl.src = '';
            imgEl.classList.add('hidden');
            noneEl?.classList.remove('hidden');
            deleteBtn?.classList.add('hidden');
        }
    }

    async _loadImagesFromCloud() {
        try {
            const res = await fetch(`${AppConfig.GOOGLE_SHEET_URL}?action=get_images`);
            const json = await res.json();
            if (json.success && json.data) {
                Object.assign(ITEM_IMAGES, json.data);
                // Refresh panel หากมี item ถูกเลือกอยู่แล้ว (แก้ race condition)
                if (this._currentItemKey && ITEM_IMAGES[this._currentItemKey]) {
                    const titleEl = document.getElementById('item-image-panel-title');
                    const itemName = titleEl?.textContent?.replace('ตำแหน่งวัด — ', '') || this._currentItemKey;
                    this._updateImagePanel(this._currentItemKey, itemName, ITEM_IMAGES[this._currentItemKey]);
                }
            }
        } catch (e) {
            console.warn('Could not load images from cloud:', e);
        }
    }

    _compressToDataUrl(file) {
        return new Promise(resolve => {
            const reader = new FileReader();
            reader.onload = ev => {
                const img = new Image();
                img.onload = () => {
                    const MAX_W = 900;
                    let w = img.width, h = img.height;
                    if (w > MAX_W) { h = Math.round(h * MAX_W / w); w = MAX_W; }
                    const canvas = document.createElement('canvas');
                    canvas.width = w; canvas.height = h;
                    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                    resolve(canvas.toDataURL('image/jpeg', 0.82));
                };
                img.src = ev.target.result;
            };
            reader.readAsDataURL(file);
        });
    }

    async _compressAndUploadImage(itemKey, file) {
        this._setModalUploading(true);
        try {
            const dataUrl = await this._compressToDataUrl(file);
            const res = await fetch(AppConfig.GOOGLE_SHEET_URL, {
                method: 'POST',
                body: JSON.stringify({ action: 'upload_image', itemKey, dataUrl })
            });
            const json = await res.json();
            if (json.success && json.data?.url) {
                ITEM_IMAGES[itemKey] = json.data.url;
                this._updateImagePanel(itemKey, null, json.data.url);
            } else {
                alert('อัพโหลดไม่สำเร็จ: ' + (json.error || 'unknown error'));
            }
        } catch (e) {
            alert('อัพโหลดไม่สำเร็จ: ' + e.message);
        } finally {
            this._setModalUploading(false);
        }
    }

    async _deleteImageFromCloud(itemKey) {
        this._setModalUploading(true);
        try {
            await fetch(AppConfig.GOOGLE_SHEET_URL, {
                method: 'POST',
                body: JSON.stringify({ action: 'delete_image', itemKey })
            });
        } catch (e) {
            console.warn('Delete image error:', e);
        } finally {
            this._setModalUploading(false);
        }
        ITEM_IMAGES[itemKey] = '';
        this._updateImagePanel(itemKey, null, '');
    }

    _setModalUploading(isLoading) {
        const input = document.getElementById('inline-file-input');
        const icon = document.getElementById('inline-upload-icon');
        const spinner = document.getElementById('inline-upload-spinner');
        const labelText = document.getElementById('inline-upload-text');
        const deleteBtn = document.getElementById('inline-delete-btn');
        if (input) input.disabled = isLoading;
        icon?.classList.toggle('hidden', isLoading);
        spinner?.classList.toggle('hidden', !isLoading);
        if (labelText) labelText.textContent = isLoading ? 'กำลังอัพโหลด...' : 'อัพโหลดรูปภาพ';
        if (deleteBtn) deleteBtn.disabled = isLoading;
    }

    // ---- Input Validation Helpers ----

    _checkDecimalTypo(value, spec) {
        if (!spec || spec.type === 'gauge') return null;
        const ref = spec.target || spec.usl || spec.lsl;
        if (!ref || Math.abs(ref) < 0.001) return null;
        // ค่าต้องใหญ่กว่า ref อย่างน้อย 2x ถึงจะถือว่าน่าสงสัย
        if (Math.abs(value) <= Math.abs(ref) * 2) return null;
        for (const factor of [10, 100]) {
            const adj = value / factor;
            const ratio = adj / ref;
            if (ratio >= 0.3 && ratio <= 3.0) return parseFloat(adj.toFixed(3));
        }
        return null;
    }

    _checkCrossItemMatch(value, currentParam, currentSpec, partSpecs) {
        // เตือนเฉพาะกรณีที่ค่าอยู่นอก range ของ item ปัจจุบัน
        const inCurrent = (currentSpec.lsl === null || value >= currentSpec.lsl) &&
                          (currentSpec.usl === null || value <= currentSpec.usl);
        if (inCurrent) return null;
        for (const [key, spec] of Object.entries(partSpecs)) {
            if (key === currentParam || spec.type === 'gauge') continue;
            if (spec.lsl !== null && spec.usl !== null && value >= spec.lsl && value <= spec.usl) {
                return { name: spec.name.split(':')[0], lsl: spec.lsl, usl: spec.usl };
            }
        }
        return null;
    }

    validateAndWarn(values, currentParam, currentSpec, partSpecs, specName, onConfirm) {
        const warnings = [];
        const seen = new Set();
        for (const v of values) {
            const num = parseFloat(v);
            if (isNaN(num)) continue;
            const suggestion = this._checkDecimalTypo(num, currentSpec);
            if (suggestion !== null && !seen.has(`d${num}`)) {
                seen.add(`d${num}`);
                warnings.push(`ค่า <b>${num}</b> — ลืมจุดทศนิยมหรือไม่? อาจตั้งใจพิมพ์ <b>${suggestion}</b>`);
            }
            const match = this._checkCrossItemMatch(num, currentParam, currentSpec, partSpecs);
            if (match && !seen.has(`c${num}`)) {
                seen.add(`c${num}`);
                warnings.push(`ค่า <b>${num}</b> ตรงกับ range ของ <b>${match.name}</b> (${match.lsl}–${match.usl}) ไม่ใช่ ${specName}`);
            }
        }
        if (warnings.length === 0) { onConfirm(); return; }
        this._showWarningModal(warnings, specName, onConfirm);
    }

    _showWarningModal(warnings, specName, onConfirm) {
        let modal = document.getElementById('validation-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'validation-modal';
            document.body.appendChild(modal);
        }
        modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4';
        modal.innerHTML = `
            <div class="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden">
                <div class="bg-yellow-50 border-b border-yellow-200 px-5 py-3 flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-yellow-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                    </svg>
                    <h3 class="text-sm font-bold text-yellow-800">ตรวจพบค่าที่น่าสงสัย</h3>
                </div>
                <div class="px-5 py-4 space-y-2.5">
                    ${warnings.map(w => `
                        <div class="flex items-start gap-2 text-sm text-gray-700">
                            <span class="text-yellow-500 mt-0.5 shrink-0">⚠</span>
                            <p class="leading-relaxed">${w}</p>
                        </div>`).join('')}
                    <p class="text-xs text-gray-500 pt-3 border-t">
                        ยืนยันว่า <b>${specName}</b> คือ Item ที่เลือกถูกต้อง และค่าที่กรอกถูกต้องแล้ว?
                    </p>
                </div>
                <div class="grid grid-cols-2 gap-2 px-5 pb-4">
                    <button id="val-modal-cancel" class="py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">← กลับไปแก้ไข</button>
                    <button id="val-modal-confirm" class="py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold transition-colors">ยืนยันส่งข้อมูล →</button>
                </div>
            </div>
        `;
        document.getElementById('val-modal-cancel').onclick = () => modal.remove();
        document.getElementById('val-modal-confirm').onclick = () => { modal.remove(); onConfirm(); };
    }

    setStatus(text, colorClass) {
        this.elements.statusText.innerText = text;
        this.elements.statusText.className = `${colorClass} font-semibold`;
    }

    updateSyncStatus(dbName, pendingCount) {
        if (pendingCount > 0) {
            this.elements.statusText.innerHTML = `${dbName} <span class="text-yellow-300 ml-2 animate-pulse">⏳ รออัปโหลด: ${pendingCount}</span>`;
            this.elements.statusText.className = `text-green-400 font-semibold flex items-center`;
        } else {
            this.elements.statusText.innerText = dbName;
            this.elements.statusText.className = `text-green-400 font-semibold`;
        }
    }

    setLoadingState(isLoading) {
        this.elements.btnSubmit.disabled = isLoading;
        this.elements.btnSubmit.innerText = isLoading ? 'กำลังประมวลผล...' : 'บันทึกข้อมูล (Save)';
    }

    // สลับระหว่าง numeric input กับ gauge input
    setGaugeMode(isGauge) {
        const numericSection = document.getElementById('numeric-input-section');
        const gaugeSection = document.getElementById('gauge-input-section');

        if (isGauge) {
            numericSection.classList.add('hidden');
            gaugeSection.classList.remove('hidden');
        } else {
            numericSection.classList.remove('hidden');
            gaugeSection.classList.add('hidden');
        }
    }

    // คืนค่าผลลัพธ์ gauge ทั้ง 3 แถว (กรองเฉพาะที่เลือกแล้ว)
    getGaugeSelection() {
        return Array.from(document.querySelectorAll('.gauge-result-input'))
            .map(el => el.value)
            .filter(v => v !== '');
    }

    // รีเซ็ตการเลือก gauge ทุกแถว
    resetGaugeSelection() {
        const basePass = 'gauge-pass-btn flex-1 py-2 px-3 rounded-lg border-2 font-bold text-sm transition-colors border-gray-300 text-gray-500 hover:border-green-500 hover:text-green-600 hover:bg-green-50';
        const baseFail = 'gauge-fail-btn flex-1 py-2 px-3 rounded-lg border-2 font-bold text-sm transition-colors border-gray-300 text-gray-500 hover:border-red-500 hover:text-red-600 hover:bg-red-50';
        document.querySelectorAll('.gauge-result-input').forEach(el => el.value = '');
        document.querySelectorAll('.gauge-pass-btn').forEach(btn => btn.className = basePass);
        document.querySelectorAll('.gauge-fail-btn').forEach(btn => btn.className = baseFail);
    }

    clearInput() {
        const container = this.elements.measuredContainer;
        if (!container) return;

        while (container.children.length > 3) {
            container.removeChild(container.lastChild);
        }
        container.querySelectorAll('.measured-value-input').forEach((input, i) => {
            input.value = '';
            input.placeholder = `ชิ้นที่ ${i + 1}...`;
        });
        container.querySelector('.measured-value-input')?.focus();

        this.resetGaugeSelection();
    }

    getMeasuredValues() {
        return Array.from(document.querySelectorAll('.measured-value-input'))
            .map(el => el.value.trim())
            .filter(v => v !== '' && !isNaN(parseFloat(v)));
    }

    populateOperators(operators) {
        let opSelect = document.getElementById('operator');
        if (opSelect.tagName === 'INPUT') {
            const select = document.createElement('select');
            select.id = 'operator';
            select.required = true;
            select.className = opSelect.className;
            opSelect.parentNode.replaceChild(select, opSelect);
            opSelect = select;
        }

        opSelect.innerHTML = '<option value="">-- เลือกพนักงาน --</option>';
        operators.forEach(op => {
            const option = document.createElement('option');
            option.value = op;
            option.text = op;
            opSelect.appendChild(option);
        });
    }

    populateMachines(machineAssignments) {
        const mSelect = this.elements.machineSelect;
        mSelect.innerHTML = '<option value="">-- เลือกเครื่องจักร --</option>';
        const machines = Object.keys(machineAssignments).sort();
        machines.forEach(machine => {
            const option = document.createElement('option');
            option.value = machine;
            option.text = machine;
            mSelect.appendChild(option);
        });
    }

    populateParts(partSpecs) {
        const pSelect = this.elements.partSelect;
        pSelect.innerHTML = '<option value="">-- เลือกรุ่นชิ้นงาน --</option>';
        for (const part in partSpecs) {
            const option = document.createElement('option');
            option.value = part;
            option.text = part;
            pSelect.appendChild(option);
        }
    }

    renderParameterOptions(specsObject) {
        this.elements.paramSelect.innerHTML = '';
        for (const [key, spec] of Object.entries(specsObject)) {
            const option = document.createElement('option');
            option.value = key;
            option.text = spec.type === 'gauge' ? `${spec.name} [Gauge]` : spec.name;
            this.elements.paramSelect.appendChild(option);
        }
    }

    updateSpecInfo(spec) {
        if (spec.type === 'gauge') {
            const specDetail = spec.name.split(':')[1]?.trim() || spec.name;
            this.elements.specDisplay.innerHTML =
                `<span class="text-blue-700 font-bold">🔵 ตรวจสอบด้วย Gauge (Pass / Fail)</span><br/>สเปค: ${specDetail}`;
        } else {
            const lslText = spec.lsl !== null ? spec.lsl : "ไม่มี (N/A)";
            this.elements.specDisplay.innerHTML =
                `สเปค (Spec): <b>${spec.name}</b> <br/> (LSL: ${lslText} / USL: ${spec.usl})`;
        }
    }

    // ----- Bell Curve / P-Chart Container -----

    _ensureBellCurveDOM() {
        this._ensureImagePanelDOM();
        if (document.getElementById('bell-curve-container')) return;

        const container = document.createElement('div');
        container.id = 'bell-curve-container';
        container.className = 'bg-white p-4 rounded-xl shadow-sm border transition-all duration-500 ease-in-out';
        container.innerHTML = `
            <div class="flex justify-between items-center mb-4 border-b pb-2">
                <h3 id="bell-curve-title" class="text-md font-bold text-gray-700">การวิเคราะห์การกระจายตัว (Histogram & Normal Curve)</h3>
                <div class="flex items-center gap-2">
                    <span id="bell-chart-title" class="text-xs bg-purple-100 text-purple-800 px-3 py-1 rounded-full font-bold"></span>
                    <button id="six-sigma-btn"
                        class="text-xs px-3 py-1 rounded-full border font-medium transition-colors border-gray-300 text-gray-500 hover:bg-indigo-50 hover:border-indigo-400 hover:text-indigo-600">
                        6σ View
                    </button>
                </div>
            </div>
            <div class="relative h-[300px] w-full">
                <canvas id="bellCurveCanvas"></canvas>
            </div>
            <div id="sigma-stats-panel" class="hidden mt-3 pt-3 border-t">
                <div class="grid grid-cols-4 gap-3 text-center">
                    <div class="bg-indigo-50 rounded-lg p-2">
                        <p class="text-xs text-indigo-500 font-medium">Short-term σ</p>
                        <p class="text-xs text-indigo-400 mb-0.5">Cpk × 3</p>
                        <p id="stat-sigma-short" class="text-xl font-bold text-indigo-700">-</p>
                    </div>
                    <div class="bg-purple-50 rounded-lg p-2">
                        <p class="text-xs text-purple-500 font-medium">Long-term σ</p>
                        <p class="text-xs text-purple-400 mb-0.5">Cpk × 3 + 1.5</p>
                        <p id="stat-sigma-long" class="text-xl font-bold text-purple-700">-</p>
                    </div>
                    <div class="bg-gray-50 rounded-lg p-2">
                        <p class="text-xs text-gray-500 font-medium">DPMO</p>
                        <p class="text-xs text-gray-400 mb-0.5">ของเสีย/ล้านชิ้น</p>
                        <p id="stat-dpmo" class="text-xl font-bold text-gray-700">-</p>
                    </div>
                    <div class="bg-gray-50 rounded-lg p-2">
                        <p class="text-xs text-gray-500 font-medium">Yield (%)</p>
                        <p class="text-xs text-gray-400 mb-0.5">อัตราผลิตภัณฑ์ดี</p>
                        <p id="stat-yield" class="text-xl font-bold text-gray-700">-</p>
                    </div>
                </div>
                <div id="stat-target-bar" class="mt-2 px-3 py-2 rounded-lg text-sm text-center font-medium bg-gray-100 text-gray-500">
                    เป้าหมาย 6σ: Cpk ≥ 2.00
                </div>
            </div>
        `;

        // Insert bell curve AFTER the image panel (which sits after KPI cards)
        const insertAfter = document.getElementById('item-image-panel') || this.elements.kpiCpkCard?.parentElement;
        if (insertAfter?.parentNode) {
            insertAfter.parentNode.insertBefore(container, insertAfter.nextSibling);
        }

        // bind toggle button
        document.getElementById('six-sigma-btn')?.addEventListener('click', () => {
            this.showSixSigma = !this.showSixSigma;
            this._applySixSigmaToggle();
        });
    }

    _applySixSigmaToggle() {
        const btn = document.getElementById('six-sigma-btn');
        const panel = document.getElementById('sigma-stats-panel');

        if (this.showSixSigma) {
            btn.className = 'text-xs px-3 py-1 rounded-full border font-medium transition-colors bg-indigo-600 text-white border-indigo-600';
            panel?.classList.remove('hidden');
        } else {
            btn.className = 'text-xs px-3 py-1 rounded-full border font-medium transition-colors border-gray-300 text-gray-500 hover:bg-indigo-50 hover:border-indigo-400 hover:text-indigo-600';
            panel?.classList.add('hidden');
        }

        // toggle plugin on existing chart
        if (this.bellChartInstance && this.bellCurveMode === 'numeric') {
            this.bellChartInstance.options.plugins.sigmaZones.enabled = this.showSixSigma;
            this.bellChartInstance.update();
        }
    }

    _initNumericBellChart() {
        if (this.bellChartInstance) {
            this.bellChartInstance.destroy();
            this.bellChartInstance = null;
        }
        this.bellCurveMode = 'numeric';

        const ctx = document.getElementById('bellCurveCanvas').getContext('2d');
        this.bellChartInstance = new Chart(ctx, {
            plugins: [sigmaZonePlugin],
            data: {
                datasets: [
                    {
                        type: 'bar',
                        label: 'ความถี่ (Histogram)',
                        data: [],
                        backgroundColor: 'rgba(59, 130, 246, 0.6)',
                        borderColor: 'rgb(59, 130, 246)',
                        borderWidth: 1,
                        barPercentage: 1.0,
                        categoryPercentage: 1.0
                    },
                    {
                        type: 'line',
                        label: 'ระฆังคว่ำ (Normal Curve)',
                        data: [],
                        borderColor: 'rgb(168, 85, 247)',
                        borderWidth: 2.5,
                        pointRadius: 0,
                        fill: true,
                        backgroundColor: 'rgba(168, 85, 247, 0.15)',
                        tension: 0.4
                    },
                    {
                        type: 'line',
                        label: 'LSL',
                        data: [],
                        borderColor: 'rgb(239, 68, 68)',
                        borderDash: [5, 5],
                        borderWidth: 2,
                        pointRadius: 0
                    },
                    {
                        type: 'line',
                        label: 'USL',
                        data: [],
                        borderColor: 'rgb(239, 68, 68)',
                        borderDash: [5, 5],
                        borderWidth: 2,
                        pointRadius: 0
                    },
                    {
                        type: 'line',
                        label: 'Target',
                        data: [],
                        borderColor: 'rgb(34, 197, 94)',
                        borderDash: [3, 3],
                        borderWidth: 2,
                        pointRadius: 0
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        type: 'linear',
                        position: 'bottom',
                        title: { display: true, text: 'ค่าที่วัดได้ (Measured Value)' },
                        ticks: {
                            callback: function(value) { return value.toFixed(2); },
                            maxTicksLimit: 12
                        }
                    },
                    y: {
                        beginAtZero: true,
                        title: { display: true, text: 'ความถี่ (Frequency)' }
                    }
                },
                plugins: {
                    legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 10 } },
                    tooltip: { mode: 'index', intersect: false },
                    sigmaZones: { enabled: false, mean: 0, sigma: 0 }
                },
                interaction: { mode: 'nearest', axis: 'x', intersect: false }
            }
        });
    }

    _initGaugePChart() {
        if (this.bellChartInstance) {
            this.bellChartInstance.destroy();
            this.bellChartInstance = null;
        }
        this.bellCurveMode = 'gauge';

        const ctx = document.getElementById('bellCurveCanvas').getContext('2d');
        this.bellChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [
                    {
                        label: 'ผลการตรวจ',
                        data: [],
                        borderColor: 'rgb(148, 163, 184)',
                        borderWidth: 1.5,
                        pointRadius: 9,
                        pointHoverRadius: 11,
                        pointBackgroundColor: [],
                        pointBorderColor: [],
                        fill: false,
                        tension: 0
                    },
                    {
                        label: 'Pass Rate รวม',
                        data: [],
                        borderColor: 'rgb(59, 130, 246)',
                        borderDash: [5, 5],
                        borderWidth: 2,
                        pointRadius: 0,
                        fill: false
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        title: { display: true, text: 'ลำดับการตรวจ (ล่าสุด 30 ครั้ง)' },
                        ticks: { maxTicksLimit: 15, maxRotation: 45 }
                    },
                    y: {
                        min: -0.15,
                        max: 1.15,
                        ticks: {
                            callback: v => {
                                if (v === 1) return 'ผ่าน ✓';
                                if (v === 0) return 'ไม่ผ่าน ✗';
                                return '';
                            },
                            stepSize: 0.5
                        },
                        title: { display: true, text: 'ผลการตรวจ' }
                    }
                },
                plugins: {
                    legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 10 } },
                    tooltip: {
                        callbacks: {
                            label: ctx => {
                                if (ctx.datasetIndex === 0) {
                                    return ctx.raw === 1 ? '✓ ผ่าน (PASS)' : '✗ ไม่ผ่าน (FAIL)';
                                }
                                return `Pass Rate: ${(ctx.raw * 100).toFixed(1)}%`;
                            }
                        }
                    }
                }
            }
        });
    }

    _updateNumericBellChart(dataRecords, currentConfig, partName) {
        const titleEl = document.getElementById('bell-chart-title');
        const headerEl = document.getElementById('bell-curve-title');
        if (titleEl) titleEl.innerText = `${partName} - ${currentConfig.name ? currentConfig.name.split(':')[0] : ''}`;
        if (headerEl) headerEl.innerText = 'การวิเคราะห์การกระจายตัว (Histogram & Normal Curve)';

        const imageKey = partName || (this.elements.paramSelect?.value || '');
        this._updateImagePanel(imageKey, partName, ITEM_IMAGES[imageKey] || '');

        const values = dataRecords.map(r => parseFloat(r.value)).filter(v => !isNaN(v));

        if (values.length < 2) {
            this.bellChartInstance.data.datasets.forEach(ds => ds.data = []);
            this.bellChartInstance.update();
            return;
        }

        const mean = StatUtils.mean(values);
        const sigma = StatUtils.stdDev(values, mean);

        const dataMin = Math.min(...values);
        const dataMax = Math.max(...values);
        const n = values.length;

        const dataRange = dataMax - dataMin || 1;
        const binBySturges = Math.ceil(1 + 3.322 * Math.log10(n));
        const binByPrecision = Math.round(dataRange / 0.01);
        const binCount = Math.max(binBySturges, Math.min(50, binByPrecision));
        const binWidth = dataRange / binCount;
        const bins = new Array(binCount).fill(0);

        values.forEach(v => {
            let idx = Math.floor((v - dataMin) / binWidth);
            if (idx >= binCount) idx = binCount - 1;
            if (idx < 0) idx = 0;
            bins[idx]++;
        });

        const histData = bins.map((count, i) => ({
            x: dataMin + (i + 0.5) * binWidth,
            y: count
        }));

        let minVal = dataMin;
        let maxVal = dataMax;
        if (currentConfig.lsl !== null) minVal = Math.min(minVal, currentConfig.lsl);
        if (currentConfig.usl !== null) maxVal = Math.max(maxVal, currentConfig.usl);
        minVal = Math.min(minVal, mean - 3.5 * sigma);
        maxVal = Math.max(maxVal, mean + 3.5 * sigma);

        const curveData = [];
        const steps = 100;
        const stepSize = (maxVal - minVal) / steps;
        let maxCurveY = 0;

        for (let i = 0; i <= steps; i++) {
            const x = minVal + i * stepSize;
            let y = 0;
            if (sigma > 0) {
                const pdf = (1 / (sigma * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * Math.pow((x - mean) / sigma, 2));
                y = pdf * n * binWidth;
            }
            curveData.push({ x, y });
            if (y > maxCurveY) maxCurveY = y;
        }

        const maxHistY = Math.max(...bins, 0);
        const maxY = Math.max(maxHistY, maxCurveY) * 1.15;

        this.bellChartInstance.data.datasets[0].data = histData;
        this.bellChartInstance.data.datasets[1].data = curveData;
        this.bellChartInstance.data.datasets[2].data = currentConfig.lsl !== null ? [{ x: currentConfig.lsl, y: 0 }, { x: currentConfig.lsl, y: maxY }] : [];
        this.bellChartInstance.data.datasets[3].data = currentConfig.usl !== null ? [{ x: currentConfig.usl, y: 0 }, { x: currentConfig.usl, y: maxY }] : [];
        this.bellChartInstance.data.datasets[4].data = currentConfig.target !== null ? [{ x: currentConfig.target, y: 0 }, { x: currentConfig.target, y: maxY }] : [];

        this.bellChartInstance.options.scales.x.min = minVal;
        this.bellChartInstance.options.scales.x.max = maxVal;
        this.bellChartInstance.options.scales.y.max = maxY;

        // อัปเดต sigma zone plugin
        this.bellChartInstance.options.plugins.sigmaZones.mean = mean;
        this.bellChartInstance.options.plugins.sigmaZones.sigma = sigma;
        this.bellChartInstance.options.plugins.sigmaZones.enabled = this.showSixSigma;

        this.bellChartInstance.update();

        // อัปเดต sigma stats panel
        this._updateSigmaStatsPanel(mean, sigma, currentConfig);
    }

    _updateSigmaStatsPanel(mean, sigma, config) {
        const panel = document.getElementById('sigma-stats-panel');
        if (!panel) return;

        // คำนวณ Cpk จาก mean/sigma โดยตรง
        let cpk = null;
        if (sigma > 0) {
            const vals = [];
            if (config.usl !== null) vals.push((config.usl - mean) / (3 * sigma));
            if (config.lsl !== null) vals.push((mean - config.lsl) / (3 * sigma));
            if (vals.length > 0) cpk = Math.min(...vals);
        }

        const dpmo = StatUtils.calcDPMO(mean, sigma, config.usl, config.lsl);
        const yieldPct = ((1 - dpmo / 1_000_000) * 100).toFixed(4);

        // Short-term: Cpk × 3
        const sigmaShort = cpk !== null ? cpk * 3 : null;
        // Long-term: Cpk × 3 + 1.5 (มาตรฐาน Six Sigma รวม process drift)
        const sigmaLong  = cpk !== null ? cpk * 3 + 1.5 : null;

        const _colorForSigma = n => n >= 6 ? 'text-green-600'
                                  : n >= 5 ? 'text-blue-600'
                                  : n >= 4 ? 'text-yellow-600'
                                  : 'text-red-600';

        const shortEl = document.getElementById('stat-sigma-short');
        const longEl  = document.getElementById('stat-sigma-long');
        const dpmoEl  = document.getElementById('stat-dpmo');
        const yieldEl = document.getElementById('stat-yield');
        const targetEl = document.getElementById('stat-target-bar');

        if (shortEl) {
            shortEl.innerText = sigmaShort !== null ? `${sigmaShort.toFixed(2)}σ` : '-';
            shortEl.className = `text-xl font-bold ${sigmaShort !== null ? _colorForSigma(sigmaShort) : 'text-gray-400'}`;
        }
        if (longEl) {
            longEl.innerText = sigmaLong !== null ? `${sigmaLong.toFixed(2)}σ` : '-';
            longEl.className = `text-xl font-bold ${sigmaLong !== null ? _colorForSigma(sigmaLong) : 'text-gray-400'}`;
        }
        if (dpmoEl) dpmoEl.innerText = cpk !== null ? dpmo.toLocaleString() : '-';
        if (yieldEl) yieldEl.innerText = cpk !== null ? `${yieldPct}%` : '-';

        if (targetEl && cpk !== null) {
            const cpkStr = cpk.toFixed(2);
            const ok = cpk >= 2.0;
            targetEl.className = `mt-2 px-3 py-2 rounded-lg text-sm text-center font-medium ${ok ? 'bg-green-100 text-green-700' : 'bg-red-50 text-red-600'}`;
            targetEl.innerText = ok
                ? `✓ ผ่านเป้าหมาย 6σ — Cpk = ${cpkStr} (≥ 2.00)`
                : `✗ ยังไม่ถึง 6σ — Cpk ปัจจุบัน = ${cpkStr} (ต้องการ ≥ 2.00)`;
        } else if (targetEl) {
            targetEl.className = 'mt-2 px-3 py-2 rounded-lg text-sm text-center font-medium bg-gray-100 text-gray-500';
            targetEl.innerText = 'เป้าหมาย 6σ: Cpk ≥ 2.00';
        }
    }

    _updateGaugePChart(dataRecords, currentConfig, partName) {
        const titleEl = document.getElementById('bell-chart-title');
        const headerEl = document.getElementById('bell-curve-title');
        if (titleEl) titleEl.innerText = `${partName} - Item 6 (Gauge)`;
        if (headerEl) headerEl.innerText = 'ประวัติการตรวจสอบ Gauge (P-Chart)';

        const imageKey = partName || 'item6';
        this._updateImagePanel(imageKey, partName, ITEM_IMAGES[imageKey] || '');

        const records = [...dataRecords].slice(-30);

        if (records.length === 0) {
            this.bellChartInstance.data.labels = [];
            this.bellChartInstance.data.datasets[0].data = [];
            this.bellChartInstance.data.datasets[0].pointBackgroundColor = [];
            this.bellChartInstance.data.datasets[0].pointBorderColor = [];
            this.bellChartInstance.data.datasets[1].data = [];
            this.bellChartInstance.update();
            return;
        }

        const labels = records.map((_, i) => `#${i + 1}`);
        const values = records.map(r => r.value === 'PASS' ? 1 : 0);
        const bgColors = values.map(v => v === 1 ? 'rgba(34, 197, 94, 0.85)' : 'rgba(239, 68, 68, 0.85)');
        const borderColors = values.map(v => v === 1 ? 'rgb(22, 163, 74)' : 'rgb(220, 38, 38)');

        const passCount = values.reduce((a, b) => a + b, 0);
        const passRate = passCount / values.length;

        this.bellChartInstance.data.labels = labels;
        this.bellChartInstance.data.datasets[0].data = values;
        this.bellChartInstance.data.datasets[0].pointBackgroundColor = bgColors;
        this.bellChartInstance.data.datasets[0].pointBorderColor = borderColors;
        this.bellChartInstance.data.datasets[1].data = Array(labels.length).fill(passRate);
        this.bellChartInstance.data.datasets[1].label = `Pass Rate รวม: ${(passRate * 100).toFixed(1)}%`;

        this.bellChartInstance.update();
    }

    // renderBellCurve - dispatcher
    renderBellCurve(dataRecords, currentConfig, partName) {
        this._ensureBellCurveDOM();

        if (currentConfig.type === 'gauge') {
            if (this.bellCurveMode !== 'gauge') {
                this._initGaugePChart();
            }
            this._updateGaugePChart(dataRecords, currentConfig, partName);
            return;
        }

        if (this.bellCurveMode !== 'numeric') {
            this._initNumericBellChart();
        }
        this._updateNumericBellChart(dataRecords, currentConfig, partName);
    }

    // สร้าง DOM ของกราฟทุกตัวอัตโนมัติเมื่อเลือกรุ่นชิ้นงาน
    setupAllCharts(partName, specsObject) {
        if (this.elements.overviewPartTitle) this.elements.overviewPartTitle.innerText = partName;
        if (!this.elements.chartsContainer) return;

        // ลงทะเบียน plugin เส้นสุ่มตัวอย่างครั้งเดียว
        if (!Chart.registry.plugins.get('samplingLines')) Chart.register(_samplingLinesPlugin);

        this.elements.chartsContainer.innerHTML = '';

        // Destroy existing chart instances before recreating
        for (const key in this.chartInstances) {
            if (this.chartInstances[key]) {
                this.chartInstances[key].destroy();
            }
        }
        this.chartInstances = {};

        for (const [key, spec] of Object.entries(specsObject)) {
            const wrapper = document.createElement('div');
            wrapper.className = 'bg-white p-4 rounded-xl shadow-sm border transition-all duration-500 ease-in-out';
            wrapper.id = `chart-wrapper-${key}`;

            const itemLabel = spec.name.split(':')[0];

            if (spec.type === 'gauge') {
                // Gauge type: bar chart with pass/fail
                wrapper.innerHTML = `
                    <div class="flex justify-between items-center mb-2 border-b pb-2">
                        <h3 class="text-sm font-bold text-gray-700">${itemLabel}</h3>
                        <span class="gauge-rate text-xs bg-gray-100 text-gray-600 px-3 py-1 rounded-full font-bold">-</span>
                    </div>
                    <div class="relative h-48 w-full">
                        <canvas id="canvas-${key}"></canvas>
                    </div>
                `;
                this.elements.chartsContainer.appendChild(wrapper);

                const ctx = document.getElementById(`canvas-${key}`).getContext('2d');
                this.chartInstances[key] = new Chart(ctx, {
                    type: 'bar',
                    data: {
                        labels: ['✓ ผ่าน (PASS)', '✗ ไม่ผ่าน (FAIL)'],
                        datasets: [{
                            label: 'จำนวนครั้ง',
                            data: [0, 0],
                            backgroundColor: ['rgba(34, 197, 94, 0.7)', 'rgba(239, 68, 68, 0.7)'],
                            borderColor: ['rgb(34, 197, 94)', 'rgb(239, 68, 68)'],
                            borderWidth: 1.5
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { legend: { display: false } },
                        scales: {
                            y: {
                                beginAtZero: true,
                                ticks: { stepSize: 1, precision: 0 }
                            }
                        }
                    }
                });
            } else {
                // Numeric type: line chart (existing behavior)
                const header = document.createElement('div');
                header.className = 'flex justify-between items-center mb-2 border-b pb-2';
                const itemDim = (spec.name.split(':')[1] || spec.name).trim();
                header.innerHTML = `
                    <h3 class="text-sm font-bold text-gray-700">${itemLabel}</h3>
                    <span class="text-xs text-gray-500 truncate ml-2" title="${itemDim}">${itemDim}</span>
                `;

                const canvasContainer = document.createElement('div');
                canvasContainer.className = 'relative h-48 w-full';
                const canvas = document.createElement('canvas');
                canvas.id = `canvas-${key}`;

                canvasContainer.appendChild(canvas);
                wrapper.appendChild(header);
                wrapper.appendChild(canvasContainer);
                this.elements.chartsContainer.appendChild(wrapper);

                const ctx = canvas.getContext('2d');
                this.chartInstances[key] = new Chart(ctx, {
                    type: 'line',
                    data: {
                        labels: [],
                        datasets: [
                            { label: 'ค่าที่วัดได้', data: [], borderColor: 'rgb(59, 130, 246)', borderWidth: 2, pointRadius: 3, fill: false, tension: 0.1 },
                            { label: 'USL', data: [], borderColor: 'rgb(239, 68, 68)', borderDash: [5, 5], borderWidth: 1.5, pointRadius: 0, fill: false },
                            { label: 'LSL', data: [], borderColor: 'rgb(239, 68, 68)', borderDash: [5, 5], borderWidth: 1.5, pointRadius: 0, fill: false }
                        ]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { legend: { display: false } },
                        scales: {
                            x: { ticks: { display: true, maxRotation: 45 } }
                        },
                        onClick: (event, elements) => {
                            if (elements.length) this._handleNumericChartClick(key, elements);
                        },
                        onHover: (event, elements) => {
                            const c = this.chartInstances[key];
                            const canDrill = elements.length > 0 && c?._isMultiDay && !c?._isDrilling;
                            if (event.native?.target) event.native.target.style.cursor = canDrill ? 'pointer' : 'default';
                        }
                    }
                });
            }
        }
    }

    // อัปเดตข้อมูลกราฟรายตัว
    updateAllCharts(dataRecords, part, specsObject) {
        for (const [key, spec] of Object.entries(specsObject)) {
            const chart = this.chartInstances[key];
            if (!chart) continue;

            const paramRecords = dataRecords.filter(r => r.part === part && r.parameter === key);

            if (spec.type === 'gauge') {
                // นับจำนวน PASS / FAIL
                const passCount = paramRecords.filter(r => r.value === 'PASS').length;
                const failCount = paramRecords.filter(r => r.value === 'FAIL').length;
                const total = passCount + failCount;

                chart.data.datasets[0].data = [passCount, failCount];
                chart.update();

                // อัปเดต badge pass rate
                const wrapper = document.getElementById(`chart-wrapper-${key}`);
                const rateEl = wrapper?.querySelector('.gauge-rate');
                if (rateEl) {
                    if (total === 0) {
                        rateEl.textContent = '-';
                        rateEl.className = 'gauge-rate text-xs bg-gray-100 text-gray-600 px-3 py-1 rounded-full font-bold';
                    } else {
                        const pct = ((passCount / total) * 100).toFixed(1);
                        rateEl.textContent = `${pct}% ผ่าน`;
                        const color = parseFloat(pct) >= 95
                            ? 'bg-green-100 text-green-800'
                            : parseFloat(pct) >= 80
                                ? 'bg-yellow-100 text-yellow-800'
                                : 'bg-red-100 text-red-800';
                        rateEl.className = `gauge-rate text-xs ${color} px-3 py-1 rounded-full font-bold`;
                    }
                }
            } else {
                // Numeric: smart daily-vs-individual aggregation
                const { labels, values, setupTypes } = DashboardUI._buildNumericChartData(paramRecords);
                const uslData = Array(labels.length).fill(spec.usl);
                const lslData = spec.lsl !== null ? Array(labels.length).fill(spec.lsl) : [];

                chart.data.labels = labels;
                chart.data.datasets[0].data = values;
                chart.data.datasets[0].pointBackgroundColor = setupTypes.map(t => DashboardUI._setupTypeColor(t));
                chart.data.datasets[0].pointBorderColor = setupTypes.map(t => DashboardUI._setupTypeColor(t));
                chart.data.datasets[0].pointRadius = setupTypes.map(t => t ? 5 : 3);
                chart.data.datasets[0].borderColor = 'rgb(59, 130, 246)';
                chart.data.datasets[1].data = uslData;
                chart.data.datasets[2].data = lslData;

                if (spec.lsl !== null) {
                    const range = spec.usl - spec.lsl;
                    chart.options.scales.y.suggestedMin = spec.lsl - (range * 0.3);
                    chart.options.scales.y.suggestedMax = spec.usl + (range * 0.3);
                } else {
                    const validVals = values.filter(v => v !== null);
                    const minData = validVals.length > 0 ? Math.min(...validVals) : 0;
                    chart.options.scales.y.suggestedMin = Math.max(minData - 1, 0);
                    chart.options.scales.y.suggestedMax = spec.usl + (spec.usl * 0.05);
                }

                chart.update();

                // เก็บ state สำหรับ drill-down
                const isoSet = new Set(paramRecords.map(r => StatUtils.prodDateISO(r.timestamp)));
                chart._allRecords = paramRecords;
                chart._spec = spec;
                chart._isMultiDay = isoSet.size > 1;
                chart._isDrilling = false;
                document.getElementById(`chart-wrapper-${key}`)?.querySelector('.drilldown-badge')?.remove();
            }
        }
    }

    // Drill-down: คลิกจุดข้อมูลในมุมมองหลายวัน → ซูมเข้าแสดงรายเวลาของวันนั้น
    _handleNumericChartClick(key, elements) {
        const chart = this.chartInstances[key];
        if (!chart || !chart._isMultiDay || chart._isDrilling) return;

        // สร้าง grouped map วันผลิต (08:00-07:59) → records[]
        const grouped = {};
        (chart._allRecords || []).forEach(r => {
            const iso = StatUtils.prodDateISO(r.timestamp);
            if (!iso || iso === '?') return;
            if (!grouped[iso]) grouped[iso] = [];
            grouped[iso].push(r);
        });
        const sortedDays = Object.keys(grouped).sort();
        const clickedISO = sortedDays[elements[0].index];
        if (!clickedISO) return;

        // สร้าง time-series สำหรับวันที่คลิก
        const dayRecords = grouped[clickedISO];
        const rawLabels = dayRecords.map(r => {
            const parts = String(r.timestamp).replace(',', '').trim().split(' ');
            return (parts[1] || '').substring(0, 5);
        });
        const rawValues = dayRecords.map(r => parseFloat(r.value));
        const rawSetupTypes = dayRecords.map(r => r.setupType || '');
        const labels = rawLabels.length === 1 ? ['', ...rawLabels] : rawLabels;
        const values = rawValues.length === 1 ? [null, ...rawValues] : rawValues;
        const setupTypes = rawSetupTypes.length === 1 ? ['', ...rawSetupTypes] : rawSetupTypes;

        // หา shift และ slots สำหรับวันที่คลิก
        const shift = this._getShift(rawLabels.find(t => /^\d{2}:\d{2}$/.test(t)));
        const slots = shift.slots;
        const isNight = shift === SAMPLING_SCHEDULE.night;
        chart._samplingSlots = slots;
        chart._isNightShift = isNight;
        chart._shiftBreaks = shift.breaks || [];

        const spec = chart._spec;
        chart.data.labels = labels;
        chart.data.datasets[0].data = values;
        chart.data.datasets[0].pointBackgroundColor = setupTypes.map(t => DashboardUI._setupTypeColor(t));
        chart.data.datasets[0].pointBorderColor = setupTypes.map(t => DashboardUI._setupTypeColor(t));
        chart.data.datasets[0].pointRadius = setupTypes.map(t => t ? 5 : 3);
        chart.data.datasets[0].borderColor = 'rgb(59, 130, 246)';
        chart.data.datasets[1].data = Array(labels.length).fill(spec.usl);
        chart.data.datasets[2].data = spec.lsl !== null ? Array(labels.length).fill(spec.lsl) : [];
        chart.options.scales.x.ticks.maxRotation = 0;
        chart._isDrilling = true;
        chart.update();

        const [y, m, d] = clickedISO.split('-');
        this._showDrillDownBadge(key, `${parseInt(d)}/${parseInt(m)}/${y}`, slots, rawLabels, isNight, shift.breaks || []);
    }

    _getShift(firstTimeHHMM) {
        if (!firstTimeHHMM) return SAMPLING_SCHEDULE.night;
        const m = String(firstTimeHHMM).match(/^(\d{2}):(\d{2})$/);
        if (!m) return SAMPLING_SCHEDULE.night;
        const mins = +m[1] * 60 + +m[2];
        return (mins >= 481 && mins < 1201) ? SAMPLING_SCHEDULE.day : SAMPLING_SCHEDULE.night;
    }

    _showDrillDownBadge(key, dateLabel, slots = [], recordTimes = [], isNight = false, breaks = []) {
        const wrapper = document.getElementById(`chart-wrapper-${key}`);
        if (!wrapper) return;
        wrapper.querySelector('.drilldown-badge')?.remove();

        // สร้าง compliance badges สำหรับแต่ละ slot
        const toMins = t => {
            const m = String(t || '').match(/^(\d{2}):(\d{2})$/);
            if (!m) return -1;
            let v = +m[1] * 60 + +m[2];
            if (isNight && v < 720) v += 1440;
            return v;
        };
        const recMins = recordTimes.map(toMins).filter(v => v >= 0);
        const slotBadgesHtml = slots.map(slot => {
            const sm = toMins(slot);
            const covered = recMins.some(rm => Math.abs(rm - sm) <= 45);
            const cls = covered
                ? 'bg-green-100 text-green-700'
                : 'bg-red-100 text-red-600';
            return `<span class="text-xs ${cls} px-1.5 py-0.5 rounded font-medium">${slot} ${covered ? '✓' : '✗'}</span>`;
        }).join('');

        const breakBadgesHtml = breaks.map(([s, e]) =>
            `<span class="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-medium">${s}–${e}</span>`
        ).join('');

        const badge = document.createElement('div');
        badge.className = 'drilldown-badge flex flex-col gap-1.5 mt-2 pt-2 border-t';
        badge.innerHTML = `
            <div class="flex items-center justify-between">
                <span class="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-semibold">📅 ${dateLabel}</span>
                <button class="drillback-btn text-xs text-gray-500 hover:text-blue-600 font-medium transition-colors">← ภาพรวม</button>
            </div>
            ${slots.length ? `<div class="flex flex-wrap gap-1 items-center">
                <span class="text-xs text-gray-400">สุ่มตัวอย่าง:</span>${slotBadgesHtml}
            </div>` : ''}
            ${breaks.length ? `<div class="flex flex-wrap gap-1 items-center">
                <span class="text-xs text-gray-400">ช่วงพัก:</span>${breakBadgesHtml}
            </div>` : ''}
        `;
        wrapper.appendChild(badge);
        badge.querySelector('.drillback-btn').onclick = () => this._resetChartDrillDown(key);
    }

    _resetChartDrillDown(key) {
        const chart = this.chartInstances[key];
        if (!chart) return;
        const { labels, values, setupTypes } = DashboardUI._buildNumericChartData(chart._allRecords || []);
        const spec = chart._spec;
        chart.data.labels = labels;
        chart.data.datasets[0].data = values;
        chart.data.datasets[0].pointBackgroundColor = setupTypes.map(t => DashboardUI._setupTypeColor(t));
        chart.data.datasets[0].pointBorderColor = setupTypes.map(t => DashboardUI._setupTypeColor(t));
        chart.data.datasets[0].pointRadius = setupTypes.map(t => t ? 5 : 3);
        chart.data.datasets[0].borderColor = 'rgb(59, 130, 246)';
        chart.data.datasets[1].data = Array(labels.length).fill(spec.usl);
        chart.data.datasets[2].data = spec.lsl !== null ? Array(labels.length).fill(spec.lsl) : [];
        chart.options.scales.x.ticks.maxRotation = 45;
        chart._isDrilling = false;
        chart._samplingSlots = [];
        chart._isNightShift = false;
        chart._shiftBreaks = [];
        chart.update();
        document.getElementById(`chart-wrapper-${key}`)?.querySelector('.drilldown-badge')?.remove();
    }

    // สร้าง labels + values สำหรับ numeric chart แบบ smart:
    // - ถ้าข้ามวัน → group รายวัน (daily mean)
    // - ถ้าวันเดียวกัน → แสดงรายครั้งพร้อม label เวลา
    static _prioritySetupType(types) {
        if (types.includes('out_of_spec')) return 'out_of_spec';
        if (types.includes('roll_change')) return 'roll_change';
        return '';
    }

    static _buildNumericChartData(records) {
        if (records.length === 0) {
            return { labels: ['(ว่าง)', '(รอข้อมูล)'], values: [null, null], setupTypes: ['', ''] };
        }

        // ตรวจสอบว่าข้ามวันผลิต (08:00-07:59) หรือไม่
        const isoSet = new Set(records.map(r => StatUtils.prodDateISO(r.timestamp)));
        const spansMultipleDays = isoSet.size > 1;

        const _prioritySetupType = (types) => {
            if (types.includes('out_of_spec')) return 'out_of_spec';
            if (types.includes('roll_change')) return 'roll_change';
            return '';
        };

        if (spansMultipleDays) {
            // กลุ่มรายวันผลิต: คำนวณค่าเฉลี่ยต่อวัน
            const grouped = {};
            records.forEach(r => {
                const d = StatUtils.parseThaiDate(r.timestamp);
                const key = d ? StatUtils.dateToISO(d) : '?';
                if (!grouped[key]) grouped[key] = { values: [], setupTypes: [] };
                const v = parseFloat(r.value);
                if (!isNaN(v)) grouped[key].values.push(v);
                grouped[key].setupTypes.push(r.setupType || '');
            });

            const sortedDays = Object.keys(grouped).filter(k => k !== '?').sort();
            const labels = sortedDays.map(iso => {
                const [, m, d] = iso.split('-');
                return `${parseInt(d)}/${parseInt(m)}`;
            });
            const values = sortedDays.map(day => {
                const arr = grouped[day].values;
                return arr.length > 0 ? parseFloat(StatUtils.mean(arr).toFixed(3)) : null;
            });
            const setupTypes = sortedDays.map(day => DashboardUI._prioritySetupType(grouped[day].setupTypes));

            if (values.length === 1) {
                return { labels: ['เริ่มต้น', ...labels], values: [null, ...values], setupTypes: ['', ...setupTypes] };
            }
            return { labels, values, setupTypes };
        } else {
            // รายครั้ง: แสดง HH:MM พร้อมข้อมูลล่าสุด 30 จุด
            const displayRecords = records.slice(-30);
            const labels = displayRecords.map(r => {
                const timePart = String(r.timestamp).replace(',', '').trim().split(' ')[1] || r.timestamp;
                return timePart.substring(0, 5); // HH:MM
            });
            const values = displayRecords.map(r => parseFloat(r.value));
            const setupTypes = displayRecords.map(r => r.setupType || '');

            if (displayRecords.length === 1) {
                return { labels: ['เริ่มต้น', ...labels], values: [null, ...values], setupTypes: ['', ...setupTypes] };
            }
            return { labels, values, setupTypes };
        }
    }

    highlightChart(paramKey, shouldScroll = false) {
        document.querySelectorAll('[id^="chart-wrapper-"]').forEach(el => {
            el.classList.remove('border-blue-500', 'ring-4', 'ring-blue-200', 'shadow-lg');
            el.classList.add('border', 'shadow-sm');
        });

        const activeWrapper = document.getElementById(`chart-wrapper-${paramKey}`);
        if (activeWrapper) {
            activeWrapper.classList.remove('border', 'shadow-sm');
            activeWrapper.classList.add('border-blue-500', 'ring-4', 'ring-blue-200', 'shadow-lg');

            if (shouldScroll) {
                setTimeout(() => {
                    activeWrapper.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 100);
            }
        }
    }

    renderTable(dataRecords, currentConfig) {
        if (!this.elements.tbody) return;
        this.elements.tbody.innerHTML = '';

        if (dataRecords.length === 0) {
            this.elements.tbody.innerHTML = '<tr><td colspan="4" class="px-2 py-4 text-center text-gray-400">ยังไม่มีข้อมูลสำหรับพารามิเตอร์นี้</td></tr>';
            return;
        }

        const recent = [...dataRecords].reverse().slice(0, 10);

        recent.forEach(r => {
            let displayValue, valColor;

            if (currentConfig.type === 'gauge') {
                const isPass = String(r.value).toUpperCase() === 'PASS';
                displayValue = isPass ? '✓ ผ่าน' : '✗ ไม่ผ่าน';
                valColor = isPass ? 'text-green-600 font-bold' : 'text-red-600 font-bold';
            } else {
                const numVal = parseFloat(r.value);
                let isOut = false;
                if (currentConfig.usl !== null && numVal > currentConfig.usl) isOut = true;
                if (currentConfig.lsl !== null && numVal < currentConfig.lsl) isOut = true;
                displayValue = numVal.toFixed(3);
                valColor = isOut ? 'text-red-600 font-bold' : 'text-gray-800';
            }

            const tr = document.createElement('tr');
            tr.className = "border-b hover:bg-gray-50";
            tr.innerHTML = `
                <td class="px-2 py-2">${r.timestamp.split(' ')[1] || r.timestamp}</td>
                <td class="px-2 py-2">${r.machine ? r.machine.split('-')[1] || r.machine : ''}</td>
                <td class="px-2 py-2 truncate max-w-[80px]">${r.operator ? r.operator.split(' ')[0] : ''}</td>
                <td class="px-2 py-2 text-right ${valColor}">${displayValue}</td>
            `;
            this.elements.tbody.appendChild(tr);
        });
    }

    renderKPIs(dataRecords, currentConfig) {
        if (currentConfig.type === 'gauge') {
            this._renderGaugeKPIs(dataRecords);
        } else {
            this._renderNumericKPIs(dataRecords, currentConfig);
        }
    }

    _renderGaugeKPIs(dataRecords) {
        const total = dataRecords.length;
        const passCount = dataRecords.filter(r => String(r.value).toUpperCase() === 'PASS').length;
        const failCount = total - passCount;
        const passRate = total > 0 ? ((passCount / total) * 100).toFixed(1) : '-';

        // KPI Card 1: n
        this.elements.kpiCount.innerText = total;

        // KPI Card 2: จำนวนผ่าน
        this.elements.kpiMeanLabel.innerText = 'จำนวนผ่าน ✓';
        this.elements.kpiMean.innerText = passCount;
        this.elements.kpiMean.className = 'text-2xl font-bold text-green-600';

        // KPI Card 3: จำนวนไม่ผ่าน
        this.elements.kpiCpLabel.innerText = 'จำนวนไม่ผ่าน ✗';
        this.elements.kpiCp.innerText = failCount;
        this.elements.kpiCp.className = failCount > 0 ? 'text-2xl font-bold text-red-600' : 'text-2xl font-bold text-gray-400';

        // KPI Card 4: Pass Rate
        this.elements.kpiCpkLabel.innerText = 'Pass Rate (%)';
        this.elements.kpiCpk.innerText = passRate === '-' ? '-' : `${passRate}%`;

        this.elements.kpiCpkCard.className = 'p-4 rounded-xl shadow-sm border text-center transition-colors ';
        if (passRate === '-') {
            this.elements.kpiCpkCard.classList.add('bg-gray-50', 'border-gray-200');
        } else {
            const rate = parseFloat(passRate);
            if (rate >= 95) this.elements.kpiCpkCard.classList.add('bg-green-100', 'border-green-300');
            else if (rate >= 80) this.elements.kpiCpkCard.classList.add('bg-yellow-100', 'border-yellow-300');
            else this.elements.kpiCpkCard.classList.add('bg-red-100', 'border-red-300');
        }
    }

    _renderNumericKPIs(dataRecords, currentConfig) {
        // Reset labels to default numeric
        this.elements.kpiMeanLabel.innerText = 'ค่าเฉลี่ย (Mean)';
        this.elements.kpiMean.className = 'text-2xl font-bold text-gray-800';
        this.elements.kpiCpLabel.innerText = 'Cp';
        this.elements.kpiCp.className = 'text-2xl font-bold text-blue-600';
        this.elements.kpiCpkLabel.innerText = 'Cpk';

        const values = dataRecords.map(r => parseFloat(r.value)).filter(v => !isNaN(v));
        this.elements.kpiCount.innerText = values.length;

        if (values.length >= 2) {
            const stats = StatUtils.calculateCapability(values, currentConfig.usl, currentConfig.lsl);
            this.elements.kpiMean.innerText = stats.mean;
            this.elements.kpiCp.innerText = stats.cp;
            this.elements.kpiCpk.innerText = stats.cpk;

            this.elements.kpiCpkCard.className = 'p-4 rounded-xl shadow-sm border text-center transition-colors ';

            if (stats.cpk === "-") {
                this.elements.kpiCpkCard.classList.add('bg-gray-50', 'border-gray-200');
            } else {
                const cpkVal = parseFloat(stats.cpk);
                if (cpkVal < 1.0) this.elements.kpiCpkCard.classList.add('bg-red-100', 'border-red-300');
                else if (cpkVal < 1.33) this.elements.kpiCpkCard.classList.add('bg-yellow-100', 'border-yellow-300');
                else this.elements.kpiCpkCard.classList.add('bg-green-100', 'border-green-300');
            }
        } else {
            this.elements.kpiMean.innerText = "-";
            this.elements.kpiCp.innerText = "-";
            this.elements.kpiCpk.innerText = "-";
            this.elements.kpiCpkCard.className = 'bg-white p-4 rounded-xl shadow-sm border border-gray-200 text-center transition-colors';
        }
    }
}

// -----------------------------------------------------
// 5. CONTROLLER (Application Logic)
// -----------------------------------------------------
class AppController {
    constructor(dbService, uiService) {
        this.db = dbService;
        this.ui = uiService;
        this.currentConfig = { target: 0, usl: 0, lsl: 0, name: '' };
        this.machineAssignments = {};
        this.activeDatePreset = -1; // -1 = ทั้งหมด
    }

    _resetSetupType() {
        document.getElementById('setup-type-value').value = '';
        document.querySelectorAll('.setup-type-btn').forEach(btn => {
            const t = btn.dataset.setupType;
            if (t === '') {
                btn.className = 'setup-type-btn py-2 px-2 rounded-lg border-2 font-bold text-xs border-blue-500 bg-blue-50 text-blue-700 transition-colors';
            } else if (t === 'roll_change') {
                btn.className = 'setup-type-btn py-2 px-2 rounded-lg border-2 font-bold text-xs border-gray-300 text-gray-500 hover:border-orange-400 hover:text-orange-600 hover:bg-orange-50 transition-colors';
            } else if (t === 'out_of_spec') {
                btn.className = 'setup-type-btn py-2 px-2 rounded-lg border-2 font-bold text-xs border-gray-300 text-gray-500 hover:border-purple-500 hover:text-purple-600 hover:bg-purple-50 transition-colors';
            }
        });
    }

    // ---- Date Filter Helpers ----

    _filterByDateRange(records) {
        const fromVal = document.getElementById('date-from')?.value;
        const toVal = document.getElementById('date-to')?.value;
        if (!fromVal && !toVal) return records;

        // ตัดวันตาม shift การผลิต: 08:00 ของวัน X → 07:59:59 ของวัน X+1
        let rangeStart = null, rangeEnd = null;
        if (fromVal) {
            const [fy, fm, fd] = fromVal.split('-').map(Number);
            rangeStart = new Date(fy, fm - 1, fd, 8, 0, 0); // 08:00 น. ของวันเริ่ม
        }
        if (toVal) {
            const [ty, tm, td] = toVal.split('-').map(Number);
            // สิ้นสุด 07:59:59 ของวันถัดจาก toVal (= วัน toVal+1 เวลา 07:59:59)
            rangeEnd = new Date(ty, tm - 1, td + 1, 7, 59, 59);
        }

        return records.filter(r => {
            const dt = StatUtils.parseThaiDateTime(r.timestamp);
            if (!dt) return true;
            if (rangeStart && dt < rangeStart) return false;
            if (rangeEnd && dt > rangeEnd) return false;
            return true;
        });
    }

    _setDatePreset(days) {
        this.activeDatePreset = days;
        const dateFrom = document.getElementById('date-from');
        const dateTo = document.getElementById('date-to');
        const now = new Date();

        // วันผลิตเริ่ม 08:00 — ก่อน 08:00 ยังนับเป็น shift เมื่อวาน
        const productionToday = new Date(now);
        if (now.getHours() < 8) {
            productionToday.setDate(productionToday.getDate() - 1);
        }
        const toISO = StatUtils.dateToISO(productionToday);

        if (days === -1) {
            dateFrom.value = '';
            dateTo.value = '';
        } else if (days === 0) {
            dateFrom.value = toISO;
            dateTo.value = toISO;
        } else {
            const fromDate = new Date(productionToday);
            fromDate.setDate(productionToday.getDate() - days + 1);
            dateFrom.value = StatUtils.dateToISO(fromDate);
            dateTo.value = toISO;
        }

        this._updatePresetUI();
        this.refreshDashboard(false, false);
    }

    _updatePresetUI() {
        document.querySelectorAll('.date-preset-btn').forEach(btn => {
            const days = parseInt(btn.dataset.days);
            if (days === this.activeDatePreset) {
                btn.className = 'date-preset-btn px-3 py-1 text-xs rounded-full border font-medium transition-colors bg-blue-600 text-white border-blue-600';
            } else {
                btn.className = 'date-preset-btn px-3 py-1 text-xs rounded-full border font-medium transition-colors border-gray-300 text-gray-600 hover:bg-gray-100';
            }
        });
    }

    async init() {
        this.bindEvents();

        this.ui.setStatus("กำลังเชื่อมต่อและโหลดข้อมูล...", "text-yellow-400");
        this.ui.setLoadingState(true);

        const masterData = await this.db.getMasterData();
        this.machineAssignments = masterData.machineAssignments || {};

        this.ui.populateOperators(masterData.operators || []);
        this.ui.populateMachines(this.machineAssignments);
        this.ui.populateParts(PART_SPECS);

        if (Object.keys(this.machineAssignments).length > 0) {
            this.ui.elements.machineSelect.selectedIndex = 1;
            this.handleMachineChange();
        }

        await this.refreshDashboard(false, false);

        this.ui.setLoadingState(false);
        const dbName = AppConfig.USE_GOOGLE_SHEET ? "Google Sheets (เชื่อมต่อแล้ว)" : "In-Memory (ทดสอบ)";
        const pendingCount = this.db.pendingQueue ? this.db.pendingQueue.length : 0;
        this.updateHeaderStatus(dbName, pendingCount);
    }

    updateHeaderStatus(dbName, pendingCount) {
        if (pendingCount > 0) {
            this.ui.setStatus(`${dbName} ⏳ รออัปโหลด: ${pendingCount}`, "text-yellow-500 font-bold");
        } else {
            this.ui.setStatus(dbName, "text-green-400");
        }
    }

    bindEvents() {
        this.ui.elements.machineSelect.addEventListener('change', () => this.handleMachineChange());
        this.ui.elements.partSelect.addEventListener('change', () => this.handlePartChange());
        this.ui.elements.paramSelect.addEventListener('change', () => this.handleParamChange());
        document.getElementById('data-form').addEventListener('submit', (e) => this.handleSubmit(e));
        document.getElementById('add-value-btn').addEventListener('click', () => this.addMeasuredValueRow());

        // Gauge buttons — event delegation ต่อแถว
        const gaugeBase = 'flex-1 py-2 px-3 rounded-lg border-2 font-bold text-sm transition-colors';
        document.getElementById('gauge-input-section').addEventListener('click', (e) => {
            const row = e.target.closest('[data-gauge-row]');
            if (!row) return;
            const resultInput = row.querySelector('.gauge-result-input');
            const passBtn = row.querySelector('.gauge-pass-btn');
            const failBtn = row.querySelector('.gauge-fail-btn');
            if (e.target.closest('.gauge-pass-btn')) {
                resultInput.value = 'PASS';
                passBtn.className = `gauge-pass-btn ${gaugeBase} border-green-500 bg-green-50 text-green-700`;
                failBtn.className = `gauge-fail-btn ${gaugeBase} border-gray-300 text-gray-500 hover:border-red-500 hover:text-red-600 hover:bg-red-50`;
            } else if (e.target.closest('.gauge-fail-btn')) {
                resultInput.value = 'FAIL';
                failBtn.className = `gauge-fail-btn ${gaugeBase} border-red-500 bg-red-50 text-red-700`;
                passBtn.className = `gauge-pass-btn ${gaugeBase} border-gray-300 text-gray-500 hover:border-green-500 hover:text-green-600 hover:bg-green-50`;
            }
        });

        // Setup type buttons
        document.querySelectorAll('.setup-type-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const type = btn.dataset.setupType;
                document.getElementById('setup-type-value').value = type;
                document.querySelectorAll('.setup-type-btn').forEach(b => {
                    const t = b.dataset.setupType;
                    if (t === '') b.className = 'setup-type-btn py-2 px-2 rounded-lg border-2 font-bold text-xs border-gray-300 text-gray-500 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-colors';
                    else if (t === 'roll_change') b.className = 'setup-type-btn py-2 px-2 rounded-lg border-2 font-bold text-xs border-gray-300 text-gray-500 hover:border-orange-400 hover:text-orange-600 hover:bg-orange-50 transition-colors';
                    else b.className = 'setup-type-btn py-2 px-2 rounded-lg border-2 font-bold text-xs border-gray-300 text-gray-500 hover:border-purple-500 hover:text-purple-600 hover:bg-purple-50 transition-colors';
                });
                if (type === '') btn.className = 'setup-type-btn py-2 px-2 rounded-lg border-2 font-bold text-xs border-blue-500 bg-blue-50 text-blue-700 transition-colors';
                else if (type === 'roll_change') btn.className = 'setup-type-btn py-2 px-2 rounded-lg border-2 font-bold text-xs border-orange-500 bg-orange-50 text-orange-700 transition-colors';
                else btn.className = 'setup-type-btn py-2 px-2 rounded-lg border-2 font-bold text-xs border-purple-500 bg-purple-50 text-purple-700 transition-colors';
            });
        });

        // Date range filter — preset buttons ค้นหาทันที
        document.querySelectorAll('.date-preset-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const days = parseInt(btn.dataset.days);
                this._setDatePreset(days);
            });
        });

        // เปลี่ยนวันด้วยมือ → ยกเลิก preset highlight แต่ยังไม่ค้นหา (รอกด ค้นหา)
        document.getElementById('date-from').addEventListener('change', () => {
            this.activeDatePreset = null;
            this._updatePresetUI();
        });

        document.getElementById('date-to').addEventListener('change', () => {
            this.activeDatePreset = null;
            this._updatePresetUI();
        });

        // ปุ่มค้นหา (date range manual)
        document.getElementById('date-search-btn').addEventListener('click', () => {
            this.refreshDashboard(false, false);
        });

        // Enter ใน date inputs ก็ค้นหาได้
        ['date-from', 'date-to'].forEach(id => {
            document.getElementById(id).addEventListener('keydown', (e) => {
                if (e.key === 'Enter') this.refreshDashboard(false, false);
            });
        });

        // Setup type buttons
        document.querySelectorAll('.setup-type-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const type = btn.dataset.setupType;
                document.getElementById('setup-type-value').value = type;
                document.querySelectorAll('.setup-type-btn').forEach(b => {
                    const t = b.dataset.setupType;
                    if (t === '') {
                        b.className = 'setup-type-btn py-2 px-2 rounded-lg border-2 font-bold text-xs border-gray-300 text-gray-500 hover:border-blue-500 hover:text-blue-700 hover:bg-blue-50 transition-colors';
                    } else if (t === 'roll_change') {
                        b.className = 'setup-type-btn py-2 px-2 rounded-lg border-2 font-bold text-xs border-gray-300 text-gray-500 hover:border-orange-400 hover:text-orange-600 hover:bg-orange-50 transition-colors';
                    } else if (t === 'out_of_spec') {
                        b.className = 'setup-type-btn py-2 px-2 rounded-lg border-2 font-bold text-xs border-gray-300 text-gray-500 hover:border-purple-500 hover:text-purple-600 hover:bg-purple-50 transition-colors';
                    }
                });
                if (type === '') {
                    btn.className = 'setup-type-btn py-2 px-2 rounded-lg border-2 font-bold text-xs border-blue-500 bg-blue-50 text-blue-700 transition-colors';
                } else if (type === 'roll_change') {
                    btn.className = 'setup-type-btn py-2 px-2 rounded-lg border-2 font-bold text-xs border-orange-400 bg-orange-50 text-orange-600 transition-colors';
                } else if (type === 'out_of_spec') {
                    btn.className = 'setup-type-btn py-2 px-2 rounded-lg border-2 font-bold text-xs border-purple-500 bg-purple-50 text-purple-600 transition-colors';
                }
            });
        });
    }

    addMeasuredValueRow() {
        const container = this.ui.elements.measuredContainer;
        const index = container.children.length + 1;
        const row = document.createElement('div');
        row.className = 'flex items-center gap-2';
        row.innerHTML = `
            <span class="text-xs text-gray-400 w-5 text-right shrink-0">${index}.</span>
            <input type="number" step="0.001" placeholder="ชิ้นที่ ${index}..." class="measured-value-input flex-1 p-2 border border-gray-300 rounded-lg text-lg focus:ring-blue-500 focus:border-blue-500">
            <button type="button" class="remove-value-btn text-gray-400 hover:text-red-500 shrink-0" title="ลบ">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
            </button>
        `;
        row.querySelector('.remove-value-btn').addEventListener('click', () => {
            container.removeChild(row);
            this.renumberMeasuredRows();
        });
        container.appendChild(row);
        row.querySelector('input').focus();
    }

    renumberMeasuredRows() {
        const container = this.ui.elements.measuredContainer;
        container.querySelectorAll('span').forEach((span, i) => {
            span.textContent = `${i + 1}.`;
        });
        container.querySelectorAll('.measured-value-input').forEach((input, i) => {
            input.placeholder = `ชิ้นที่ ${i + 1}...`;
        });
    }

    handleMachineChange() {
        const machine = this.ui.elements.machineSelect.value;
        if (this.machineAssignments[machine]) {
            this.ui.elements.partSelect.value = this.machineAssignments[machine];
        }
        this.handlePartChange();
    }

    handlePartChange() {
        const part = this.ui.elements.partSelect.value;
        const specs = PART_SPECS[part];

        if (specs) {
            this.ui.setupAllCharts(part, specs);
            this.ui.renderParameterOptions(specs);
            this.handleParamChange();
        } else {
            this.ui.elements.paramSelect.innerHTML = '<option value="">-- กรุณาเลือกรุ่นชิ้นงาน --</option>';
            this.ui.elements.specDisplay.innerHTML = '';
            if (this.ui.elements.chartsContainer) this.ui.elements.chartsContainer.innerHTML = '';
        }
    }

    handleParamChange() {
        const part = this.ui.elements.partSelect.value;
        const param = this.ui.elements.paramSelect.value;

        if (!param || !PART_SPECS[part]?.[param]) return;

        const spec = PART_SPECS[part][param];
        this.currentConfig = { target: spec.target, usl: spec.usl, lsl: spec.lsl, name: spec.name, type: spec.type };

        this.ui.updateSpecInfo(spec);
        this.ui.setGaugeMode(spec.type === 'gauge');
        this.ui.clearInput();
        this.refreshDashboard(true, true);
    }

    _resetSetupType() {
        document.getElementById('setup-type-value').value = '';
        document.querySelectorAll('.setup-type-btn').forEach(btn => {
            const t = btn.dataset.setupType;
            if (t === '') btn.className = 'setup-type-btn py-2 px-2 rounded-lg border-2 font-bold text-xs border-blue-500 bg-blue-50 text-blue-700 transition-colors';
            else if (t === 'roll_change') btn.className = 'setup-type-btn py-2 px-2 rounded-lg border-2 font-bold text-xs border-gray-300 text-gray-500 hover:border-orange-400 hover:text-orange-600 hover:bg-orange-50 transition-colors';
            else btn.className = 'setup-type-btn py-2 px-2 rounded-lg border-2 font-bold text-xs border-gray-300 text-gray-500 hover:border-purple-500 hover:text-purple-600 hover:bg-purple-50 transition-colors';
        });
    }

    async handleSubmit(e) {
        e.preventDefault();

        const part = this.ui.elements.partSelect.value;
        const param = this.ui.elements.paramSelect.value;
        const spec = PART_SPECS[part]?.[param];

        if (spec?.type === 'gauge') {
            // Gauge: บันทึก PASS/FAIL ทั้ง 3 แถว
            const gaugeResults = this.ui.getGaugeSelection();
            if (gaugeResults.length < 3) {
                alert('กรุณาเลือกผลการตรวจสอบทั้ง 3 ชิ้น');
                return;
            }

            const base = {
                machine: document.getElementById('machine-id').value,
                part,
                parameter: param,
                operator: document.getElementById('operator').value,
                setupType: document.getElementById('setup-type-value').value
            };

            this.ui.setLoadingState(true);
            for (const value of gaugeResults) {
                await this.db.save({ ...base, value });
            }
            this.ui.setLoadingState(false);

            this.ui.resetGaugeSelection();
            this._resetSetupType();
            this.refreshDashboard(true, true);
            return;
        }

        // Numeric: บันทึกค่าที่วัดได้หลายค่า
        const values = this.ui.getMeasuredValues();

        if (values.length < 3) {
            alert('กรุณากรอกค่าที่วัดได้อย่างน้อย 3 ค่า (งาน 3 ชิ้น)');
            return;
        }

        const base = {
            machine: document.getElementById('machine-id').value,
            part,
            parameter: param,
            operator: document.getElementById('operator').value,
            setupType: document.getElementById('setup-type-value').value
        };

        const specName = this.currentConfig.name?.split(':')[0] || param;
        this.ui.validateAndWarn(values, param, this.currentConfig, PART_SPECS[part], specName, async () => {
            this.ui.setLoadingState(true);
            for (const value of values) {
                await this.db.save({ ...base, value });
            }
            this.ui.setLoadingState(false);
            this.ui.clearInput();
            this._resetSetupType();
            this.refreshDashboard(true, true);
        });
        return;
    }

    _setSearchLoading(isLoading) {
        const bar   = document.getElementById('dashboard-loading-bar');
        const icon  = document.getElementById('date-search-icon');
        const spin  = document.getElementById('date-search-spinner');
        const label = document.getElementById('date-search-label');
        const btn   = document.getElementById('date-search-btn');
        if (isLoading) {
            bar?.classList.remove('hidden');
            icon?.classList.add('hidden');
            spin?.classList.remove('hidden');
            if (label) label.innerText = 'กำลังค้นหา...';
            if (btn)   btn.disabled = true;
        } else {
            bar?.classList.add('hidden');
            icon?.classList.remove('hidden');
            spin?.classList.add('hidden');
            if (label) label.innerText = 'ค้นหา';
            if (btn)   btn.disabled = false;
        }
    }

    async refreshDashboard(shouldScrollToChart = false, useLocalCache = false) {
        const t0 = performance.now();
        this._setSearchLoading(true);

        // เริ่มนับเวลาที่แสดงใน loading bar
        const elapsedEl = document.getElementById('dashboard-loading-elapsed');
        const ticker = setInterval(() => {
            if (elapsedEl) elapsedEl.innerText = `${((performance.now() - t0) / 1000).toFixed(1)} วิ`;
        }, 100);

        let allRecords;
        try {
        if (useLocalCache && this.db.getLocalData) {
            allRecords = this.db.getLocalData();
        } else {
            allRecords = await this.db.getAll();
        }

        const machine = this.ui.elements.machineSelect.value;
        const part = this.ui.elements.partSelect.value;
        const param = this.ui.elements.paramSelect.value;

        if (!part || !PART_SPECS[part]) return;

        // กรองตามเครื่องจักรและช่วงวันที่
        const machineRecords = machine ? allRecords.filter(r => r.machine === machine) : allRecords;
        const dateFilteredRecords = this._filterByDateRange(machineRecords);

        this.ui.updateAllCharts(dateFilteredRecords, part, PART_SPECS[part]);

        if (!param) {
            // ซ่อน image panel เมื่อยังไม่ได้เลือก parameter
            this.ui.clearImagePanel();
            clearInterval(ticker);
            const elapsed = ((performance.now() - t0) / 1000).toFixed(2);
            if (elapsedEl) elapsedEl.innerText = `✓ ${elapsed} วิ`;
            setTimeout(() => this._setSearchLoading(false), 600);
            return;
        }

        this.ui.highlightChart(param, shouldScrollToChart);

        const filteredRecords = dateFilteredRecords.filter(r => r.part === part && r.parameter === param);
        this.ui.renderTable(filteredRecords, this.currentConfig);
        this.ui.renderKPIs(filteredRecords, this.currentConfig);
        this.ui.renderBellCurve(filteredRecords, this.currentConfig, part);

        } catch (err) {
            console.error('refreshDashboard error:', err);
        } finally {
            clearInterval(ticker);
            const elapsed = ((performance.now() - t0) / 1000).toFixed(2);
            const loadText = document.getElementById('dashboard-loading-text');
            if (loadText) loadText.innerText = `ค้นหาเสร็จแล้ว`;
            if (elapsedEl) elapsedEl.innerText = `✓ ${elapsed} วิ`;
            setTimeout(() => this._setSearchLoading(false), 800);
        }
    }
}

// -----------------------------------------------------
// 6. BOOTSTRAP / ENTRY POINT
// -----------------------------------------------------
window.onload = () => {
    const uiService = new DashboardUI();
    let appInstance = null;

    const syncStatusCallback = (pendingCount) => {
        if (appInstance) {
            const dbName = AppConfig.USE_GOOGLE_SHEET ? "Google Sheets (เชื่อมต่อแล้ว)" : "In-Memory (ทดสอบ)";
            appInstance.updateHeaderStatus(dbName, pendingCount);
        }
    };

    const databaseService = AppConfig.USE_GOOGLE_SHEET
        ? new GoogleSheetService(AppConfig.GOOGLE_SHEET_URL, syncStatusCallback)
        : new InMemoryService();

    appInstance = new AppController(databaseService, uiService);
    appInstance.init();
};
