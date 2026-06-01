/**
 * =========================================================================
 * MODULE 1: CONFIGURATION
 * =========================================================================
 */
const Config = {
  // ชื่อแท็บที่จะใช้บันทึกข้อมูลการวัด (ปรับตามชื่อแท็บใน Google Sheet ของคุณ)
  SHEET_NAME: "Coil winding output",
  HEADERS: ["Timestamp", "Machine_ID", "Part_ID", "Parameter", "Operator", "Measured_Value"],
  HEADER_COLOR: "#d0e0e3",

  // ID ของ Google Sheet ไฟล์ Master (ที่มีแท็บ Config)
  MASTER_SHEET_ID: "11NGAEXnTZIXMseO_0vfA-yRWxBXEiWpNkCIdIQq2ftQ",

  // ชื่อโฟลเดอร์ใน Google Drive สำหรับเก็บรูปตำแหน่งวัด
  IMAGE_FOLDER_NAME: "SPC_ItemImages",
  // ชื่อแท็บใน Google Sheet สำหรับเก็บ URL รูปภาพ
  IMAGE_SHEET_NAME: "ItemImages"
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

// --- Image Repository: เก็บรูปใน Google Drive, อ้างอิง URL ใน Sheet ---
class ImageRepository {
  constructor(ss) {
    this.ss = ss;
  }

  _getSheet() {
    let sheet = this.ss.getSheetByName(Config.IMAGE_SHEET_NAME);
    if (!sheet) {
      sheet = this.ss.insertSheet(Config.IMAGE_SHEET_NAME);
      sheet.appendRow(["ItemKey", "FileId", "ImageUrl"]);
      sheet.getRange(1, 1, 1, 3).setFontWeight("bold").setBackground(Config.HEADER_COLOR);
    }
    return sheet;
  }

  _getFolder() {
    const iter = DriveApp.getFoldersByName(Config.IMAGE_FOLDER_NAME);
    return iter.hasNext() ? iter.next() : DriveApp.createFolder(Config.IMAGE_FOLDER_NAME);
  }

  getAll() {
    const sheet = this._getSheet();
    const values = sheet.getDataRange().getValues();
    const result = {};
    for (let i = 1; i < values.length; i++) {
      if (values[i][0]) result[String(values[i][0])] = String(values[i][2]);
    }
    return result;
  }

  save(itemKey, base64Data, mimeType) {
    // ลบไฟล์เก่าออกก่อน
    this._trashExistingFile(itemKey);

    // สร้างไฟล์ใหม่ใน Drive
    const folder = this._getFolder();
    const decoded = Utilities.base64Decode(base64Data);
    const blob = Utilities.newBlob(decoded, mimeType || "image/jpeg", "spc_" + itemKey + ".jpg");
    const file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE, DriveApp.Permission.VIEW);

    const fileId = file.getId();
    const imageUrl = "https://lh3.googleusercontent.com/d/" + fileId;

    // บันทึก URL ลง Sheet
    const sheet = this._getSheet();
    const values = sheet.getDataRange().getValues();
    let rowIdx = -1;
    for (let i = 1; i < values.length; i++) {
      if (String(values[i][0]) === itemKey) { rowIdx = i + 1; break; }
    }
    if (rowIdx > 0) {
      sheet.getRange(rowIdx, 1, 1, 3).setValues([[itemKey, fileId, imageUrl]]);
    } else {
      sheet.appendRow([itemKey, fileId, imageUrl]);
    }
    return imageUrl;
  }

  delete(itemKey) {
    this._trashExistingFile(itemKey);
    const sheet = this._getSheet();
    const values = sheet.getDataRange().getValues();
    for (let i = 1; i < values.length; i++) {
      if (String(values[i][0]) === itemKey) { sheet.deleteRow(i + 1); break; }
    }
  }

  _trashExistingFile(itemKey) {
    const sheet = this._getSheet();
    const values = sheet.getDataRange().getValues();
    for (let i = 1; i < values.length; i++) {
      if (String(values[i][0]) === itemKey && values[i][1]) {
        try { DriveApp.getFileById(String(values[i][1])).setTrashed(true); } catch (e) {}
        break;
      }
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
      data.value
    ]);
  }

  getAllRecords() {
    const sheet = this._getSheet();
    const values = sheet.getDataRange().getValues();
    
    if (values.length <= 1) return [];
    
    const rawData = values.slice(1);
    
    return rawData.map(row => ({
      timestamp: ResponseHelper.formatDate(new Date(row[0])),
      machine: row[1],
      part: row[2],
      parameter: row[3],
      operator: row[4],
      value: row[5]
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

    if (postData.action === "upload_image") {
      const imgRepo = new ImageRepository(ss);
      const url = imgRepo.save(postData.itemKey, postData.imageData, postData.mimeType);
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

/**
 * =========================================================================
 * MODULE 4: AUTHORIZATION HELPER
 * =========================================================================
 * วิธีใช้: เลือกฟังก์ชัน authorizeApp แล้วกด ▶ Run ใน Apps Script editor
 * ระบบจะขอสิทธิ์ Google Drive → กด Allow แล้ว deploy ใหม่ 1 ครั้ง
 */
function authorizeApp() {
  DriveApp.getRootFolder();
  SpreadsheetApp.getActiveSpreadsheet();
  Logger.log('✅ Authorization complete — Drive + Sheets permissions granted.');
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
