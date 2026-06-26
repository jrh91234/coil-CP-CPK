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
  
  formatDate: (dateObj) => {
    if (!(dateObj instanceof Date)) return dateObj; 
    return Utilities.formatDate(dateObj, Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm:ss");
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
      sheet.appendRow(["ImageKey", "DataPart1", "DataPart2", "DataPart3"]);
      sheet.getRange(1, 1, 1, 4).setFontWeight("bold").setBackground(Config.HEADER_COLOR);
    }
    return sheet;
  }

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

    const sheet = this._getSheet();
    const values = sheet.getDataRange().getValues();
    let rowIdx = -1;
    for (let i = 1; i < values.length; i++) {
      if (String(values[i][0]) === imageKey) { rowIdx = i + 1; break; }
    }
    if (rowIdx > 0) {
      sheet.getRange(rowIdx, 1, 1, 4).setValues([[imageKey, part1, part2, part3]]);
    } else {
      sheet.appendRow([imageKey, part1, part2, part3]);
    }
    return dataUrl;
  }

  delete(imageKey) {
    const sheet = this._getSheet();
    const values = sheet.getDataRange().getValues();
    for (let i = 1; i < values.length; i++) {
      if (String(values[i][0]) === imageKey) { sheet.deleteRow(i + 1); break; }
    }
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

  getAllRecords() {
    const sheet = this._getSheet();
    const values = sheet.getDataRange().getValues();
    
    if (values.length <= 1) return [];
    
    const rawData = values.slice(1);
    
    return rawData.map((row, index) => ({
      rowNumber: index + 2,
      timestamp: ResponseHelper.formatDate(new Date(row[0])),
      machine: row[1],
      part: row[2],
      parameter: row[3],
      operator: row[4],
      value: row[5],
      setupType: row[6] || ""
    }));
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
      const url = imgRepo.save(postData.itemKey, postData.dataUrl);
      return ResponseHelper.success({ url });
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
    // ดึง URL รูปภาพตำแหน่งวัดทั้งหมด
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
    // ดึงข้อมูลประวัติ History ปกติ
    // ----------------------------------------------------
    const repo = new SheetRepository();
    const records = repo.getAllRecords();
    return ResponseHelper.success(records);
    
  } catch (error) {
    return ResponseHelper.error(error.toString());
  }
}
