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
        "item6": { name: "Item 6: Diameter ø 8.2 +/- 0.25 mm", target: 8.2, lsl: 7.95, usl: 8.45 },
        "item7": { name: "Item 7: ความยาวรวม Max 31.00", target: 31.0, lsl: null, usl: 31.0 }
    },
    "S1B71819-JR (16A)": { // 16A
        "item2": { name: "Item 2: Dimension 24.5 +/- 1.0 mm", target: 24.5, lsl: 23.5, usl: 25.5 },
        "item3": { name: "Item 3: Dimension 5.9 +/- 0.4 mm", target: 5.9, lsl: 5.5, usl: 6.3 },
        "item4": { name: "Item 4: Dimension 8.10 +/- 1.0 mm", target: 8.1, lsl: 7.1, usl: 9.1 },
        "item5": { name: "Item 5: Dimension 1.35 + 0.20 mm", target: 1.45, lsl: 1.35, usl: 1.55 },
        "item6": { name: "Item 6: Diameter ø 8.2 +/- 0.25 mm", target: 8.2, lsl: 7.95, usl: 8.45 },
        "item7": { name: "Item 7: ความยาวรวม Max 31.00", target: 31.0, lsl: null, usl: 31.0 }
    },
    "S1B29292-JR (20A)": { // 20A
        "item2": { name: "Item 2: Dimension 24.5 +/- 1.0 mm", target: 24.5, lsl: 23.5, usl: 25.5 },
        "item3": { name: "Item 3: Dimension 5.9 +/- 0.4 mm", target: 5.9, lsl: 5.5, usl: 6.3 },
        "item4": { name: "Item 4: Dimension 8.10 +/- 1.0 mm", target: 8.1, lsl: 7.1, usl: 9.1 },
        "item5": { name: "Item 5: Dimension 1.65 + 0.20 mm", target: 1.75, lsl: 1.65, usl: 1.85 },
        "item6": { name: "Item 6: Diameter ø 8.2 +/- 0.25 mm", target: 8.2, lsl: 7.95, usl: 8.45 },
        "item7": { name: "Item 7: ความยาวรวม Max 31.00", target: 31.0, lsl: null, usl: 31.0 }
    },
    "51207080HC-JR (25/32A)": { // 32A
        "item2": { name: "Item 2: Dimension 25 +0.5/- 1.0 mm", target: 25.0, lsl: 24.0, usl: 25.5 },
        "item3": { name: "Item 3: Dimension 5.9 +/- 0.4 mm", target: 5.9, lsl: 5.5, usl: 6.3 },
        "item4": { name: "Item 4: Dimension 8.60 +/- 1.0 mm", target: 8.6, lsl: 7.6, usl: 9.6 },
        "item5": { name: "Item 5: Dimension 2.24 +/- 0.08 mm", target: 2.24, lsl: 2.16, usl: 2.32 },
        "item6": { name: "Item 6: Diameter ø 12.8 +/- 0.25 mm", target: 12.8, lsl: 12.55, usl: 13.05 },
        "item7": { name: "Item 7: ความยาวรวม Max 31.00", target: 31.0, lsl: null, usl: 31.0 }
    }
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
// 3. DATA SERVICES (API Layer)
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
}

class GoogleSheetService {
    constructor(url, onSyncUpdate) { 
        this.url = url; 
        this.onSyncUpdate = onSyncUpdate;
        // ดึงคิวที่ค้างส่งจาก LocalStorage (กรณีปิดเว็บไปก่อนส่งเสร็จ)
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
        
        // 1. นำข้อมูลเข้าคิวและแคชเพื่อให้กราฟอัปเดตทันทีโดยไม่ต้องรอโหลด
        this.pendingQueue.push(record);
        this.cachedData.push(record);
        this._saveQueueToLocal();
        
        // 2. สั่งอัปโหลดไป Google Sheet เบื้องหลัง 
        this.syncBackground();
        
        return { success: true };
    }

