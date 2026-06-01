// -----------------------------------------------------
// 1. CONFIGURATION & MASTER DATA
// -----------------------------------------------------
const AppConfig = {
    // ⚠️ นำ Web App URL ที่ได้จากการกด Deploy ใน Apps Script ของคุณมาใส่ตรงนี้
    GOOGLE_SHEET_URL: "https://script.google.com/macros/s/AKfycbwjG6lo8DGi1bX_jWvCQ1cFZYGXEL8nzkm91_HQi21QqhsWgovG6RFTEF_sDpcW3oor/exec",
    USE_GOOGLE_SHEET: true // เปลี่ยนเป็น false หากต้องการทดสอบแบบ In-Memory โดยไม่ต่อเน็ต
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

// ตั้งค่า path หรือ URL ของรูปภาพแสดงตำแหน่งวัดแต่ละ Item
// ใส่ path ไฟล์ภาพ เช่น "images/item2.jpg" หรือ URL เว็บไซต์
// หากไม่มีรูปภาพให้ใส่ "" (ว่าง)
const ITEM_IMAGES = {
    "item2": "",
    "item3": "",
    "item4": "",
    "item5": "",
    "item6": "",
    "item7": "",
};

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
    static parseThaiDateTime(timestamp) {
        if (!timestamp) return null;
        try {
            const clean = String(timestamp).replace(',', '').trim();
            const parts = clean.split(' ');
            const datePart = parts[0];
            const timePart = parts[1] || '0:0:0';
            const dp = datePart.split('/');
            if (dp.length !== 3) return null;
            let [d, m, y] = dp.map(Number);
            if (y > 2500) y -= 543;
            const [h, min, s] = timePart.split(':').map(v => Number(v) || 0);
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
        record.timestamp = new Date().toLocaleString('th-TH');
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
        record.timestamp = new Date().toLocaleString('th-TH');
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
    constructor() {
        this.chartInstances = {};
        this.bellChartInstance = null;
        this.bellCurveMode = null; // 'numeric' | 'gauge'
        this.showSixSigma = false;
        this._currentModalItemKey = null;
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

        // Event delegation: จัดการคลิกปุ่มรูปภาพทุกตัวในหน้า
        document.addEventListener('click', (e) => {
            const btn = e.target.closest('.item-img-btn');
            if (!btn) return;
            const itemKey = btn.dataset.item;
            const itemName = btn.dataset.itemName || itemKey;
            this.openImageModal(itemKey, itemName, ITEM_IMAGES[itemKey] || '');
        });

        // โหลดรูปภาพจาก Cloud เมื่อเปิดหน้า (fire-and-forget)
        if (AppConfig.USE_GOOGLE_SHEET) this._loadImagesFromCloud();

        // ผูก event สำหรับ upload และ delete ใน modal
        document.getElementById('image-modal-file-input')?.addEventListener('change', (e) => {
            const file = e.target.files?.[0];
            if (!file || !this._currentModalItemKey) return;
            e.target.value = '';
            this._compressAndUploadImage(this._currentModalItemKey, file);
        });

        document.getElementById('image-modal-delete-btn')?.addEventListener('click', () => {
            if (!this._currentModalItemKey) return;
            if (!confirm(`ลบรูปภาพของ ${this._currentModalItemKey} ออกหรือไม่?`)) return;
            this._deleteImageFromCloud(this._currentModalItemKey);
        });
    }

    openImageModal(itemKey, itemName, imageUrl) {
        const modal = document.getElementById('image-modal');
        if (!modal) return;
        this._currentModalItemKey = itemKey;
        document.getElementById('image-modal-title').textContent = itemName || itemKey;
        this._refreshModalImage(imageUrl);
        modal.classList.remove('hidden');
    }

    _refreshModalImage(imageUrl) {
        const imgEl = document.getElementById('image-modal-img');
        const noImgEl = document.getElementById('image-modal-no-img');
        const deleteBtn = document.getElementById('image-modal-delete-btn');
        if (imageUrl) {
            imgEl.src = imageUrl;
            imgEl.classList.remove('hidden');
            noImgEl?.classList.add('hidden');
            deleteBtn?.classList.remove('hidden');
        } else {
            imgEl.src = '';
            imgEl.classList.add('hidden');
            noImgEl?.classList.remove('hidden');
            deleteBtn?.classList.add('hidden');
        }
    }

    async _loadImagesFromCloud() {
        try {
            const res = await fetch(`${AppConfig.GOOGLE_SHEET_URL}?action=get_images`);
            const json = await res.json();
            if (json.success && json.data) Object.assign(ITEM_IMAGES, json.data);
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
                    const MAX_W = 1400;
                    let w = img.width, h = img.height;
                    if (w > MAX_W) { h = Math.round(h * MAX_W / w); w = MAX_W; }
                    const canvas = document.createElement('canvas');
                    canvas.width = w; canvas.height = h;
                    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                    resolve(canvas.toDataURL('image/jpeg', 0.85));
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
            const [header, base64] = dataUrl.split(',');
            const mimeType = header.match(/:(.*?);/)[1];
            const res = await fetch(AppConfig.GOOGLE_SHEET_URL, {
                method: 'POST',
                body: JSON.stringify({ action: 'upload_image', itemKey, imageData: base64, mimeType })
            });
            const json = await res.json();
            if (json.success && json.data?.url) {
                ITEM_IMAGES[itemKey] = json.data.url;
                this._refreshModalImage(json.data.url);
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
        this._refreshModalImage('');
    }

    _setModalUploading(isLoading) {
        const input = document.getElementById('image-modal-file-input');
        const icon = document.getElementById('image-upload-icon');
        const spinner = document.getElementById('image-upload-spinner');
        const labelText = document.getElementById('image-upload-label-text');
        const deleteBtn = document.getElementById('image-modal-delete-btn');
        if (input) input.disabled = isLoading;
        icon?.classList.toggle('hidden', isLoading);
        spinner?.classList.toggle('hidden', !isLoading);
        if (labelText) labelText.textContent = isLoading ? 'กำลังอัพโหลด...' : 'อัพโหลดรูปภาพ';
        if (deleteBtn) deleteBtn.style.opacity = isLoading ? '0.4' : '1';
        if (deleteBtn) deleteBtn.disabled = isLoading;
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

    // คืนค่าผลลัพธ์ gauge ที่เลือก
    getGaugeSelection() {
        return document.getElementById('gauge-result').value;
    }

    // รีเซ็ตการเลือก gauge
    resetGaugeSelection() {
        document.getElementById('gauge-result').value = '';
        const base = 'flex-1 py-4 px-4 rounded-lg border-2 font-bold text-lg transition-colors border-gray-300 text-gray-500';
        document.getElementById('gauge-pass-btn').className = base + ' hover:border-green-500 hover:text-green-600 hover:bg-green-50';
        document.getElementById('gauge-fail-btn').className = base + ' hover:border-red-500 hover:text-red-600 hover:bg-red-50';
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
        if (document.getElementById('bell-curve-container')) return;

        const container = document.createElement('div');
        container.id = 'bell-curve-container';
        container.className = 'bg-white p-4 rounded-xl shadow-sm border mt-6 mb-6 transition-all duration-500 ease-in-out';
        container.innerHTML = `
            <div class="flex justify-between items-center mb-4 border-b pb-2">
                <h3 id="bell-curve-title" class="text-md font-bold text-gray-700">การวิเคราะห์การกระจายตัว (Histogram & Normal Curve)</h3>
                <div class="flex items-center gap-2">
                    <span id="bell-chart-title" class="text-xs bg-purple-100 text-purple-800 px-3 py-1 rounded-full font-bold"></span>
                    <button id="bell-curve-img-btn"
                        class="item-img-btn text-xs px-2 py-1 rounded-full border font-medium transition-colors border-gray-300 text-gray-500 hover:bg-blue-50 hover:border-blue-400 hover:text-blue-600 flex items-center gap-1"
                        data-item="" data-item-name="" title="ดูตำแหน่งวัด">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        ตำแหน่งวัด
                    </button>
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

        const kpiContainer = this.elements.kpiCpkCard?.parentElement;
        if (kpiContainer && kpiContainer.parentNode) {
            kpiContainer.parentNode.insertBefore(container, kpiContainer.nextSibling);
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

        const imgBtn = document.getElementById('bell-curve-img-btn');
        if (imgBtn) {
            const paramKey = this.elements.paramSelect?.value || '';
            imgBtn.dataset.item = paramKey;
            imgBtn.dataset.itemName = currentConfig.name ? currentConfig.name.split(':')[0] : paramKey;
        }

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

        const imgBtn = document.getElementById('bell-curve-img-btn');
        if (imgBtn) {
            imgBtn.dataset.item = 'item6';
            imgBtn.dataset.itemName = 'Item 6';
        }

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

        this.elements.chartsContainer.innerHTML = '';

        // Destroy existing chart instances before recreating
        for (const key in this.chartInstances) {
            if (this.chartInstances[key]) {
                this.chartInstances[key].destroy();
            }
        }
        this.chartInstances = {};

        const camSvg = `<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>`;

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
                        <div class="flex items-center gap-2">
                            <span class="gauge-rate text-xs bg-gray-100 text-gray-600 px-3 py-1 rounded-full font-bold">-</span>
                            <button class="item-img-btn shrink-0 text-gray-400 hover:text-blue-600 transition-colors p-0.5 rounded"
                                    data-item="${key}" data-item-name="${itemLabel}" title="ดูตำแหน่งวัด">
                                ${camSvg}
                            </button>
                        </div>
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
                    <div class="flex items-center gap-2 min-w-0">
                        <span class="text-xs text-gray-500 truncate" title="${itemDim}">${itemDim}</span>
                        <button class="item-img-btn shrink-0 text-gray-400 hover:text-blue-600 transition-colors p-0.5 rounded"
                                data-item="${key}" data-item-name="${itemLabel}" title="ดูตำแหน่งวัด">
                            ${camSvg}
                        </button>
                    </div>
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
                            x: {
                                ticks: {
                                    display: true,
                                    maxRotation: 45
                                }
                            }
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
                const { labels, values } = DashboardUI._buildNumericChartData(paramRecords);
                const uslData = Array(labels.length).fill(spec.usl);
                const lslData = spec.lsl !== null ? Array(labels.length).fill(spec.lsl) : [];

                chart.data.labels = labels;
                chart.data.datasets[0].data = values;
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
            }
        }
    }

    // สร้าง labels + values สำหรับ numeric chart แบบ smart:
    // - ถ้าข้ามวัน → group รายวัน (daily mean)
    // - ถ้าวันเดียวกัน → แสดงรายครั้งพร้อม label เวลา
    static _buildNumericChartData(records) {
        if (records.length === 0) {
            return { labels: ['(ว่าง)', '(รอข้อมูล)'], values: [null, null] };
        }

        // ตรวจสอบว่าข้ามวันหรือไม่
        const dates = records.map(r => StatUtils.parseThaiDate(r.timestamp));
        const isoSet = new Set(dates.map(d => d ? StatUtils.dateToISO(d) : '?'));
        const spansMultipleDays = isoSet.size > 1;

        if (spansMultipleDays) {
            // กลุ่มรายวัน: คำนวณค่าเฉลี่ยต่อวัน
            const grouped = {};
            records.forEach(r => {
                const d = StatUtils.parseThaiDate(r.timestamp);
                const key = d ? StatUtils.dateToISO(d) : '?';
                if (!grouped[key]) grouped[key] = [];
                const v = parseFloat(r.value);
                if (!isNaN(v)) grouped[key].push(v);
            });

            const sortedDays = Object.keys(grouped).filter(k => k !== '?').sort();
            const labels = sortedDays.map(iso => {
                const [, m, d] = iso.split('-');
                return `${parseInt(d)}/${parseInt(m)}`;
            });
            const values = sortedDays.map(day => {
                const arr = grouped[day];
                return arr.length > 0 ? parseFloat(StatUtils.mean(arr).toFixed(3)) : null;
            });

            if (values.length === 1) {
                return { labels: ['เริ่มต้น', ...labels], values: [null, ...values] };
            }
            return { labels, values };
        } else {
            // รายครั้ง: แสดง HH:MM พร้อมข้อมูลล่าสุด 30 จุด
            const displayRecords = records.slice(-30);
            const labels = displayRecords.map(r => {
                const timePart = String(r.timestamp).replace(',', '').trim().split(' ')[1] || r.timestamp;
                return timePart.substring(0, 5); // HH:MM
            });
            const values = displayRecords.map(r => parseFloat(r.value));

            if (displayRecords.length === 1) {
                return { labels: ['เริ่มต้น', ...labels], values: [null, ...values] };
            }
            return { labels, values };
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

        // Gauge buttons
        const baseClass = 'flex-1 py-4 px-4 rounded-lg border-2 font-bold text-lg transition-colors';
        const passSelected = `${baseClass} border-green-500 bg-green-50 text-green-700`;
        const failSelected = `${baseClass} border-red-500 bg-red-50 text-red-700`;
        const passIdle = `${baseClass} border-gray-300 text-gray-500 hover:border-green-500 hover:text-green-600 hover:bg-green-50`;
        const failIdle = `${baseClass} border-gray-300 text-gray-500 hover:border-red-500 hover:text-red-600 hover:bg-red-50`;

        document.getElementById('gauge-pass-btn').addEventListener('click', () => {
            document.getElementById('gauge-result').value = 'PASS';
            document.getElementById('gauge-pass-btn').className = passSelected;
            document.getElementById('gauge-fail-btn').className = failIdle;
        });

        document.getElementById('gauge-fail-btn').addEventListener('click', () => {
            document.getElementById('gauge-result').value = 'FAIL';
            document.getElementById('gauge-fail-btn').className = failSelected;
            document.getElementById('gauge-pass-btn').className = passIdle;
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

    async handleSubmit(e) {
        e.preventDefault();

        const part = this.ui.elements.partSelect.value;
        const param = this.ui.elements.paramSelect.value;
        const spec = PART_SPECS[part]?.[param];

        if (spec?.type === 'gauge') {
            // Gauge: บันทึก PASS หรือ FAIL 1 รายการ
            const gaugeResult = this.ui.getGaugeSelection();
            if (!gaugeResult) {
                alert('กรุณาเลือกผลการตรวจสอบ (✓ ผ่าน หรือ ✗ ไม่ผ่าน)');
                return;
            }

            const record = {
                machine: document.getElementById('machine-id').value,
                part,
                parameter: param,
                operator: document.getElementById('operator').value,
                value: gaugeResult
            };

            this.ui.setLoadingState(true);
            await this.db.save(record);
            this.ui.setLoadingState(false);

            this.ui.resetGaugeSelection();
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
            operator: document.getElementById('operator').value
        };

        this.ui.setLoadingState(true);
        for (const value of values) {
            await this.db.save({ ...base, value });
        }
        this.ui.setLoadingState(false);

        this.ui.clearInput();
        this.refreshDashboard(true, true);
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
