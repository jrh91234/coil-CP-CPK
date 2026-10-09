/**
 * =========================================================================
 * MODULE 1: CONFIGURATION
 * =========================================================================
 */
const Config = {
  // ชื่อแท็บที่จะใช้บันทึกข้อมูลการวัด (ปรับตามชื่อแท็บใน Google Sheet ของคุณ)
  SHEET_NAME: "Coil winding output",
  HEADERS: ["Timestamp", "Machine_ID", "Part_ID", "Parameter", "Operator", "Measured_Value", "Setup_Type"],
  HEADER_COLOR: "#d0e0e3",

  // ID ของ Google Sheet ไฟล์ Master (ที่มีแท็บ Config)
  MASTER_SHEET_ID: "11NGAEXnTZIXMseO_0vfA-yRWxBXEiWpNkCIdIQq2ftQ",

  // ชื่อแท็บใน Google Sheet สำหรับเก็บรูปภาพ (เก็บเป็น base64 ใน Sheet โดยตรง — ไม่ใช้ Drive)
  IMAGE_SHEET_NAME: "ItemImages",

  // รหัสเข้าเมนูจัดการข้อมูล ตั้งไว้ฝั่ง Cloud ไม่ฝังในหน้าเว็บ
  SETTINGS_PASSWORD: "Cpk/cp",

  // --- Appearance Inspection (ตรวจสภาพภายนอก) ---
  // แท็บเก็บผลตรวจ (แยกจากข้อมูลวัดขนาด เพื่อไม่ให้ปนกับการคำนวณ Cp/Cpk)
  APPEARANCE_SHEET_NAME: "Appearance Inspection",
  APPEARANCE_HEADERS: ["Timestamp", "Machine_ID", "Part_ID", "Operator", "Result", "Failed_Items",
                       "Remark", "Photo_Count", "Photo_URLs", "Photo_IDs", "Checklist_JSON", "Photo_Labels"],
  // โฟลเดอร์หลักใน Google Drive สำหรับเก็บรูป (ต้องเป็นของบัญชีที่ Deploy สคริปต์)
  APPEARANCE_FOLDER_ID: "1f7v5VWa20ol1zQERJAKGmRmAfJEb9_MA",
  // ค่าเริ่มต้น — แก้ได้จากแท็บ Config ใน Master Sheet (APPEARANCE_INTERVAL_MIN / APPEARANCE_CHECKLIST)
  APPEARANCE_DEFAULT_INTERVAL_MIN: 60,
  APPEARANCE_DEFAULT_CHECKLIST: ["บิดงอ / เสียรูป", "รอยขีดข่วนที่ตัวงาน"],
  APPEARANCE_MAX_PHOTOS: 3,

  // --- ตั้งค่ารอบการตรวจ (Data Entry + Appearance) จากหน้าเว็บ ---
  // เก็บเป็น JSON ในแท็บ Config ของ Master Sheet (key นี้) — แก้ได้เฉพาะผู้มีรหัส SETTINGS_PASSWORD
  INSPECTION_SETTINGS_KEY: "INSPECTION_SETTINGS",
  // แท็บใน Master Sheet บันทึกประวัติการแก้ค่าตั้ง (ใคร / เมื่อไร / เปลี่ยนอะไร)
  SETTINGS_LOG_SHEET_NAME: "Settings Log",
  SETTINGS_LOG_HEADERS: ["Timestamp", "Editor", "Changes", "Settings_JSON"],
  APPEARANCE_PHOTO_SLOT_KEYS: ["Single", "GoNoGo", "Flatness"]
};

/**
 * =========================================================================
 * MODULE 2: UTILITIES (Helper Functions)
 * =========================================================================
 */
const ResponseHelper = {
  success: (data = null, message = "") => {
    const result = { success: true };
    if (data) result.data = data;
    if (message) result.message = message;
    
    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  },
  
  error: (errMessage) => {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: errMessage }))
      .setMimeType(ContentService.MimeType.JSON);
  },
  
  // จัดรูปแบบวันที่ด้วย JS ล้วน ไม่เรียก Session.getScriptTimeZone()/Utilities.formatDate ต่อแถว
  // (เป็น service call ที่แพงมาก เมื่อข้อมูลหลักพันแถวจะกินเวลาเกือบทั้งหมดของ request)
  // Apps Script รันด้วย timezone ของสคริปต์อยู่แล้ว ผลลัพธ์จึงเท่ากับของเดิม
  formatDate: (dateObj) => {
    if (!(dateObj instanceof Date) || isNaN(dateObj.getTime())) return dateObj;
    const p2 = (n) => (n < 10 ? "0" + n : String(n));
    return p2(dateObj.getDate()) + "/" + p2(dateObj.getMonth() + 1) + "/" + dateObj.getFullYear() +
           " " + p2(dateObj.getHours()) + ":" + p2(dateObj.getMinutes()) + ":" + p2(dateObj.getSeconds());
  }
};