    async getAll() {
        try {
            const response = await fetch(`${this.url}?action=get`);
            const result = await response.json();
            const serverData = result.data || [];

            // ระบบป้องกันข้อมูลซ้ำ: ลบข้อมูลในคิวที่ขึ้นเซิร์ฟเวอร์สำเร็จไปแล้ว
            if (this.pendingQueue.length > 0) {
                this.pendingQueue = this.pendingQueue.filter(pending => {
                    const isAlreadyOnServer = serverData.some(server => 
                        server.part === pending.part &&
                        server.parameter === pending.parameter &&
                        parseFloat(server.value) === parseFloat(pending.value)
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
    
    // คืนค่าข้อมูลในแคชเพื่ออัปเดต UI ให้เร็วที่สุด
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
                    this.pendingQueue.shift(); // ส่งสำเร็จ ลบออกจากคิว
                    this._saveQueueToLocal();
                } else {
                    break; 
                }
            } catch (error) {
                break; // เน็ตหลุด ให้หยุดอัปโหลดไว้ก่อนแล้วค่อยส่งใหม่ทีหลัง
            }
        }
        this.isSyncing = false;
        if (this.onSyncUpdate) this.onSyncUpdate(this.pendingQueue.length);
    }
}

// -----------------------------------------------------
// 4. VIEW (UI Management)
// -----------------------------------------------------
class DashboardUI {
    constructor() {
        this.chartInstance = null;
        this.elements = {
            partSelect: document.getElementById('part-id'),
            paramSelect: document.getElementById('parameter-id'),
            specDisplay: document.getElementById('spec-display'),
            measuredInput: document.getElementById('measured-value'),
            chartTitle: document.getElementById('chart-title'),
            tbody: document.getElementById('data-table-body'),
            btnSubmit: document.getElementById('submit-btn'),
            statusText: document.getElementById('connection-status'),
            kpiCount: document.getElementById('kpi-count'),
            kpiMean: document.getElementById('kpi-mean'),
            kpiCp: document.getElementById('kpi-cp'),
            kpiCpk: document.getElementById('kpi-cpk'),
            kpiCpkCard: document.getElementById('kpi-cpk-card')
        };
    }

    setStatus(text, colorClass) {
        this.elements.statusText.innerText = text;
        this.elements.statusText.className = `${colorClass} font-semibold`;
    }

    setLoadingState(isLoading) {
        this.elements.btnSubmit.disabled = isLoading;
        this.elements.btnSubmit.innerText = isLoading ? 'กำลังประมวลผล...' : 'บันทึกข้อมูล (Save)';
    }

    clearInput() {
        this.elements.measuredInput.value = '';
        this.elements.measuredInput.focus();
    }

    renderParameterOptions(specsObject) {
        this.elements.paramSelect.innerHTML = ''; 
        for (const [key, spec] of Object.entries(specsObject)) {
            const option = document.createElement('option');
            option.value = key;
            option.text = spec.name;
            this.elements.paramSelect.appendChild(option);
        }
    }

    updateSpecInfo(spec) {
        const lslText = spec.lsl !== null ? spec.lsl : "ไม่มี (N/A)";
        this.elements.specDisplay.innerHTML = `สเปค (Spec): <b>${spec.name}</b> <br/> (LSL: ${lslText} / USL: ${spec.usl})`;
    }

    updateChartTitle(part, specName) {
        const label = specName.split(':')[0]; 
        this.elements.chartTitle.innerText = `${part} - ${label}`;
    }

    initChart() {
        const ctx = document.getElementById('runChart').getContext('2d');
        this.chartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [
                    { label: 'Measured Value', data: [], borderColor: 'rgb(59, 130, 246)', backgroundColor: 'rgba(59, 130, 246, 0.1)', borderWidth: 2, pointRadius: 4, fill: true, tension: 0.1 },
                    { label: 'USL', data: [], borderColor: 'rgb(239, 68, 68)', borderDash: [5, 5], borderWidth: 1, pointRadius: 0, fill: false },
                    { label: 'LSL', data: [], borderColor: 'rgb(239, 68, 68)', borderDash: [5, 5], borderWidth: 1, pointRadius: 0, fill: false }
                ]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
        });
    }

    renderChart(dataRecords, currentConfig) {
        const labels = dataRecords.map(r => r.timestamp.split(' ')[1] || r.timestamp);
        const values = dataRecords.map(r => parseFloat(r.value));
        
        this.chartInstance.data.labels = labels;
        this.chartInstance.data.datasets[0].data = values;
        this.chartInstance.data.datasets[1].data = Array(dataRecords.length).fill(currentConfig.usl);
        
        if (currentConfig.lsl !== null) {
            this.chartInstance.data.datasets[2].data = Array(dataRecords.length).fill(currentConfig.lsl);
            const range = currentConfig.usl - currentConfig.lsl;
            this.chartInstance.options.scales.y.suggestedMin = currentConfig.lsl - (range * 0.5);
            this.chartInstance.options.scales.y.suggestedMax = currentConfig.usl + (range * 0.5);
        } else {
            this.chartInstance.data.datasets[2].data = []; // ซ่อนเส้น LSL
            const minData = values.length > 0 ? Math.min(...values) : 0;
            this.chartInstance.options.scales.y.suggestedMin = Math.max(minData - 1, 0); 
            this.chartInstance.options.scales.y.suggestedMax = currentConfig.usl + (currentConfig.usl * 0.05);
        }
        
        this.chartInstance.update();
    }

