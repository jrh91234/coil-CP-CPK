// =====================================================
// PDF REPORT (Export รายงาน SPC เป็นไฟล์ PDF)
// - ใช้ข้อมูลชุดเดียวกับที่แสดงบน Dashboard (เครื่อง + รุ่นชิ้นงาน + ช่วงวันที่ที่เลือกอยู่)
// - เนื้อหา: หัวรายงาน, ตารางสรุป Cp/Cpk ทุก Item, กราฟ Histogram ของ Item ที่เลือก,
//   กราฟแนวโน้มทุก Item (ตามมุมมองที่แสดงอยู่ เช่น เฉลี่ยต่อรอบ/ซูมรายวัน), รายการค่าที่หลุดสเปค
// - สร้าง PDF ในเบราว์เซอร์ด้วย html2pdf.js (โหลดจาก CDN เฉพาะตอนกด Export ครั้งแรก)
//   เรนเดอร์เป็นภาพ จึงแสดงภาษาไทยได้ครบโดยไม่ต้องฝังฟอนต์
// =====================================================

const PDF_REPORT_LIB_URL = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
const PDF_REPORT_MAX_OOS_ROWS = 60;

class PdfReportModule {
    constructor(app) {
        this.app = app;
        this._libPromise = null;
        this.btn = document.getElementById('export-pdf-btn');
        this.btn?.addEventListener('click', () => this.exportPdf());
    }

    _loadLib() {
        if (window.html2pdf) return Promise.resolve();
        if (!this._libPromise) {
            this._libPromise = new Promise((resolve, reject) => {
                const s = document.createElement('script');
                s.src = PDF_REPORT_LIB_URL;
                s.onload = () => resolve();
                s.onerror = () => { this._libPromise = null; reject(new Error('โหลดตัวสร้าง PDF ไม่สำเร็จ (ตรวจสอบอินเทอร์เน็ต)')); };
                document.head.appendChild(s);
            });
        }
        return this._libPromise;
    }

    _setBusy(busy) {
        if (!this.btn) return;
        this.btn.disabled = busy;
        const label = this.btn.querySelector('.export-pdf-label');
        if (label) label.textContent = busy ? 'กำลังสร้าง PDF...' : 'Export PDF';
        this.btn.classList.toggle('opacity-60', busy);
    }

    async exportPdf() {
        const ctx = this.app.lastReportContext;
        if (!ctx || !ctx.part || !PART_SPECS[ctx.part]) {
            alert('ยังไม่มีข้อมูลสำหรับสร้างรายงาน กรุณาเลือกรุ่นชิ้นงานและรอโหลดข้อมูลก่อน');
            return;
        }
        this._setBusy(true);
        try {
            await this._loadLib();
            const partImage = await this._getPartImage(ctx.part);
            const el = this._buildReport(ctx, partImage);
            const fileName = this._fileName(ctx);
            // รอรูปกราฟโหลดครบก่อน ไม่งั้นความสูงหน้าถูกวัดผิด (หน้าหลังหาย/กราฟถูกตัด)
            await Promise.all([...el.querySelectorAll('img')].map(img => img.decode().catch(() => {})));
            await window.html2pdf().set({
                margin: [8, 8, 10, 8],
                filename: fileName,
                image: { type: 'jpeg', quality: 0.95 },
                html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff', scrollX: 0, scrollY: 0 },
                jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
                pagebreak: { mode: ['css', 'legacy'], avoid: '.rpt-avoid' }
            }).from(el).save();
        } catch (err) {
            console.error('PDF export error:', err);
            alert('สร้าง PDF ไม่สำเร็จ: ' + (err.message || err));
        } finally {
            this._setBusy(false);
        }
    }

