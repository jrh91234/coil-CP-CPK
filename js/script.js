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
        // ดึงคิวที่ค้างส่งจาก LocalStorage
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
        
        // 1. นำข้อมูลเข้าคิวและแคชเพื่อให้กราฟอัปเดตทันที
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
                        server.operator === pending.operator &&
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
// 4. VIEW (UI Management)
// -----------------------------------------------------
class DashboardUI {
    constructor() {
        this.chartInstances = {}; 
        this.bellChartInstance = null; // อินสแตนซ์สำหรับกราฟระฆังคว่ำ
        this.elements = {
            machineSelect: document.getElementById('machine-id'),
            partSelect: document.getElementById('part-id'),
            paramSelect: document.getElementById('parameter-id'),
            specDisplay: document.getElementById('spec-display'),
            measuredInput: document.getElementById('measured-value'),
            chartsContainer: document.getElementById('charts-container'), 
            overviewPartTitle: document.getElementById('overview-part-title'),
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

    clearInput() {
        this.elements.measuredInput.value = '';
        this.elements.measuredInput.focus();
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
            option.text = spec.name;
            this.elements.paramSelect.appendChild(option);
        }
    }

    updateSpecInfo(spec) {
        const lslText = spec.lsl !== null ? spec.lsl : "ไม่มี (N/A)";
        this.elements.specDisplay.innerHTML = `สเปค (Spec): <b>${spec.name}</b> <br/> (LSL: ${lslText} / USL: ${spec.usl})`;
    }

    // สร้างและแทรกกล่องกราฟระฆังคว่ำอัตโนมัติ
    createBellCurveContainer() {
        let container = document.getElementById('bell-curve-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'bell-curve-container';
            container.className = 'bg-white p-4 rounded-xl shadow-sm border mt-6 mb-6 transition-all duration-500 ease-in-out';
            container.innerHTML = `
                <div class="flex justify-between items-center mb-4 border-b pb-2">
                    <h3 class="text-md font-bold text-gray-700">การวิเคราะห์การกระจายตัว (Histogram & Normal Curve)</h3>
                    <span id="bell-chart-title" class="text-xs bg-purple-100 text-purple-800 px-3 py-1 rounded-full font-bold"></span>
                </div>
                <div class="relative h-[300px] w-full">
                    <canvas id="bellCurveCanvas"></canvas>
                </div>
            `;
            
            // แทรกต่อจากกล่อง KPI (เพื่อความสวยงามให้อยู่ข้างบน Trend Charts)
            const kpiContainer = this.elements.kpiCpkCard?.parentElement;
            if (kpiContainer && kpiContainer.parentNode) {
                kpiContainer.parentNode.insertBefore(container, kpiContainer.nextSibling);
            }
            
            // กำหนดค่าตั้งต้นของกราฟ (Chart.js Config)
            const ctx = document.getElementById('bellCurveCanvas').getContext('2d');
            this.bellChartInstance = new Chart(ctx, {
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
                            borderColor: 'rgb(168, 85, 247)', // สีม่วง
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
                            borderColor: 'rgb(34, 197, 94)', // สีเขียว
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
                            title: { display: true, text: 'ค่าที่วัดได้ (Measured Value)' }
                        },
                        y: {
                            beginAtZero: true,
                            title: { display: true, text: 'ความถี่ (Frequency)' }
                        }
                    },
                    plugins: {
                        legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 10 } },
                        tooltip: { mode: 'index', intersect: false }
                    },
                    interaction: { mode: 'nearest', axis: 'x', intersect: false }
                }
            });
        }
    }

    // วาดกราฟระฆังคว่ำสำหรับพารามิเตอร์ปัจจุบัน
    renderBellCurve(dataRecords, currentConfig, partName) {
        if (!document.getElementById('bell-curve-container')) {
            this.createBellCurveContainer();
        }

        const titleEl = document.getElementById('bell-chart-title');
        if (titleEl) {
            titleEl.innerText = `${partName} - ${currentConfig.name ? currentConfig.name.split(':')[0] : ''}`;
        }

        const values = dataRecords.map(r => parseFloat(r.value)).filter(v => !isNaN(v));
        
        // ถ้าน้อยกว่า 2 ค่า ยังพล็อตกราฟระฆังคว่ำไม่ได้
        if (values.length < 2) {
            this.bellChartInstance.data.datasets.forEach(ds => ds.data = []);
            this.bellChartInstance.update();
            return;
        }

        const mean = StatUtils.mean(values);
        const sigma = StatUtils.stdDev(values, mean);

        // ขยายขอบเขตแกน X ให้ครอบคลุม LSL, USL และ 3 Sigma
        let minVal = Math.min(...values);
        let maxVal = Math.max(...values);
        if (currentConfig.lsl !== null) minVal = Math.min(minVal, currentConfig.lsl);
        if (currentConfig.usl !== null) maxVal = Math.max(maxVal, currentConfig.usl);
        minVal = Math.min(minVal, mean - 3.5 * sigma);
        maxVal = Math.max(maxVal, mean + 3.5 * sigma);

        // คำนวณความถี่เพื่อสร้าง Histogram (แบ่งจำนวนแท่งตามปริมาณข้อมูล)
        const n = values.length;
        const binCount = Math.max(7, Math.min(20, Math.ceil(Math.sqrt(n))));
        const binWidth = (maxVal - minVal) / binCount;
        const bins = new Array(binCount).fill(0);

        values.forEach(v => {
            let idx = Math.floor((v - minVal) / binWidth);
            if (idx >= binCount) idx = binCount - 1;
            if (idx < 0) idx = 0;
            bins[idx]++;
        });

        // สร้าง Data สำหรับแท่ง Histogram
        const histData = bins.map((count, i) => ({ 
            x: minVal + (i + 0.5) * binWidth, 
            y: count 
        }));

        // สร้าง Data สำหรับเส้น Normal Distribution (ระฆังคว่ำ)
        const curveData = [];
        const steps = 100;
        const stepSize = (maxVal - minVal) / steps;
        let maxCurveY = 0;

        for (let i = 0; i <= steps; i++) {
            const x = minVal + i * stepSize;
            let y = 0;
            if (sigma > 0) {
                // คำนวณสมการ PDF แล้ว Scale กลับให้ตรงกับความสูงของ Histogram
                const pdf = (1 / (sigma * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * Math.pow((x - mean) / sigma, 2));
                y = pdf * n * binWidth; 
            }
            curveData.push({ x, y });
            if (y > maxCurveY) maxCurveY = y;
        }

        const maxHistY = Math.max(...bins, 0);
        const maxY = Math.max(maxHistY, maxCurveY) * 1.15; // เผื่อพื้นที่ด้านบน 15%

        // ป้อนข้อมูลเข้ากราฟ
        this.bellChartInstance.data.datasets[0].data = histData;  // แท่งความถี่
        this.bellChartInstance.data.datasets[1].data = curveData; // เส้นระฆังคว่ำ

        // เส้นแกนแนวตั้ง (USL, LSL, Target)
        this.bellChartInstance.data.datasets[2].data = currentConfig.lsl !== null ? [{x: currentConfig.lsl, y: 0}, {x: currentConfig.lsl, y: maxY}] : [];
        this.bellChartInstance.data.datasets[3].data = currentConfig.usl !== null ? [{x: currentConfig.usl, y: 0}, {x: currentConfig.usl, y: maxY}] : [];
        this.bellChartInstance.data.datasets[4].data = currentConfig.target !== null ? [{x: currentConfig.target, y: 0}, {x: currentConfig.target, y: maxY}] : [];

        // กำหนดสเกลเพื่อให้เส้นตรงกับพื้นที่
        this.bellChartInstance.options.scales.x.min = minVal;
        this.bellChartInstance.options.scales.x.max = maxVal;
        this.bellChartInstance.options.scales.y.max = maxY;

        this.bellChartInstance.update();
    }

    // สร้าง DOM ของกราฟทุกตัวอัตโนมัติเมื่อเลือกรุ่นชิ้นงาน
    setupAllCharts(partName, specsObject) {
        if(this.elements.overviewPartTitle) this.elements.overviewPartTitle.innerText = partName;
        if(!this.elements.chartsContainer) return;
        
        this.elements.chartsContainer.innerHTML = '';
        this.chartInstances = {};

        for (const [key, spec] of Object.entries(specsObject)) {
            const wrapper = document.createElement('div');
            wrapper.className = 'bg-white p-4 rounded-xl shadow-sm border transition-all duration-500 ease-in-out';
            wrapper.id = `chart-wrapper-${key}`;

            const header = document.createElement('div');
            header.className = 'flex justify-between items-center mb-2 border-b pb-2';
            header.innerHTML = `
                <h3 class="text-sm font-bold text-gray-700">${spec.name.split(':')[0]}</h3>
                <span class="text-xs text-gray-500 truncate ml-2" title="${spec.name.split(':')[1] || spec.name}">${spec.name.split(':')[1] || spec.name}</span>
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

    // อัปเดตข้อมูลกราฟรายตัว
    updateAllCharts(dataRecords, part, specsObject) {
        for (const [key, spec] of Object.entries(specsObject)) {
            const chart = this.chartInstances[key];
            if (!chart) continue;

            const paramRecords = dataRecords.filter(r => r.part === part && r.parameter === key);
            const displayRecords = paramRecords.slice(-30); 
            
            let labels = displayRecords.map(r => r.timestamp.split(' ')[1] || r.timestamp);
            let values = displayRecords.map(r => parseFloat(r.value));
            let uslData = Array(displayRecords.length).fill(spec.usl);
            let lslData = spec.lsl !== null ? Array(displayRecords.length).fill(spec.lsl) : [];
            
            // ขึงเส้นขอบ LSL/USL
            if (displayRecords.length === 0) {
                labels = ['(ว่าง)', '(รอข้อมูล)'];
                values = [null, null];
                uslData = [spec.usl, spec.usl];
                if (spec.lsl !== null) lslData = [spec.lsl, spec.lsl];
            } else if (displayRecords.length === 1) {
                labels = ['เริ่มต้น', labels[0]];
                values = [null, values[0]];
                uslData = [spec.usl, spec.usl];
                if (spec.lsl !== null) lslData = [spec.lsl, spec.lsl];
            }

            chart.data.labels = labels;
            chart.data.datasets[0].data = values;
            chart.data.datasets[1].data = uslData;
            chart.data.datasets[2].data = lslData;
            
            if (spec.lsl !== null) {
                const range = spec.usl - spec.lsl;
                chart.options.scales.y.suggestedMin = spec.lsl - (range * 0.3);
                chart.options.scales.y.suggestedMax = spec.usl + (range * 0.3);
            } else {
                const minData = values.filter(v => v !== null).length > 0 ? Math.min(...values.filter(v => v !== null)) : 0;
                chart.options.scales.y.suggestedMin = Math.max(minData - 1, 0); 
                chart.options.scales.y.suggestedMax = spec.usl + (spec.usl * 0.05);
            }
            
            chart.update();
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
        if(!this.elements.tbody) return;
        this.elements.tbody.innerHTML = '';
        
        if(dataRecords.length === 0) {
            this.elements.tbody.innerHTML = '<tr><td colspan="4" class="px-2 py-4 text-center text-gray-400">ยังไม่มีข้อมูลสำหรับพารามิเตอร์นี้</td></tr>';
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
                <td class="px-2 py-2">${r.timestamp.split(' ')[1] || r.timestamp}</td>
                <td class="px-2 py-2">${r.machine ? r.machine.split('-')[1] || r.machine : ''}</td>
                <td class="px-2 py-2 truncate max-w-[80px]">${r.operator ? r.operator.split(' ')[0] : ''}</td>
                <td class="px-2 py-2 text-right ${valColor}">${parseFloat(r.value).toFixed(3)}</td>
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
        this.currentConfig = { target: 0, usl: 0, lsl: 0, name: '' };
        this.machineAssignments = {}; 
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
        
        if(specs) {
            this.ui.setupAllCharts(part, specs);
            this.ui.renderParameterOptions(specs);
            this.handleParamChange(); 
        } else {
            this.ui.elements.paramSelect.innerHTML = '<option value="">-- กรุณาเลือกรุ่นชิ้นงาน --</option>';
            this.ui.elements.specDisplay.innerHTML = '';
            if(this.ui.elements.chartsContainer) this.ui.elements.chartsContainer.innerHTML = '';
        }
    }

    handleParamChange() {
        const part = this.ui.elements.partSelect.value;
        const param = this.ui.elements.paramSelect.value;
        
        if(!param || !PART_SPECS[part][param]) return;

        const spec = PART_SPECS[part][param];
        // เพิ่ม name เข้าไปใน config ปัจจุบัน
        this.currentConfig = { target: spec.target, usl: spec.usl, lsl: spec.lsl, name: spec.name };

        this.ui.updateSpecInfo(spec);
        this.ui.clearInput();
        this.refreshDashboard(true, true); 
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

        await this.db.save(record);
        
        this.ui.clearInput();
        this.refreshDashboard(true, true); 
    }

    async refreshDashboard(shouldScrollToChart = false, useLocalCache = false) {
        let allRecords;
        
        if (useLocalCache && this.db.getLocalData) {
            allRecords = this.db.getLocalData();
        } else {
            allRecords = await this.db.getAll();
        }

        const part = this.ui.elements.partSelect.value;
        const param = this.ui.elements.paramSelect.value;

        if(!part || !PART_SPECS[part]) return;

        this.ui.updateAllCharts(allRecords, part, PART_SPECS[part]);

        if(!param) return;

        this.ui.highlightChart(param, shouldScrollToChart);

        const filteredRecords = allRecords.filter(r => r.part === part && r.parameter === param);
        this.ui.renderTable(filteredRecords, this.currentConfig);
        this.ui.renderKPIs(filteredRecords, this.currentConfig);
        
        // วาดกราฟระฆังคว่ำ
        this.ui.renderBellCurve(filteredRecords, this.currentConfig, part);
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