/**
 * แปลงวันที่รูปแบบ YYYY-MM-DD เป็นขอบเขตของ "วันผลิต"
 * วันผลิตเริ่ม 08:00 ของวันนั้น ถึง 07:59:59 ของวันถัดไป (ตรงกับ logic ฝั่งหน้าเว็บ)
 */
const DateRange = {
  start: (iso) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || "").trim());
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 8, 0, 0);
  },

  end: (iso) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || "").trim());
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + 1, 7, 59, 59);
  }
};

/**
 * =========================================================================
 * MODULE 3: DATA ACCESS LAYER (Repository)
 * =========================================================================
 */

// --- Image Repository: เก็บรูปเป็น base64 ใน Google Sheet โดยตรง (ไม่ใช้ DriveApp) ---
// แบ่ง dataUrl เป็น 2 ช่อง (DataPart1 + DataPart2) เพราะ Sheet จำกัด 50,000 ตัวอักษร/ช่อง
class ImageRepository {
  constructor(ss) {
    this.ss = ss;
  }

  _getSheet() {
    let sheet = this.ss.getSheetByName(Config.IMAGE_SHEET_NAME);
    if (!sheet) {
      sheet = this.ss.insertSheet(Config.IMAGE_SHEET_NAME);
      sheet.appendRow(["ImageKey", "DataPart1", "DataPart2", "DataPart3", "Version"]);
      sheet.getRange(1, 1, 1, 5).setFontWeight("bold").setBackground(Config.HEADER_COLOR);
    }
    return sheet;
  }

  // อ่านเฉพาะคอลัมน์ ImageKey — ไม่ดึง base64 ทั้งชีตเข้ามาเพื่อหาแถว
  _readKeyColumn(sheet) {
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return [];
    return sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  }

  _findRow(sheet, imageKey) {
    const keys = this._readKeyColumn(sheet);
    for (let i = 0; i < keys.length; i++) {
      if (String(keys[i][0]) === String(imageKey)) return i + 2;
    }
    return -1;
  }

  /**
   * รายการ key + version ของรูปทั้งหมด (ไม่มี base64) — payload เล็กมาก
   * หน้าเว็บใช้ตรวจว่ารูปที่ cache ไว้ใน localStorage ยังใหม่อยู่หรือไม่
   */
  getKeys() {
    const sheet = this._getSheet();
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return {};

    const keys = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    const versions = sheet.getRange(2, 5, lastRow - 1, 1).getValues();
    const result = {};
    for (let i = 0; i < keys.length; i++) {
      if (keys[i][0]) result[String(keys[i][0])] = String(versions[i][0] || "");
    }
    return result;
  }

  // ดึงรูปทีละใบตามที่หน้าเว็บเปิดดูจริง
  getOne(imageKey) {
    const sheet = this._getSheet();
    const rowIdx = this._findRow(sheet, imageKey);
    if (rowIdx < 0) return null;

    const row = sheet.getRange(rowIdx, 1, 1, 5).getValues()[0];
    return {
      dataUrl: String(row[1] || '') + String(row[2] || '') + String(row[3] || ''),
      version: String(row[4] || '')
    };
  }

  // เก็บไว้เผื่อหน้าเว็บเวอร์ชันเก่าที่ยัง cache อยู่ในเบราว์เซอร์ผู้ใช้
  getAll() {
    const sheet = this._getSheet();
    const values = sheet.getDataRange().getValues();
    const result = {};
    for (let i = 1; i < values.length; i++) {
      if (values[i][0]) {
        result[String(values[i][0])] = String(values[i][1] || '') + String(values[i][2] || '') + String(values[i][3] || '');
      }
    }
    return result;
  }

  save(imageKey, dataUrl) {
    const CHUNK = 49000;
    const part1 = dataUrl.substring(0, CHUNK);
    const part2 = dataUrl.substring(CHUNK, CHUNK * 2);
    const part3 = dataUrl.substring(CHUNK * 2);
    const version = String(new Date().getTime());

    const sheet = this._getSheet();
    const rowIdx = this._findRow(sheet, imageKey);
    if (rowIdx > 0) {
      sheet.getRange(rowIdx, 1, 1, 5).setValues([[imageKey, part1, part2, part3, version]]);
    } else {
      sheet.appendRow([imageKey, part1, part2, part3, version]);
    }
    return { dataUrl: dataUrl, version: version };
  }

