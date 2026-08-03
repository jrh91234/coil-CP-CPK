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
  SETTINGS_PASSWORD: "Cpk/cp"
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

function authorizeApp() {
  SpreadsheetApp.getActiveSpreadsheet();
  Logger.log('✅ Authorization complete — Sheets permissions granted.');
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
    // ดึงข้อมูล Master Data (พนักงาน & จับคู่เครื่องจักร) จากแท็บ "Config"
    // ----------------------------------------------------
    if (e.parameter && e.parameter.action === "get_master") {
      const ssMaster = SpreadsheetApp.openById(Config.MASTER_SHEET_ID);
      const configSheet = ssMaster.getSheetByName("Config"); // ชี้ไปที่แท็บ Config
      
      let operators = [];
      let machineAssignments = {};
      
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
          } else if (key.startsWith("Machine_")) {
            // จับคู่เครื่องจักร -> รุ่นชิ้นงาน
            machineAssignments[key] = val;
          }
        }
      }
      return ResponseHelper.success({ operators: operators, machineAssignments: machineAssignments });
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