    renderTable(dataRecords, currentConfig) {
        this.elements.tbody.innerHTML = '';
        
        if(dataRecords.length === 0) {
            this.elements.tbody.innerHTML = '<tr><td colspan="4" class="px-4 py-4 text-center text-gray-400">ยังไม่มีข้อมูลสำหรับพารามิเตอร์นี้</td></tr>';
            return;
        }

        const recent = [...dataRecords].reverse().slice(0, 10);
        
        recent.forEach(r => {
            let isOut = false;
            if(currentConfig.usl !== null && r.value > currentConfig.usl) isOut = true;
            if(currentConfig.lsl !== null && r.value < currentConfig.lsl) isOut = true;

            const valColor = isOut ? 'text-red-600 font-bold' : 'text-gray-800';
            const tr = document.createElement('tr');
            tr.className = "border-b hover:bg-gray-50";
            tr.innerHTML = `
                <td class="px-4 py-2">${r.timestamp}</td>
                <td class="px-4 py-2">${r.machine}</td>
                <td class="px-4 py-2">${r.operator}</td>
                <td class="px-4 py-2 ${valColor}">${parseFloat(r.value).toFixed(3)}</td>
            `;
            this.elements.tbody.appendChild(tr);
        });
    }

    renderKPIs(dataRecords, currentConfig) {
        const values = dataRecords.map(r => parseFloat(r.value));
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
        this.currentConfig = { target: 0, usl: 0, lsl: 0 };
    }

    async init() {
        this.ui.initChart();
        this.bindEvents();
        
        this.handlePartChange(); 
        await this.refreshDashboard(); // การโหลดครั้งแรกดึงจากเซิร์ฟเวอร์เต็มรูปแบบ

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
        this.ui.elements.partSelect.addEventListener('change', () => this.handlePartChange());
        this.ui.elements.paramSelect.addEventListener('change', () => this.handleParamChange());
        document.getElementById('data-form').addEventListener('submit', (e) => this.handleSubmit(e));
    }

    handlePartChange() {
        const part = this.ui.elements.partSelect.value;
        const specs = PART_SPECS[part];
        this.ui.renderParameterOptions(specs);
        this.handleParamChange(); 
    }

    handleParamChange() {
        const part = this.ui.elements.partSelect.value;
        const param = this.ui.elements.paramSelect.value;
        
        if(!param || !PART_SPECS[part][param]) return;

        const spec = PART_SPECS[part][param];
        this.currentConfig = { target: spec.target, usl: spec.usl, lsl: spec.lsl };

        this.ui.updateSpecInfo(spec);
        this.ui.clearInput();
        this.refreshDashboard(true); // ตอนเปลี่ยนพารามิเตอร์ให้ดึงจาก Local Cache ทันที
    }

    async handleSubmit(e) {
        e.preventDefault();

        const record = {
            machine: document.getElementById('machine-id').value,
            part: this.ui.elements.partSelect.value,
            parameter: this.ui.elements.paramSelect.value,
            value: this.ui.elements.measuredInput.value,
            operator: document.getElementById('operator').value
        };

        // บันทึกลงเครื่องทันที (ไม่รอเซิร์ฟเวอร์)
        await this.db.save(record);
        
        this.ui.clearInput();
        // อัปเดตกราฟด้วยข้อมูลจากหน่วยความจำ (รวดเร็วทันใจ)
        this.refreshDashboard(true); 
    }

    async refreshDashboard(useLocalCache = false) {
        let allRecords;
        
        // เลือกว่าจะดึงจาก Cache (เร็ว) หรือไปโหลดมาจาก Google Sheets (ช้า)
        if (useLocalCache && this.db.getLocalData) {
            allRecords = this.db.getLocalData();
        } else {
            allRecords = await this.db.getAll();
        }

        const part = this.ui.elements.partSelect.value;
        const param = this.ui.elements.paramSelect.value;

        if(!param) return;

        const spec = PART_SPECS[part][param];
        this.ui.updateChartTitle(part, spec.name);

        const filteredRecords = allRecords.filter(r => r.part === part && r.parameter === param);
        
        this.ui.renderChart(filteredRecords, this.currentConfig);
        this.ui.renderTable(filteredRecords, this.currentConfig);
        this.ui.renderKPIs(filteredRecords, this.currentConfig);
    }
}

// -----------------------------------------------------
// 6. BOOTSTRAP / ENTRY POINT
// -----------------------------------------------------
window.onload = () => {
    const uiService = new DashboardUI();
    let appInstance = null;

    // ระบบ Callback เพื่อให้ UI อัปเดตตัวเลข ⏳ เมื่ออัปโหลดเบื้องหลังสำเร็จ
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