  delete(imageKey) {
    const sheet = this._getSheet();
    const rowIdx = this._findRow(sheet, imageKey);
    if (rowIdx > 0) sheet.deleteRow(rowIdx);
  }
}

// --- Sheet Repository: เก็บข้อมูลการวัด ---
class SheetRepository {
  constructor() {
    this.ss = SpreadsheetApp.getActiveSpreadsheet();
  }

  _getSheet() {
    let sheet = this.ss.getSheetByName(Config.SHEET_NAME);
    if (!sheet) {
      sheet = this.ss.insertSheet(Config.SHEET_NAME);
      sheet.appendRow(Config.HEADERS);
      sheet.getRange(1, 1, 1, Config.HEADERS.length).setFontWeight("bold").setBackground(Config.HEADER_COLOR);
    }
    return sheet;
  }

  addRecord(data) {
    const sheet = this._getSheet();
    const timestamp = new Date();
    
    sheet.appendRow([
      timestamp,
      data.machine,
      data.part,
      data.parameter,
      data.operator,
      data.value,
      data.setupType || ""
    ]);
  }

  deleteRecord(rowNumber) {
    const sheet = this._getSheet();
    const row = Number(rowNumber);
    if (!row || row <= 1 || row > sheet.getLastRow()) {
      throw new Error("Invalid record row.");
    }
    sheet.deleteRow(row);
  }

  updateRecord(rowNumber, data) {
    const sheet = this._getSheet();
    const row = Number(rowNumber);
    if (!row || row <= 1 || row > sheet.getLastRow()) {
      throw new Error("Invalid record row.");
    }
    sheet.getRange(row, 2, 1, 6).setValues([[
      data.machine,
      data.part,
      data.parameter,
      data.operator,
      data.value,
      data.setupType || ""
    ]]);
  }

  /**
   * ดึงข้อมูลการวัด กรองช่วงวันที่ฝั่ง server ได้ (range = { from, to } รูปแบบ YYYY-MM-DD)
   * การกรองก่อนส่งช่วยลดทั้งขนาด payload และงาน format วันที่ ซึ่งเป็นคอขวดหลักเมื่อข้อมูลเยอะ
   */
  getAllRecords(range) {
    const sheet = this._getSheet();
    const values = sheet.getDataRange().getValues();

    if (values.length <= 1) return [];

    const start = range ? DateRange.start(range.from) : null;
    const end   = range ? DateRange.end(range.to)     : null;

    const records = [];
    for (let i = 1; i < values.length; i++) {
      const row = values[i];
      const ts = (row[0] instanceof Date) ? row[0] : new Date(row[0]);
      const isValidDate = (ts instanceof Date) && !isNaN(ts.getTime());

      // แถวที่อ่านวันที่ไม่ได้ให้ผ่านเสมอ (พฤติกรรมเดียวกับตัวกรองฝั่งหน้าเว็บ)
      if (isValidDate) {
        if (start && ts < start) continue;
        if (end && ts > end) continue;
      }

      records.push({
        rowNumber: i + 1,
        timestamp: isValidDate ? ResponseHelper.formatDate(ts) : row[0],
        machine: row[1],
        part: row[2],
        parameter: row[3],
        operator: row[4],
        value: row[5],
        setupType: row[6] || ""
      });
    }
    return records;
  }
}

// --- Appearance Photo Repository: เก็บรูปตรวจสภาพภายนอกใน Google Drive ---
// โครงสร้างโฟลเดอร์: <โฟลเดอร์หลัก>/<yyyy-MM>/<Machine>/<yyyyMMdd_HHmmss>_<Machine>_<Part>_<ผล>_<ลำดับ>.jpg
class AppearancePhotoRepository {
  _rootFolder() {
    return DriveApp.getFolderById(Config.APPEARANCE_FOLDER_ID);
  }

  _getOrCreateSubFolder(parent, name) {
    const it = parent.getFoldersByName(name);
    return it.hasNext() ? it.next() : parent.createFolder(name);
  }

