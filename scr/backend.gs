/**
 * Google Apps Script backend for the SPC & Cp/Cpk dashboard.
 *
 * Required deployment:
 * 1. Put this file in an Apps Script project that is bound to the target spreadsheet,
 *    or fill SPREADSHEET_ID below when using a standalone Apps Script project.
 * 2. Deploy as Web app with access allowed for the users who open the dashboard.
 */
const SPREADSHEET_ID = '';
const DATA_SHEET_NAME = 'Data';
const CONFIG_SHEET_NAME = 'Config';

const DATA_HEADERS = ['timestamp', 'machine', 'part', 'parameter', 'value', 'operator'];
const DEFAULT_MASTER_DATA = {
  operators: ['พนักงาน 1', 'พนักงาน 2'],
  machineAssignments: {
    'Machine CWM-01': 'S1B29288-JR (10A)',
    'Machine CWM-02': 'S1B71819-JR (16A)'
  }
};

function doGet(e) {
  const action = getAction_(e);

  if (action === 'get_master') {
    return jsonResponse_({ success: true, data: getMasterData_() });
  }

  if (action === 'get' || !action) {
    return jsonResponse_({ success: true, data: getDataRecords_() });
  }

  return jsonResponse_({ success: false, error: `Unknown action: ${action}` });
}

function doPost(e) {
  const payload = parsePayload_(e);
  const action = payload.action || getAction_(e);

  if (action === 'add') {
    const record = normalizeRecord_(payload.data || payload);
    appendRecord_(record);
    return jsonResponse_({ success: true, data: record });
  }

  return jsonResponse_({ success: false, error: `Unknown action: ${action || ''}` });
}

function getAction_(e) {
  return e && e.parameter && e.parameter.action ? String(e.parameter.action).trim() : '';
}

function parsePayload_(e) {
  if (!e || !e.postData || !e.postData.contents) return {};

  try {
    return JSON.parse(e.postData.contents);
  } catch (error) {
    return {};
  }
}

function getSpreadsheet_() {
  if (SPREADSHEET_ID) {
    return SpreadsheetApp.openById(SPREADSHEET_ID);
  }

  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) {
    throw new Error('Spreadsheet not found. Bind this script to a spreadsheet or set SPREADSHEET_ID.');
  }

  return spreadsheet;
}

function getOrCreateSheet_(name, headers) {
  const spreadsheet = getSpreadsheet_();
  let sheet = spreadsheet.getSheetByName(name);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(name);
  }

  if (headers && sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
  }

  return sheet;
}

function jsonResponse_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function getDataRecords_() {
  const sheet = getOrCreateSheet_(DATA_SHEET_NAME, DATA_HEADERS);
  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) return [];

  const headers = values[0].map(header => String(header).trim());

  return values.slice(1)
    .filter(row => row.some(cell => cell !== ''))
    .map(row => normalizeSheetRecord_(rowToObject_(headers, row)));
}

function appendRecord_(record) {
  const sheet = getOrCreateSheet_(DATA_SHEET_NAME, DATA_HEADERS);
  sheet.appendRow(DATA_HEADERS.map(header => record[header] || ''));
}

function normalizeRecord_(record) {
  return {
    timestamp: record.timestamp || new Date().toLocaleString('th-TH'),
    machine: record.machine || '',
    part: record.part || '',
    parameter: record.parameter || '',
    value: record.value || '',
    operator: record.operator || ''
  };
}

function normalizeSheetRecord_(record) {
  return {
    timestamp: readFirst_(record, ['timestamp', 'time', 'date', 'วันที่', 'เวลา']) || '',
    machine: readFirst_(record, ['machine', 'machineid', 'machine id', 'process', 'เครื่องจักร', 'กระบวนการ']) || '',
    part: readFirst_(record, ['part', 'partid', 'part id', 'รุ่นชิ้นงาน']) || '',
    parameter: readFirst_(record, ['parameter', 'parameterid', 'parameter id', 'item', 'จุดตรวจสอบ']) || '',
    value: readFirst_(record, ['value', 'measuredvalue', 'measured value', 'ค่าที่วัด', 'ค่าที่วัดได้']) || '',
    operator: readFirst_(record, ['operator', 'พนักงาน']) || ''
  };
}

function getMasterData_() {
  const sheet = getOrCreateSheet_(CONFIG_SHEET_NAME, ['operator', 'machine', 'part']);
  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) return DEFAULT_MASTER_DATA;

  const headers = values[0].map(header => String(header).trim().toLowerCase());
  const operators = [];
  const machineAssignments = {};

  values.slice(1).forEach(row => {
    const configRow = rowToObject_(headers, row);
    const operator = readFirst_(configRow, ['operator', 'พนักงาน']);
    const machine = readFirst_(configRow, ['machine', 'machineid', 'machine id', 'process', 'เครื่องจักร', 'กระบวนการ']);
    const part = readFirst_(configRow, ['part', 'partid', 'part id', 'รุ่นชิ้นงาน']);

    if (operator && !operators.includes(operator)) {
      operators.push(operator);
    }

    if (machine && part) {
      machineAssignments[machine] = part;
    }
  });

  return {
    operators: operators.length > 0 ? operators : DEFAULT_MASTER_DATA.operators,
    machineAssignments: Object.keys(machineAssignments).length > 0
      ? machineAssignments
      : DEFAULT_MASTER_DATA.machineAssignments
  };
}

function rowToObject_(headers, row) {
  return headers.reduce((object, header, index) => {
    const value = formatCell_(row[index]);
    object[header] = value;
    object[normalizeKey_(header)] = value;
    return object;
  }, {});
}

function readFirst_(object, keys) {
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i].toLowerCase();
    const normalizedKey = normalizeKey_(key);
    if (object[key]) return object[key];
    if (object[normalizedKey]) return object[normalizedKey];
  }
  return '';
}

function normalizeKey_(key) {
  return String(key).toLowerCase().replace(/[\s_()\-/]+/g, '');
}

function formatCell_(value) {
  if (value instanceof Date) {
    return value.toLocaleString('th-TH');
  }

  return value === null || value === undefined ? '' : String(value).trim();
}