    // รูปตำแหน่งวัดของรุ่นชิ้นงาน (รูปเดียวกับแผง "ตำแหน่งวัด" บน Dashboard)
    // ยังไม่ได้โหลด → ดึงจาก cache/cloud ก่อน; ถ้าเป็น URL ให้แปลงเป็น data URL กันภาพหายตอนสร้าง PDF
    async _getPartImage(part) {
        if (!part || typeof ITEM_IMAGES === 'undefined') return null;
        const ui = this.app.ui;
        let src = ITEM_IMAGES[part];
        if (!src && ui?._ensureImageLoaded) {
            try {
                await ui._ensureImageLoaded(part);
                if (ui._imageFetches?.[part]) await ui._imageFetches[part];
            } catch { /* ไม่มีรูปก็สร้างรายงานต่อได้ */ }
            src = ITEM_IMAGES[part];
        }
        if (!src) return null;
        if (String(src).startsWith('data:')) return src;
        try {
            const blob = await (await fetch(src)).blob();
            return await new Promise(resolve => {
                const fr = new FileReader();
                fr.onload = () => resolve(fr.result);
                fr.onerror = () => resolve(src);
                fr.readAsDataURL(blob);
            });
        } catch {
            return src;
        }
    }

    _fileName(ctx) {
        const safe = s => String(s || '').replace(/[\\/:*?"<>|\s()]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
        const d = new Date();
        const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}_${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
        return ['SPC_Report', safe(ctx.part), safe(ctx.machine), stamp].filter(Boolean).join('_') + '.pdf';
    }

    _esc(v) {
        return String(v ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    }

    _fmtISO(iso) {
        if (!iso) return '';
        const [y, m, d] = iso.split('-');
        return `${parseInt(d)}/${parseInt(m)}/${y}`;
    }

    _rangeText(ctx) {
        const { from, to } = ctx.range || {};
        if (!from && !to) return 'ทั้งหมด';
        if (from && to) return from === to ? this._fmtISO(from) : `${this._fmtISO(from)} – ${this._fmtISO(to)}`;
        return from ? `ตั้งแต่ ${this._fmtISO(from)}` : `ถึง ${this._fmtISO(to)}`;
    }

    // สถิติของแต่ละ Item
    _itemStats(key, spec, records) {
        const recs = records.filter(r => r.parameter === key);
        if (spec.type === 'gauge') {
            const pass = recs.filter(r => String(r.value).toUpperCase() === 'PASS').length;
            const fail = recs.filter(r => String(r.value).toUpperCase() === 'FAIL').length;
            const total = pass + fail;
            return { gauge: true, n: total, pass, fail, rate: total ? pass / total : null };
        }
        const vals = recs.map(r => parseFloat(r.value)).filter(v => !isNaN(v));
        const n = vals.length;
        if (n === 0) return { gauge: false, n: 0 };
        const mean = StatUtils.mean(vals);
        const sigma = StatUtils.stdDev(vals, mean);
        const cap = StatUtils.calculateCapability(vals, spec.usl, spec.lsl);
        const oos = vals.filter(v => (spec.usl !== null && v > spec.usl) || (spec.lsl !== null && v < spec.lsl)).length;
        return {
            gauge: false, n, mean, sigma,
            min: Math.min(...vals), max: Math.max(...vals),
            cp: cap.cp, cpk: cap.cpk, oos
        };
    }

    _cpkBadge(cpk) {
        const v = parseFloat(cpk);
        if (isNaN(v)) return { text: '-', cls: 'rpt-na' };
        if (v >= 1.33) return { text: 'ดี (≥1.33)', cls: 'rpt-good' };
        if (v >= 1.0) return { text: 'เฝ้าระวัง', cls: 'rpt-warn' };
        return { text: 'ต้องปรับปรุง', cls: 'rpt-bad' };
    }

    _specText(spec) {
        const parts = [];
        if (spec.lsl !== null && spec.lsl !== undefined) parts.push(`LSL ${spec.lsl}`);
        if (spec.target !== null && spec.target !== undefined) parts.push(`T ${spec.target}`);
        if (spec.usl !== null && spec.usl !== undefined) parts.push(`USL ${spec.usl}`);
        return spec.type === 'gauge' ? 'Gauge (ผ่าน/ไม่ผ่าน)' : parts.join(' / ');
    }

    // วาด Chart.js config ลง canvas นอกจอ แล้วคืนเป็น data URL (พื้นขาว)
    _renderConfig(config, width, height, extraProps = {}) {
        const holder = document.createElement('div');
        holder.style.cssText = `position:fixed;left:-10000px;top:0;width:${width}px;height:${height}px;`;
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        holder.appendChild(canvas);
        document.body.appendChild(holder);
        let chart = null;
        try {
            config.options = {
                ...(config.options || {}),
                responsive: false, maintainAspectRatio: false, animation: false, devicePixelRatio: 3, events: []
            };
            chart = new Chart(canvas, config);
            Object.assign(chart, extraProps);
            chart.draw();
            const c2d = canvas.getContext('2d');
            c2d.save();
            c2d.globalCompositeOperation = 'destination-over';
            c2d.fillStyle = '#ffffff';
            c2d.fillRect(0, 0, canvas.width, canvas.height);
            c2d.restore();
            return canvas.toDataURL('image/png');
        } catch (err) {
            console.warn('render chart for report failed:', err);
            return null;
        } finally {
            chart?.destroy();
            holder.remove();
        }
    }

    // Histogram + Normal Curve ของ 1 Item — คำนวณ bin/เส้นโค้งแบบเดียวกับกราฟบน Dashboard
    _histogramImage(spec, values, width, height) {
        const n = values.length;
        const mean = StatUtils.mean(values);
        const sigma = StatUtils.stdDev(values, mean);
        const dataMin = Math.min(...values);
        const dataMax = Math.max(...values);
        const dataRange = dataMax - dataMin || 1;
        const binCount = Math.max(Math.ceil(1 + 3.322 * Math.log10(n)), Math.min(50, Math.round(dataRange / 0.01)));
        const binWidth = dataRange / binCount;
        const bins = new Array(binCount).fill(0);
        values.forEach(v => {
            let idx = Math.floor((v - dataMin) / binWidth);
            if (idx >= binCount) idx = binCount - 1;
            if (idx < 0) idx = 0;
            bins[idx]++;
        });
        const histData = bins.map((count, i) => ({ x: dataMin + (i + 0.5) * binWidth, y: count }));

        let minVal = dataMin, maxVal = dataMax;
        if (spec.lsl !== null && spec.lsl !== undefined) minVal = Math.min(minVal, spec.lsl);
        if (spec.usl !== null && spec.usl !== undefined) maxVal = Math.max(maxVal, spec.usl);
        minVal = Math.min(minVal, mean - 3.5 * sigma);
        maxVal = Math.max(maxVal, mean + 3.5 * sigma);
        const pad = (maxVal - minVal) * 0.03;
        minVal -= pad; maxVal += pad;

        const curveData = [];
        let maxCurveY = 0;
        for (let i = 0; i <= 100; i++) {
            const x = minVal + i * (maxVal - minVal) / 100;
            const y = sigma > 0 ? (1 / (sigma * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * Math.pow((x - mean) / sigma, 2)) * n * binWidth : 0;
            curveData.push({ x, y });
            if (y > maxCurveY) maxCurveY = y;
        }
        const maxY = Math.max(Math.max(...bins, 0), maxCurveY) * 1.15;
        const vline = (x, color, dash) => ({
            type: 'line', data: (x === null || x === undefined) ? [] : [{ x, y: 0 }, { x, y: maxY }],
            borderColor: color, borderDash: dash, borderWidth: 1.5, pointRadius: 0
        });

        return this._renderConfig({
            data: {
                datasets: [
                    { type: 'bar', data: histData, backgroundColor: 'rgba(59, 130, 246, 0.6)', borderColor: 'rgb(59, 130, 246)', borderWidth: 1, barPercentage: 1.0, categoryPercentage: 1.0 },
                    { type: 'line', data: curveData, borderColor: 'rgb(168, 85, 247)', borderWidth: 2, pointRadius: 0, fill: true, backgroundColor: 'rgba(168, 85, 247, 0.15)', tension: 0.4 },
                    vline(spec.lsl, 'rgb(239, 68, 68)', [5, 5]),
                    vline(spec.usl, 'rgb(239, 68, 68)', [5, 5]),
                    vline(spec.target, 'rgb(34, 197, 94)', [3, 3])
                ]
            },
            options: {
                scales: {
                    x: { type: 'linear', min: minVal, max: maxVal, ticks: { maxTicksLimit: 7, font: { size: 10 }, callback: v => Number(v).toFixed(2) } },
                    y: { beginAtZero: true, suggestedMax: maxY, ticks: { precision: 0, font: { size: 10 } } }
                },
                plugins: { legend: { display: false }, tooltip: { enabled: false } }
            }
        }, width, height);
    }

    // วาดกราฟซ้ำบน canvas ขนาดเท่าที่จะแสดงในรายงาน (ตัวอักษรอ่านได้ ไม่แบนตามขนาดจอ)
    // ใช้ data/options ชุดเดียวกับกราฟบนหน้าจอ → ได้มุมมองเดียวกัน (เฉลี่ยต่อรอบ / ซูมรายวัน ฯลฯ)
    _chartImage(chart, width, height) {
        if (!chart) return null;
        const holder = document.createElement('div');
        holder.style.cssText = `position:fixed;left:-10000px;top:0;width:${width}px;height:${height}px;`;
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        holder.appendChild(canvas);
        document.body.appendChild(holder);
        let copy = null;
        try {
            const raw = chart.config._config || {};
            const data = {
                labels: [...(chart.data.labels || [])],
                datasets: chart.data.datasets.map(ds => ({ ...ds, data: [...ds.data] }))
            };
            copy = new Chart(canvas, {
                type: raw.type || chart.config.type,
                data,
                options: {
                    ...(raw.options || {}),
                    responsive: false,
                    maintainAspectRatio: false,
                    animation: false,
                    devicePixelRatio: 3,
                    events: [],
                    onClick: undefined,
                    onHover: undefined
                },
                plugins: raw.plugins || []
            });
            // ค่าที่ plugin เส้นเวลาสุ่มตัวอย่าง/ช่วงพัก ใช้ (เฉพาะมุมมองซูมรายวัน)
            ['_samplingSlots', '_isNightShift', '_shiftBreaks'].forEach(k => { copy[k] = chart[k]; });
            copy.draw();
            const ctx = canvas.getContext('2d');
            ctx.save();
            ctx.globalCompositeOperation = 'destination-over';
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.restore();
            return canvas.toDataURL('image/png');
        } catch (err) {
            console.warn('render chart for report failed:', err);
            try { return chart.toBase64Image('image/png', 1); } catch { return null; }
        } finally {
            copy?.destroy();
            holder.remove();
        }
    }

    _buildReport(ctx, partImage = null) {
        const specs = PART_SPECS[ctx.part];
        const ui = this.app.ui;
        const records = ctx.records.filter(r => r.part === ctx.part);
        const now = new Date().toLocaleString('th-TH', { hour12: false });
        const e = v => this._esc(v);
        const f3 = v => (typeof v === 'number' && !isNaN(v)) ? v.toFixed(3) : '-';

        // ---- ตารางสรุป ----
        const rows = Object.entries(specs).map(([key, spec]) => {
            const st = this._itemStats(key, spec, records);
            const label = spec.name.split(':')[0];
            const dim = (spec.name.split(':')[1] || '').trim();
            if (st.gauge) {
                const rate = st.rate === null ? '-' : `${(st.rate * 100).toFixed(1)}%`;
                const cls = st.rate === null ? 'rpt-na' : st.rate >= 0.95 ? 'rpt-good' : st.rate >= 0.8 ? 'rpt-warn' : 'rpt-bad';
                return `<tr><td><b>${e(label)}</b><div class="rpt-dim">${e(dim)}</div></td><td>${e(this._specText(spec))}</td>
                    <td class="r">${st.n}</td><td colspan="6" class="c">ผ่าน ${st.pass} / ไม่ผ่าน ${st.fail}</td>
                    <td class="c"><span class="rpt-badge ${cls}">ผ่าน ${rate}</span></td></tr>`;
            }
            if (!st.n) {
                return `<tr><td><b>${e(label)}</b><div class="rpt-dim">${e(dim)}</div></td><td>${e(this._specText(spec))}</td>
                    <td class="r">0</td><td colspan="7" class="c rpt-muted">ไม่มีข้อมูลในช่วงนี้</td></tr>`;
            }
            const badge = this._cpkBadge(st.cpk);
            return `<tr><td><b>${e(label)}</b><div class="rpt-dim">${e(dim)}</div></td><td>${e(this._specText(spec))}</td>
                <td class="r">${st.n}</td><td class="r">${f3(st.mean)}</td><td class="r">${f3(st.sigma)}</td>
                <td class="r">${f3(st.min)}</td><td class="r">${f3(st.max)}</td>
                <td class="r">${e(st.cp)}</td><td class="r"><b>${e(st.cpk)}</b>${st.oos ? `<div class="rpt-oos">หลุดสเปค ${st.oos}</div>` : ''}</td>
                <td class="c"><span class="rpt-badge ${badge.cls}">${badge.text}</span></td></tr>`;
        }).join('');

        // ---- Histogram ทุก Item (numeric) — 2 กราฟต่อแถว ----
        const histCards = Object.entries(specs).filter(([, spec]) => spec.type !== 'gauge').map(([key, spec]) => {
            const vals = records.filter(r => r.parameter === key).map(r => parseFloat(r.value)).filter(v => !isNaN(v));
            const label = spec.name.split(':')[0];
            const dim = (spec.name.split(':')[1] || '').trim();
            const img = vals.length >= 2 ? this._histogramImage(spec, vals, 336, 190) : null;
            let statLine = '';
            if (vals.length >= 2) {
                const m = StatUtils.mean(vals);
                const sd = StatUtils.stdDev(vals, m);
                const cap = StatUtils.calculateCapability(vals, spec.usl, spec.lsl);
                statLine = `n=${vals.length} · x̄=${m.toFixed(3)} · σ=${sd.toFixed(3)} · Cpk=${cap.cpk}`;
            }
            return `<div class="rpt-chart">
                <div class="rpt-chart-head"><b>${e(label)}</b><span>${e(dim)}</span></div>
                <div class="rpt-chart-mode">${e(statLine || 'ข้อมูลไม่พอ (ต้องมีอย่างน้อย 2 ค่า)')}</div>
                ${img ? `<img src="${img}">` : '<div class="rpt-noimg">—</div>'}
            </div>`;
        });
        const histRows = [];
        for (let i = 0; i < histCards.length; i += 2) {
            const row = `<div class="rpt-chart-row">${histCards[i]}${histCards[i + 1] || '<div class="rpt-chart rpt-empty"></div>'}</div>`;
            histRows.push(i === 0
                ? `<div class="rpt-avoid"><h2>การกระจายตัวรายตัว (Histogram &amp; Normal Curve)</h2>${row}</div>`
                : `<div class="rpt-avoid">${row}</div>`);
        }
        const histHtml = histRows.length ? `<div class="rpt-section">
                ${histRows.join('')}
                <div class="rpt-legend">แท่งสีน้ำเงิน = ความถี่ · เส้นม่วง = ระฆังคว่ำ (Normal Curve) · เส้นประแดง = LSL/USL · เส้นประเขียว = Target</div>
            </div>` : '';

        // ---- กราฟแนวโน้มทุก Item ----
        const chartCards = Object.entries(specs).map(([key, spec]) => {
            const chart = ui.chartInstances[key];
            const img = this._chartImage(chart, 336, 170);
            if (!img) return '';
            const label = spec.name.split(':')[0];
            const dim = (spec.name.split(':')[1] || '').trim();
            let mode = '';
            if (spec.type !== 'gauge' && chart) {
                if (chart._isDrilling && chart._drillISO) mode = `วันที่ ${this._fmtISO(chart._drillISO)}`;
                else if (chart._isMultiDay) mode = 'ค่าเฉลี่ยรายวัน';
                else mode = DashboardUI.groupRounds ? 'เฉลี่ยต่อรอบวัด' : 'รายชิ้น';
            }
            return `<div class="rpt-chart">
                <div class="rpt-chart-head"><b>${e(label)}</b><span>${e(dim)}</span></div>
                ${mode ? `<div class="rpt-chart-mode">${e(mode)}</div>` : ''}
                <img src="${img}">
            </div>`;
        }).filter(Boolean);
        // จับคู่ทีละ 2 กราฟเป็น 1 แถว (block) — ตัดหน้าได้เฉพาะระหว่างแถว ไม่ผ่ากลางกราฟ
        const chartRows = [];
        for (let i = 0; i < chartCards.length; i += 2) {
            const row = `<div class="rpt-chart-row">${chartCards[i]}${chartCards[i + 1] || '<div class="rpt-chart rpt-empty"></div>'}</div>`;
            // หัวข้อผูกกับแถวแรก — ไม่ให้หัวข้อค้างท้ายหน้าแล้วกราฟไปขึ้นหน้าใหม่
            chartRows.push(i === 0
                ? `<div class="rpt-avoid"><h2>แนวโน้มค่าที่วัดได้รายตัว (Trend Charts)</h2>${row}</div>`
                : `<div class="rpt-avoid">${row}</div>`);
        }

        // ---- รายการค่าที่หลุดสเปค ----
        const oosRecs = records.filter(r => {
            const spec = specs[r.parameter];
            if (!spec || spec.type === 'gauge') return String(r.value).toUpperCase() === 'FAIL' && !!spec;
            const v = parseFloat(r.value);
            if (isNaN(v)) return false;
            return (spec.usl !== null && v > spec.usl) || (spec.lsl !== null && v < spec.lsl);
        });
        const oosRows = oosRecs.slice(-PDF_REPORT_MAX_OOS_ROWS).map(r => {
            const spec = specs[r.parameter];
            const val = spec.type === 'gauge' ? 'ไม่ผ่าน' : parseFloat(r.value).toFixed(3);
            return `<tr><td>${e(String(r.timestamp).replace(',', ''))}</td><td>${e(spec.name.split(':')[0])}</td>
                <td>${e(r.machine)}</td><td>${e(r.operator)}</td><td class="r rpt-bad-text">${e(val)}</td></tr>`;
        }).join('');
        const oosHtml = `<div class="rpt-section">
            <h2>ค่าที่หลุดสเปค (Out of Spec) — ${oosRecs.length} รายการ${oosRecs.length > PDF_REPORT_MAX_OOS_ROWS ? ` (แสดง ${PDF_REPORT_MAX_OOS_ROWS} รายการล่าสุด)` : ''}</h2>
            ${oosRecs.length ? `<table class="rpt-table"><thead><tr><th>เวลา</th><th>Item</th><th>เครื่อง</th><th>ผู้วัด</th><th class="r">ค่า</th></tr></thead><tbody>${oosRows}</tbody></table>`
                : '<p class="rpt-muted">ไม่มีค่าที่หลุดสเปคในช่วงนี้ ✓</p>'}
        </div>`;

        const el = document.createElement('div');
        el.className = 'rpt-root';
        el.innerHTML = `
            <style>
                .rpt-root { width: 720px; padding: 4px 4px 0; font-family: 'Sarabun', sans-serif; color: #1f2937; font-size: 11px; background: #fff; }
                .rpt-root h1 { font-size: 20px; margin: 0; color: #1e3a8a; }
                .rpt-root h2 { font-size: 13px; margin: 0 0 6px; color: #1f2937; border-left: 4px solid #3b82f6; padding-left: 6px; }
                .rpt-header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #1e3a8a; padding-bottom: 6px; margin-bottom: 10px; }
                .rpt-sub { color: #6b7280; font-size: 11px; }
                .rpt-meta { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-bottom: 12px; }
                .rpt-meta div { background: #f3f4f6; border-radius: 6px; padding: 5px 8px; }
                .rpt-meta span { display: block; color: #6b7280; font-size: 10px; }
                .rpt-meta b { font-size: 12px; }
                .rpt-section { margin-bottom: 14px; }
                .rpt-table { width: 100%; border-collapse: collapse; font-size: 10.5px; }
                .rpt-table th { background: #1e3a8a; color: #fff; padding: 5px 4px; text-align: left; font-weight: 600; }
                .rpt-table td { border-bottom: 1px solid #e5e7eb; padding: 4px; vertical-align: top; }
                .rpt-table tr { page-break-inside: avoid; }
                .rpt-table .r { text-align: right; } .rpt-table .c { text-align: center; }
                .rpt-dim { color: #6b7280; font-size: 9.5px; }
                .rpt-oos { color: #dc2626; font-size: 9.5px; }
                .rpt-badge { display: inline-block; padding: 1px 6px; border-radius: 9999px; font-size: 9.5px; font-weight: 600; white-space: nowrap; }
                .rpt-good { background: #dcfce7; color: #166534; } .rpt-warn { background: #fef9c3; color: #854d0e; }
                .rpt-bad { background: #fee2e2; color: #991b1b; } .rpt-na { background: #f3f4f6; color: #6b7280; }
                .rpt-bad-text { color: #dc2626; font-weight: 600; }
                .rpt-muted { color: #9ca3af; }
                .rpt-partimg { border: 1px solid #e5e7eb; border-radius: 6px; padding: 6px; text-align: center; background: #fff; }
                .rpt-partimg img { max-width: 100%; max-height: 270px; object-fit: contain; }
                .rpt-noimg { height: 120px; display: flex; align-items: center; justify-content: center; color: #d1d5db; font-size: 20px; }
                .rpt-chart-row { display: flex; gap: 8px; margin-bottom: 8px; }
                .rpt-chart { flex: 1 1 0; min-width: 0; border: 1px solid #e5e7eb; border-radius: 6px; padding: 6px; }
                .rpt-empty { border-color: transparent; }
                .rpt-chart img { width: 100%; }
                .rpt-chart-head { display: flex; justify-content: space-between; font-size: 11px; }
                .rpt-chart-head span { color: #6b7280; font-size: 10px; }
                .rpt-chart-mode { color: #2563eb; font-size: 9.5px; margin-bottom: 2px; }
                .rpt-legend { color: #6b7280; font-size: 9.5px; margin-top: 4px; }
                .rpt-footer { margin: 10px 0 0; color: #9ca3af; font-size: 9.5px; text-align: center; border-top: 1px solid #e5e7eb; padding-top: 4px; }
            </style>
            <div class="rpt-header">
                <div>
                    <h1>รายงานความสามารถของกระบวนการ (SPC Cp/Cpk Report)</h1>
                    <div class="rpt-sub">Statistical Process Control Report</div>
                </div>
                <div class="rpt-sub">สร้างเมื่อ ${e(now)}</div>
            </div>
            <div class="rpt-meta">
                <div><span>กระบวนการ (Machine)</span><b>${e(ctx.machine || 'ทุกเครื่อง')}</b></div>
                <div><span>รุ่นชิ้นงาน (Part)</span><b>${e(ctx.part)}</b></div>
                <div><span>ช่วงวันที่</span><b>${e(this._rangeText(ctx))}</b></div>
                <div><span>จำนวนข้อมูลทั้งหมด</span><b>${records.length} ค่า</b></div>
            </div>
            ${partImage ? `<div class="rpt-section rpt-avoid">
                <h2>ตำแหน่งวัด (Dimension Point Check) — ${e(ctx.part)}</h2>
                <div class="rpt-partimg"><img src="${partImage}"></div>
            </div>` : ''}
            <div class="rpt-section rpt-avoid">
                <h2>สรุปความสามารถของกระบวนการ (Capability Summary)</h2>
                <table class="rpt-table">
                    <thead><tr><th>Item</th><th>Spec</th><th class="r">n</th><th class="r">Mean</th><th class="r">σ</th>
                        <th class="r">Min</th><th class="r">Max</th><th class="r">Cp</th><th class="r">Cpk</th><th class="c">สถานะ</th></tr></thead>
                    <tbody>${rows}</tbody>
                </table>
                <div class="rpt-legend">เกณฑ์ Cpk: ≥ 1.33 ดี · 1.00–1.33 เฝ้าระวัง · &lt; 1.00 ต้องปรับปรุง | Gauge: อัตราผ่าน ≥ 95% ดี</div>
            </div>
            ${histHtml}
            <div class="rpt-section">
                <div class="rpt-charts">${chartRows.join('')}</div>
                <div class="rpt-legend">จุดสีน้ำเงิน = ปกติ · สีส้ม = หลังเปลี่ยนม้วน · สีม่วง = หลังตั้งเครื่อง(เอาท์สเปค) · เส้นประแดง = USL/LSL</div>
            </div>
            ${oosHtml}
            <div class="rpt-footer">SPC Dashboard — Cp/Cpk Management</div>
        `;
        return el;
    }
}