  // ใช้ lock กันสองเครื่องอัปโหลดพร้อมกันแล้วสร้างโฟลเดอร์เดือน/เครื่องซ้ำ
  _targetFolder(machine, now) {
    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      const month = Utilities.formatDate(now, "Asia/Bangkok", "yyyy-MM");
      const monthFolder = this._getOrCreateSubFolder(this._rootFolder(), month);
      return this._getOrCreateSubFolder(monthFolder, AppearancePhotoRepository.safeName(machine) || "Unknown");
    } finally {
      lock.releaseLock();
    }
  }

  static safeName(text) {
    return String(text || "").replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, "").trim();
  }

  save(payload) {
    const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(String(payload.dataUrl || ""));
    if (!match) throw new Error("รูปแบบรูปภาพไม่ถูกต้อง");

    const now = new Date();
    const folder = this._targetFolder(payload.machine, now);
    const stamp = Utilities.formatDate(now, "Asia/Bangkok", "yyyyMMdd_HHmmss");
    const safe = AppearancePhotoRepository.safeName;
    const photoNo = String(payload.index || 1) + (payload.slot ? "-" + safe(payload.slot) : "");
    const fileName = [stamp, safe(payload.machine), safe(payload.part), safe(payload.result), photoNo]
      .filter(Boolean).join("_") + ".jpg";

    const blob = Utilities.newBlob(Utilities.base64Decode(match[2]), match[1], fileName);
    const file = folder.createFile(blob);
    file.setDescription([
      "Appearance Inspection",
      "Machine: " + (payload.machine || ""),
      "Part: " + (payload.part || ""),
      "Operator: " + (payload.operator || ""),
      "Result: " + (payload.result || ""),
      "Photo: " + (payload.label || payload.slot || payload.index || "")
    ].join("\n"));

    // โฟลเดอร์หลักตั้ง "ทุกคนที่มีลิงก์ดูได้" ไว้แล้ว ตั้งซ้ำที่ไฟล์เผื่อการสืบทอดสิทธิ์ไม่ทำงาน
    try {
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (err) {
      // บาง Workspace ห้ามแชร์สาธารณะ — ไฟล์ยังถูกบันทึกอยู่ แค่หน้าเว็บอาจแสดงรูปย่อไม่ได้
    }

    const id = file.getId();
    return { id: id, url: "https://drive.google.com/file/d/" + id + "/view", name: fileName };
  }
}

// --- Appearance Repository: เก็บผลตรวจสภาพภายนอก ---
class AppearanceRepository {
  constructor(ss) {
    this.ss = ss;
  }

  _getSheet() {
    let sheet = this.ss.getSheetByName(Config.APPEARANCE_SHEET_NAME);
    if (!sheet) {
      sheet = this.ss.insertSheet(Config.APPEARANCE_SHEET_NAME);
      sheet.appendRow(Config.APPEARANCE_HEADERS);
      sheet.getRange(1, 1, 1, Config.APPEARANCE_HEADERS.length).setFontWeight("bold").setBackground(Config.HEADER_COLOR);
      sheet.setFrozenRows(1);
    } else if (sheet.getLastColumn() < Config.APPEARANCE_HEADERS.length) {
      // ชีตเดิมที่สร้างก่อนเพิ่มคอลัมน์ใหม่ — เติมหัวคอลัมน์ที่ขาด
      const from = sheet.getLastColumn() + 1;
      const extra = Config.APPEARANCE_HEADERS.slice(from - 1);
      sheet.getRange(1, from, 1, extra.length).setValues([extra]).setFontWeight("bold").setBackground(Config.HEADER_COLOR);
    }
    return sheet;
  }

  addRecord(data) {
    const photos = Array.isArray(data.photos) ? data.photos.filter(p => p && p.id) : [];
    if (photos.length < 1) throw new Error("ต้องแนบรูปอย่างน้อย 1 รูป");
    if (photos.length > Config.APPEARANCE_MAX_PHOTOS) throw new Error("แนบรูปได้สูงสุด " + Config.APPEARANCE_MAX_PHOTOS + " รูป");
    if (!data.machine) throw new Error("ไม่ได้เลือกเครื่องจักร");

    const checklist = Array.isArray(data.checklist) ? data.checklist : [];
    if (checklist.length === 0 || checklist.some(c => c.result !== "PASS" && c.result !== "FAIL")) {
      throw new Error("ผลตรวจรายข้อไม่ครบ");
    }
    const failed = checklist.filter(c => c.result === "FAIL").map(c => c.label);
    const result = failed.length > 0 ? "FAIL" : "PASS";
    if (result === "FAIL" && !String(data.remark || "").trim()) {
      throw new Error("ผลไม่ผ่าน ต้องกรอกหมายเหตุ");
    }

    const timestamp = new Date();
    this._getSheet().appendRow([
      timestamp,
      data.machine,
      data.part || "",
      data.operator || "",
      result,
      failed.join(", "),
      String(data.remark || "").trim(),
      photos.length,
      photos.map(p => p.url || ("https://drive.google.com/file/d/" + p.id + "/view")).join("\n"),
      photos.map(p => p.id).join("\n"),
      JSON.stringify(checklist.map(c => ({ label: String(c.label), result: c.result }))),
      photos.map(p => String(p.label || "")).join("\n")
    ]);
    return { timestamp: ResponseHelper.formatDate(timestamp), ts: timestamp.getTime(), result: result };
  }

