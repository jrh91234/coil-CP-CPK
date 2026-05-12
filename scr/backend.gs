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
  MASTER_SHEET_ID: "11NGAEXnTZIXMseO_0vfA-yRWxBXEiWpNkCIdIQq2ftQ"
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
    const repo = new SheetRepository();
    
    if (postData.action === "add") {
      repo.addRecord(postData.data);
      return ResponseHelper.success(null, "Data saved successfully");
    }
    
    return ResponseHelper.error("Invalid action specified.");
  } catch (error) {
    return ResponseHelper.error(error.toString());
  }
}

function doGet(e) {
  try {
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