  /**
   * records    = ผลตรวจในช่วงวันที่ที่ขอ (range = { from, to } รูปแบบ YYYY-MM-DD)
   * lastByMachine = ผลตรวจล่าสุดของทุกเครื่อง (ไม่สนช่วงวันที่) ใช้คำนวณว่าเครื่องไหนถึงรอบตรวจ
   */
  getRecords(range) {
    const sheet = this._getSheet();
    const values = sheet.getDataRange().getValues();
    const start = range ? DateRange.start(range.from) : null;
    const end   = range ? DateRange.end(range.to)     : null;

    const records = [];
    const lastByMachine = {};
    for (let i = 1; i < values.length; i++) {
      const row = values[i];
      const ts = (row[0] instanceof Date) ? row[0] : new Date(row[0]);
      if (!(ts instanceof Date) || isNaN(ts.getTime())) continue;
      const time = ts.getTime();
      const machine = String(row[1] || "");

      if (machine && (!lastByMachine[machine] || lastByMachine[machine].ts < time)) {
        lastByMachine[machine] = { ts: time, result: String(row[4] || ""), operator: String(row[3] || "") };
      }

      if (start && ts < start) continue;
      if (end && ts > end) continue;

      let checklist = [];
      try { checklist = JSON.parse(row[10] || "[]"); } catch (err) { checklist = []; }

      records.push({
        rowNumber: i + 1,
        timestamp: ResponseHelper.formatDate(ts),
        ts: time,
        machine: machine,
        part: String(row[2] || ""),
        operator: String(row[3] || ""),
        result: String(row[4] || ""),
        failedItems: String(row[5] || ""),
        remark: String(row[6] || ""),
        photoIds: String(row[9] || "").split(/\s+/).filter(Boolean),
        photoLabels: String(row[11] || "").split("\n"),
        checklist: checklist
      });
    }
    // เวลาบันทึกล่าสุดของแต่ละเครื่อง (วัดขนาด + ตรวจสภาพภายนอก) ใช้ดูว่าเครื่องเดินอยู่ในกะ/OT หรือไม่
    const lastActivityByMachine = this._lastMeasurementByMachine();
    Object.keys(lastByMachine).forEach(m => {
      if (!lastActivityByMachine[m] || lastActivityByMachine[m] < lastByMachine[m].ts) {
        lastActivityByMachine[m] = lastByMachine[m].ts;
      }
    });
    return { records: records, lastByMachine: lastByMachine, lastActivityByMachine: lastActivityByMachine };
  }

  // อ่านเฉพาะคอลัมน์ Timestamp + Machine_ID ของชีตวัดขนาด (เบา ไม่ดึงทั้งชีต)
  _lastMeasurementByMachine() {
    const result = {};
    const sheet = this.ss.getSheetByName(Config.SHEET_NAME);
    if (!sheet || sheet.getLastRow() < 2) return result;
    const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues();
    for (let i = 0; i < values.length; i++) {
      const ts = (values[i][0] instanceof Date) ? values[i][0] : new Date(values[i][0]);
      const machine = String(values[i][1] || "");
      if (!machine || isNaN(ts.getTime())) continue;
      const time = ts.getTime();
      if (!result[machine] || result[machine] < time) result[machine] = time;
    }
    return result;
  }
}


// --- Inspection Settings: ค่าตั้งรอบการตรวจ เก็บเป็น JSON 1 แถวในแท็บ Config ของ Master Sheet ---
const InspectionSettings = {
  // ช่วงค่าที่ยอมรับ (นาที / วินาที) — กันพิมพ์ผิดจนรอบตรวจใช้งานไม่ได้
  RANGES: {
    "dataEntry.defaultIntervalMin": [30, 720],
    "dataEntry.partIntervalMin": [30, 720],
    "dataEntry.firstCheckWithinMin": [10, 240],
    "dataEntry.onTimeTolMin": [0, 120],
    "dataEntry.earlyAcceptMin": [0, 120],
    "dataEntry.sessionGapMin": [5, 120],
    "appearance.intervalMin": [15, 720],
    "appearance.partIntervalMin": [15, 720],
    "appearance.photoMaxAgeSec": [30, 1800],
    "appearance.soonMin": [0, 60]
  },

  _num(path, value) {
    const n = Number(value);
    const range = this.RANGES[path];
    if (!isFinite(n) || Math.round(n) !== n || n < range[0] || n > range[1]) {
      throw new Error("ค่า " + path + " ต้องเป็นจำนวนเต็ม " + range[0] + "–" + range[1]);
    }
    return n;
  },

  _text(value, max) {
    const s = String(value == null ? "" : value).trim();
    if (s.length > max) throw new Error("ข้อความยาวเกิน " + max + " ตัวอักษร: " + s.slice(0, 30) + "…");
    return s;
  },

  _partMap(path, raw) {
    const out = {};
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
    Object.keys(raw).forEach(part => {
      const name = this._text(part, 100);
      if (name) out[name] = this._num(path, raw[part]);
    });
    return out;
  },

  // ตรวจและจัดรูปค่าที่ส่งมาจากหน้าเว็บ — throw ถ้าค่าไม่ถูกต้อง
  normalize(raw) {
    if (!raw || typeof raw !== "object") throw new Error("ไม่มีข้อมูลค่าตั้ง");
    const de = raw.dataEntry || {};
    const ap = raw.appearance || {};

    const checklist = (Array.isArray(ap.checklist) ? ap.checklist : []).map(c => this._text(c, 100)).filter(Boolean);
    if (checklist.length < 1) throw new Error("ต้องมีหัวข้อตรวจสภาพภายนอกอย่างน้อย 1 ข้อ");
    if (checklist.length > 20) throw new Error("หัวข้อตรวจสภาพภายนอกได้สูงสุด 20 ข้อ");
    if (new Set(checklist).size !== checklist.length) throw new Error("หัวข้อตรวจสภาพภายนอกซ้ำกัน");

    const photoSlots = {};
    const rawSlots = ap.photoSlots || {};
    Config.APPEARANCE_PHOTO_SLOT_KEYS.forEach(key => {
      const slot = rawSlots[key] || {};
      photoSlots[key] = {
        enabled: slot.enabled !== false,
        onlyParts: (Array.isArray(slot.onlyParts) ? slot.onlyParts : []).map(p => this._text(p, 100)).filter(Boolean)
      };
    });
    if (!Config.APPEARANCE_PHOTO_SLOT_KEYS.some(k => photoSlots[k].enabled)) {
      throw new Error("ต้องเปิดใช้รูปที่ต้องถ่ายอย่างน้อย 1 ช่อง");
    }

    return {
      dataEntry: {
        defaultIntervalMin: this._num("dataEntry.defaultIntervalMin", de.defaultIntervalMin),
        partIntervalMin: this._partMap("dataEntry.partIntervalMin", de.partIntervalMin),
        firstCheckWithinMin: this._num("dataEntry.firstCheckWithinMin", de.firstCheckWithinMin),
        onTimeTolMin: this._num("dataEntry.onTimeTolMin", de.onTimeTolMin),
        earlyAcceptMin: this._num("dataEntry.earlyAcceptMin", de.earlyAcceptMin),
        sessionGapMin: this._num("dataEntry.sessionGapMin", de.sessionGapMin)
      },
      appearance: {
        intervalMin: this._num("appearance.intervalMin", ap.intervalMin),
        partIntervalMin: this._partMap("appearance.partIntervalMin", ap.partIntervalMin),
        checklist: checklist,
        photoSlots: photoSlots,
        photoMaxAgeSec: this._num("appearance.photoMaxAgeSec", ap.photoMaxAgeSec),
        soonMin: this._num("appearance.soonMin", ap.soonMin)
      }
    };
  },

  _configSheet(ssMaster) {
    const sheet = ssMaster.getSheetByName("Config");
    if (!sheet) throw new Error("ไม่พบแท็บ Config ใน Master Sheet");
    return sheet;
  },

  // อ่านค่าจากแถวใน Config (null = ยังไม่เคยตั้ง → หน้าเว็บใช้ค่าเริ่มต้นในโค้ด)
  parse(text) {
    if (!text) return null;
    try {
      const obj = JSON.parse(text);
      return (obj && obj.dataEntry && obj.appearance) ? obj : null;
    } catch (err) {
      return null;
    }
  },

  // บันทึกค่าใหม่ + เขียนประวัติลงแท็บ Settings Log
  save(raw, editor, changes) {
    const settings = this.normalize(raw);
    const who = this._text(editor, 100);
    if (!who) throw new Error("กรุณาระบุชื่อผู้แก้ไข");

    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      const ssMaster = SpreadsheetApp.openById(Config.MASTER_SHEET_ID);
      const sheet = this._configSheet(ssMaster);
      const json = JSON.stringify(settings);
      const keys = sheet.getLastRow() > 0 ? sheet.getRange(1, 1, sheet.getLastRow(), 1).getValues() : [];
      const idx = keys.findIndex(r => String(r[0]).trim() === Config.INSPECTION_SETTINGS_KEY);
      if (idx >= 0) {
        sheet.getRange(idx + 1, 2).setValue(json);
      } else {
        sheet.appendRow([Config.INSPECTION_SETTINGS_KEY, json]);
      }

      let log = ssMaster.getSheetByName(Config.SETTINGS_LOG_SHEET_NAME);
      if (!log) {
        log = ssMaster.insertSheet(Config.SETTINGS_LOG_SHEET_NAME);
        log.appendRow(Config.SETTINGS_LOG_HEADERS);
        log.getRange(1, 1, 1, Config.SETTINGS_LOG_HEADERS.length).setFontWeight("bold").setBackground(Config.HEADER_COLOR);
        log.setFrozenRows(1);
      }
      log.appendRow([new Date(), who, this._text(changes, 5000) || "-", json]);
    } finally {
      lock.releaseLock();
    }
    return settings;
  }
};

/**
 * =========================================================================
 * MODULE 4: CONTROLLERS (API Entry Points)
 * =========================================================================
 */

function doPost(e) {
  try {
    const postData = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    if (postData.action === "add") {
      const repo = new SheetRepository();
      repo.addRecord(postData.data);
      return ResponseHelper.success(null, "Data saved successfully");
    }

    if (postData.action === "verify_settings_password") {
      const ok = String(postData.password || "") === Config.SETTINGS_PASSWORD;
      return ResponseHelper.success({ ok });
    }

    if (postData.action === "save_inspection_settings") {
      // ตรวจรหัสฝั่ง server ทุกครั้ง — ซ่อนเมนูบนหน้าเว็บอย่างเดียวกันคนเรียก API ตรงไม่ได้
      if (String(postData.password || "") !== Config.SETTINGS_PASSWORD) {
        return ResponseHelper.error("รหัสไม่ถูกต้อง");
      }
      const saved = InspectionSettings.save(postData.settings, postData.editor, postData.changes);
      return ResponseHelper.success({ settings: saved }, "Settings saved");
    }

    if (postData.action === "delete_record") {
      const repo = new SheetRepository();
      repo.deleteRecord(postData.rowNumber);
      return ResponseHelper.success(null, "Record deleted");
    }

    if (postData.action === "update_record") {
      const repo = new SheetRepository();
      repo.updateRecord(postData.rowNumber, postData.data);
      return ResponseHelper.success(null, "Record updated");
    }

    if (postData.action === "upload_image") {
      const imgRepo = new ImageRepository(ss);
      const saved = imgRepo.save(postData.itemKey, postData.dataUrl);
      return ResponseHelper.success({ url: saved.dataUrl, version: saved.version });
    }

    if (postData.action === "upload_appearance_photo") {
      const photoRepo = new AppearancePhotoRepository();
      return ResponseHelper.success(photoRepo.save(postData.data || {}));
    }

    if (postData.action === "add_appearance") {
      const appearanceRepo = new AppearanceRepository(ss);
      return ResponseHelper.success(appearanceRepo.addRecord(postData.data || {}), "Appearance saved");
    }

    if (postData.action === "delete_image") {
      const imgRepo = new ImageRepository(ss);
      imgRepo.delete(postData.itemKey);
      return ResponseHelper.success(null, "Image deleted");
    }

    return ResponseHelper.error("Invalid action specified.");
  } catch (error) {
    return ResponseHelper.error(error.toString());
  }
}

// กดรันฟังก์ชันนี้ 1 ครั้งใน Apps Script Editor เพื่อให้สิทธิ์ Sheets + Drive
function authorizeApp() {
  SpreadsheetApp.getActiveSpreadsheet();
  const folder = DriveApp.getFolderById(Config.APPEARANCE_FOLDER_ID);
  Logger.log('✅ Authorization complete — Sheets + Drive permissions granted. Photo folder: ' + folder.getName());
}

function doGet(e) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // ----------------------------------------------------
    // รายการ key + version ของรูป (ไม่มี base64) สำหรับตรวจ cache ฝั่งเบราว์เซอร์
    // ----------------------------------------------------
    if (e.parameter && e.parameter.action === "get_image_keys") {
      const imgRepo = new ImageRepository(ss);
      return ResponseHelper.success({ images: imgRepo.getKeys() });
    }

    // ----------------------------------------------------
    // ดึงรูปตำแหน่งวัดทีละใบ
    // ----------------------------------------------------
    if (e.parameter && e.parameter.action === "get_image") {
      const imgRepo = new ImageRepository(ss);
      const image = imgRepo.getOne(e.parameter.key);
      return ResponseHelper.success(image || { dataUrl: "", version: "" });
    }

    // ----------------------------------------------------
    // ดึงรูปภาพตำแหน่งวัดทั้งหมด (endpoint เดิม เก็บไว้เพื่อ backward compatibility)
    // ----------------------------------------------------
    if (e.parameter && e.parameter.action === "get_images") {
      const imgRepo = new ImageRepository(ss);
      return ResponseHelper.success(imgRepo.getAll());
    }

    // ----------------------------------------------------
    // ผลตรวจสภาพภายนอก (Appearance) — ส่ง from/to (YYYY-MM-DD) เพื่อกรองช่วงวันที่ได้
    // ----------------------------------------------------
    if (e.parameter && e.parameter.action === "get_appearance") {
      const appearanceRepo = new AppearanceRepository(ss);
      const from = e.parameter.from || "";
      const to = e.parameter.to || "";
      return ResponseHelper.success(appearanceRepo.getRecords((from || to) ? { from: from, to: to } : null));
    }

    // ----------------------------------------------------
    // ดึงข้อมูล Master Data (พนักงาน & จับคู่เครื่องจักร) จากแท็บ "Config"
    // ----------------------------------------------------
    if (e.parameter && e.parameter.action === "get_master") {
      const ssMaster = SpreadsheetApp.openById(Config.MASTER_SHEET_ID);
      const configSheet = ssMaster.getSheetByName("Config"); // ชี้ไปที่แท็บ Config
      
      let operators = [];
      let machineAssignments = {};
      let appearanceIntervalMin = Config.APPEARANCE_DEFAULT_INTERVAL_MIN;
      let appearanceChecklist = Config.APPEARANCE_DEFAULT_CHECKLIST;
      let inspectionSettings = null;
      
      if (configSheet) {
        const data = configSheet.getDataRange().getValues();
        
        // วนลูปอ่านข้อมูลทุกแถว
        for (let i = 0; i < data.length; i++) {
          const key = data[i][0] ? data[i][0].toString().trim() : "";
          const val = data[i][1] ? data[i][1].toString().trim() : "";
          
          if (key === "MASTER_RECORDERS") {
            try {
              // พยายามแปลงข้อความ JSON เป็น Array
              operators = JSON.parse(val);
            } catch(err) {
              // กรณี JSON พัง ให้ทำการแยกคำด้วยลูกน้ำแทน
              operators = val.replace(/[\[\]"]/g, '').split(',').map(s => s.trim());
            }
          } else if (key === "APPEARANCE_INTERVAL_MIN") {
            // ความถี่ตรวจสภาพภายนอก (นาที) เช่น 60
            const minutes = Number(val);
            if (minutes > 0) appearanceIntervalMin = minutes;
          } else if (key === "APPEARANCE_CHECKLIST") {
            // หัวข้อตรวจสภาพภายนอก: JSON array หรือคั่นด้วยลูกน้ำ
            let items = [];
            try {
              items = JSON.parse(val);
            } catch(err) {
              items = val.replace(/[\[\]"]/g, '').split(',');
            }
            items = (Array.isArray(items) ? items : []).map(s => String(s).trim()).filter(Boolean);
            if (items.length > 0) appearanceChecklist = items;
          } else if (key === Config.INSPECTION_SETTINGS_KEY) {
            // ค่าตั้งจากหน้าเว็บ (อ่าน val จาก data ตรง ๆ ไม่ใช้ toString ของ cell ว่าง)
            inspectionSettings = InspectionSettings.parse(String(data[i][1] || "").trim());
          } else if (key.startsWith("Machine_")) {
            // จับคู่เครื่องจักร -> รุ่นชิ้นงาน
            machineAssignments[key] = val;
          }
        }
      }
      // ค่าที่ตั้งจากหน้าเว็บมาก่อนค่าแบบเดิม (APPEARANCE_INTERVAL_MIN / APPEARANCE_CHECKLIST)
      if (inspectionSettings) {
        appearanceIntervalMin = inspectionSettings.appearance.intervalMin || appearanceIntervalMin;
        if (Array.isArray(inspectionSettings.appearance.checklist) && inspectionSettings.appearance.checklist.length) {
          appearanceChecklist = inspectionSettings.appearance.checklist;
        }
      }
      return ResponseHelper.success({
        operators: operators,
        machineAssignments: machineAssignments,
        appearanceIntervalMin: appearanceIntervalMin,
        appearanceChecklist: appearanceChecklist,
        inspectionSettings: inspectionSettings
      });
    }

    // ----------------------------------------------------
    // ดึงข้อมูลประวัติ History — ส่ง from/to (YYYY-MM-DD) มาเพื่อกรองฝั่ง server ได้
    // ----------------------------------------------------
    const repo = new SheetRepository();
    const from = e.parameter ? e.parameter.from : "";
    const to   = e.parameter ? e.parameter.to   : "";
    const range = (from || to) ? { from: from, to: to } : null;
    const records = repo.getAllRecords(range);
    return ResponseHelper.success(records);
    
  } catch (error) {
    return ResponseHelper.error(error.toString());
  }
}
