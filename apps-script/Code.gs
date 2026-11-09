/**
 * ===================================================================
 * ULTRA-OPTIMIZED ATTENDANCE SYSTEM - PRODUCTION VERSION 5.0 (PWA)
 * Status: UNIFIED MULTI-SHEET ENGINE + PWA MOBILE-FIRST
 * Features:
 *  - Single unified search across all sheets (No category pre-selection)
 *  - Smart Branch No. heuristics:
 *      * 10001 - 10500  -> Student Boys
 *      * 10501+         -> Student Girls
 *      * 1 - 10000      -> Jigyasu Gents & Jigyasu Ladies (shows both on overlap)
 *  - Clean Branch Attendance / Sewa Attendance mode switch
 *  - Volunteer identity logging (Zero Google OAuth "Unsafe App" warnings)
 *  - Full back-date attendance & queue batch processing preserved
 *  - DOR (Date of Registration) calculations preserved
 *  - PWA install & mobile viewport enhancements
 * ===================================================================
 */

// ============= GLOBAL CONFIGURATION =============
const QUEUE_CACHE_KEY = 'ATTENDANCE_QUEUE';
const COLUMN_CACHE_PREFIX = 'COL_INDEX_';
const LOCK_TIMEOUT = 10000;
const FAST_LOCK_TIMEOUT = 5000;
const CACHE_EXPIRY = 21600; // 6 hours
const MAX_QUEUE_BATCH_SIZE = 100;

// Sheet mapping definitions with branch number range rules
const TARGET_GROUPS = {
  BRANCH: [
    { key: 'StudentB', sheetName: 'Student_Boys_Satsang', label: 'Student Boys', color: 'blue', minBranch: 10001, maxBranch: 10500 },
    { key: 'StudentG', sheetName: 'Student_Girls_Satsang', label: 'Student Girls', color: 'purple', minBranch: 10501, maxBranch: 999999 },
    { key: 'JigyasuG', sheetName: 'Jigyasu_Gents_Satsang', label: 'Jigyasu Gents', color: 'emerald', minBranch: 1, maxBranch: 10000 },
    { key: 'JigyasuL', sheetName: 'Jigyasu_Ladies_Satsang', label: 'Jigyasu Ladies', color: 'amber', minBranch: 1, maxBranch: 10000 }
  ],
  SEWA: [
    { key: 'StudentB_Sewa', sheetName: 'Student_Boys_Sewa', label: 'Student Boys', color: 'blue', minBranch: 10001, maxBranch: 10500 },
    { key: 'StudentG_Sewa', sheetName: 'Student_Girls_Sewa', label: 'Student Girls', color: 'purple', minBranch: 10501, maxBranch: 999999 },
    { key: 'JigyasuG_Sewa', sheetName: 'Jigyasu_Gents_Sewa', label: 'Jigyasu Gents', color: 'emerald', minBranch: 1, maxBranch: 10000 },
    { key: 'JigyasuL_Sewa', sheetName: 'Jigyasu_Ladies_Sewa', label: 'Jigyasu Ladies', color: 'amber', minBranch: 1, maxBranch: 10000 }
  ]
};

// ============= ROUTING & CORE FUNCTIONS =============

function doGet(e) {
  const page = (e && e.parameter && e.parameter.page) ? e.parameter.page : 'index';
  let template;
  let title = 'Attendance App';

  switch (page) {
    case 'info':
      template = HtmlService.createTemplateFromFile('InfoSearch');
      title = 'Member Info - Adanbagh';
      break;
    case 'admin':
      template = HtmlService.createTemplateFromFile('Admin');
      title = 'Admin Panel - Adanbagh';
      break;
    default:
      template = HtmlService.createTemplateFromFile('Index');
      title = 'Adanbagh Attendance';
  }

  // Pre-inject script URL server-side so all navigation links work instantly from millisecond 0
  template.scriptUrl = ScriptApp.getService().getUrl();

  return template.evaluate()
    .setTitle(title)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function getScriptUrl() {
  return ScriptApp.getService().getUrl();
}

/**
 * Creates the time-based trigger for queue processing.
 */
function setupTrigger() {
  ScriptApp.getProjectTriggers().forEach(trigger => {
    ScriptApp.deleteTrigger(trigger);
  });
  
  ScriptApp.newTrigger('processQueue')
    .timeBased()
    .everyMinutes(1)
    .create();
    
  Logger.log('Optimized queue trigger created successfully.');
}

// ============= DYNAMIC CONFIGURATION (DYNAMIC COLUMN RESOLUTION) =============

/**
 * Robust date parser for multiple string formats.
 * Supports slashes (M/D/YY), hyphens (DD-MM-YYYY), and dots (DD.MM.YYYY).
 */
function parseSmartDate(val) {
  if (!val || String(val).trim() === '') return null;
  if (val instanceof Date) return val;
  
  const str = String(val).trim();
  
  // Try slashes first (M/D/YY or MM/DD/YYYY)
  const slashParts = str.split('/');
  if (slashParts.length === 3) {
    let month = parseInt(slashParts[0]) - 1;
    let day = parseInt(slashParts[1]);
    let year = parseInt(slashParts[2]);
    if (year < 100) year += 2000;
    return new Date(year, month, day);
  }
  
  // Try hyphens or dots
  const cleanStr = str.replace(/\./g, '-');
  const parts = cleanStr.split('-');
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    }
    let day = parseInt(parts[0]);
    let month = parseInt(parts[1]) - 1;
    let year = parseInt(parts[2]);
    if (year < 100) year += 2000;
    return new Date(year, month, day);
  }
  
  const fallback = new Date(val);
  return isNaN(fallback.getTime()) ? null : fallback;
}

/**
 * Dynamically scans the header row of a sheet at runtime to construct column index map.
 */
function resolveSheetConfig(sheetName) {
  const cache = CacheService.getScriptCache();
  const cacheKey = `RESOLVED_CONFIG_${sheetName}`;
  const cached = cache.get(cacheKey);
  
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch(e) {}
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error(`Sheet "${sheetName}" not found.`);

  const lastCol = sheet.getLastColumn();
  if (lastCol === 0) throw new Error(`Sheet "${sheetName}" is empty.`);
  
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h).trim());

  function findColIndex(possibleNames, occurrence = 1) {
    let count = 0;
    for (let i = 0; i < headers.length; i++) {
      const h = headers[i].toLowerCase();
      if (possibleNames.some(name => h === name.toLowerCase())) {
        count++;
        if (count === occurrence) return i;
      }
    }
    return null;
  }

  const config = {
    sheetName: sheetName,
    branchNoCol: findColIndex(["Branch No.", "Branch No", "BranchNo"]) || 0,
    titleCol: findColIndex(["Title", "TITLE"], 1) || 1,
    firstNameCol: findColIndex(["First Name", "FirstName"], 1) || 2,
    middleNameCol: findColIndex(["Middle Name", "MiddleName"], 1) || 3,
    lastNameCol: findColIndex(["Last Name", "LastName"], 1) || 4,
    nameCol: findColIndex(["Complete Name", "CompleteName", "Name"]) || 5,
    dobCol: findColIndex(["DOB", "D.O.B.", "Date of Birth"]) || 9,
    ageCol: findColIndex(["AGE", "Age"]) || 10,
    
    fatherNameCol: findColIndex(["Complete Fathers Name", "Complete Father Name", "Father's Name", "Fathers Name"]) || 15,
    motherNameCol: findColIndex(["Complete Mothers Name", "Complete Mother Name", "Mother's Name", "Mothers Name"]),
    spouseNameCol: findColIndex(["COMPLETE SPOUSE NAME", "Complete Spouse Name", "Spouse Name"]),
    
    addressCol: findColIndex(["COMPLETE ADDRESS", "Complete Address", "Address"]) || 28,
    phoneCol: findColIndex(["Phone No.", "Phone No", "Phone", "Phone Number"]) || 29,
    emailCol: findColIndex(["EMAIL ID", "Email ID", "Email"]) || 30,
    classCol: findColIndex(["CLASS", "Class"]),
    occupationCol: findColIndex(["OCCUPATION", "Occupation"]),
    aadhaarCol: findColIndex(["Aadhar Number", "Aadhar", "Aadhaar", "Aadhaar Number", "Member Aadhaar"]) || 34,
    dorCol: findColIndex(["D O R", "D.O.R.", "DOR", "Date of Registration"]) || 38,
    prefilledCol: findColIndex(["Total Attendance up to 31.10.25", "Prefilled Attendance"]) || 39,
    attendanceStartCol: 40
  };

  let foundStart = false;
  for (let i = 30; i < headers.length; i++) {
    const headerVal = headers[i];
    if (!headerVal) continue;
    
    const parsed = parseSmartDate(headerVal);
    if (parsed && !isNaN(parsed.getTime())) {
      const isMetadata = ["dob", "d o r", "date of registration", "dor"].some(meta => headers[i].toLowerCase().includes(meta));
      if (!isMetadata) {
        config.attendanceStartCol = i;
        foundStart = true;
        break;
      }
    }
  }

  if (!foundStart) {
    config.attendanceStartCol = Math.max(config.prefilledCol + 1, lastCol);
  }

  cache.put(cacheKey, JSON.stringify(config), CACHE_EXPIRY);
  return config;
}

/**
 * Returns dynamic configuration map mapped to target group's active sheet name.
 */
function getSheetConfig(targetGroup) {
  const names = {
    'StudentB': 'Student_Boys_Satsang',
    'StudentG': 'Student_Girls_Satsang',
    'StudentB_Sewa': 'Student_Boys_Sewa',
    'StudentG_Sewa': 'Student_Girls_Sewa',
    'JigyasuG': 'Jigyasu_Gents_Satsang',
    'JigyasuG_Sewa': 'Jigyasu_Gents_Sewa',
    'JigyasuL': 'Jigyasu_Ladies_Satsang',
    'JigyasuL_Sewa': 'Jigyasu_Ladies_Sewa'
  };

  const sheetName = names[targetGroup] || 'Student_Boys_Satsang';
  return resolveSheetConfig(sheetName);
}

// ============= STREAMLINED CACHE & SEARCH ENGINE =============

/**
 * Retrieves a compact search index for a sheet { b: branchNo, n: name, d: dob, f: fatherName }.
 * Storing only 4 essentials keeps cache size tiny (<20KB) and avoids 100KB CacheService limits.
 */
function getSheetSearchIndex(targetKey) {
  const cache = CacheService.getScriptCache();
  const cacheKey = `SEARCH_IDX_${targetKey}`;
  const cached = cache.get(cacheKey);
  
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch (e) {}
  }
  
  try {
    const config = getSheetConfig(targetKey);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(config.sheetName);
    if (!sheet) return [];
    
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return [];
    
    const maxCol = Math.min(sheet.getLastColumn(), config.attendanceStartCol);
    const data = sheet.getRange(2, 1, lastRow - 1, maxCol).getValues();
    
    const index = [];
    for (let r = 0; r < data.length; r++) {
      const row = data[r];
      const bNo = String(row[config.branchNoCol] || '').trim();
      if (!bNo) continue;
      
      let dobStr = 'N/A';
      const rawDob = row[config.dobCol];
      if (rawDob instanceof Date) {
        dobStr = Utilities.formatDate(rawDob, "GMT+5:30", "dd-MM-yyyy");
      } else if (rawDob) {
        dobStr = String(rawDob).trim();
      }
      
      let fName = 'N/A';
      if (config.fatherNameCol !== null && config.fatherNameCol !== undefined && row[config.fatherNameCol]) {
        fName = String(row[config.fatherNameCol]).trim();
      }
      
      index.push({
        b: bNo,
        n: String(row[config.nameCol] || '').trim(),
        d: dobStr,
        f: fName
      });
    }
    
    cache.put(cacheKey, JSON.stringify(index), 1800); // 30 mins
    return index;
  } catch (e) {
    Logger.log(`Error building search index for ${targetKey}: ${e.message}`);
    return [];
  }
}

/**
 * UNIFIED SEARCH FUNCTION:
 * Searches across all relevant sheets in the chosen attendance mode (Branch or Sewa).
 * Uses static branch number heuristics:
 *   - 10001 - 10500 -> Student Boys
 *   - 10501+        -> Student Girls
 *   - 1 - 10000     -> Jigyasu Gents & Jigyasu Ladies
 * If overlapping branch numbers or duplicate names exist, returns all matches with category labels.
 */
function findStudents(searchTerm, searchType, attendanceType) {
  attendanceType = attendanceType || 'Branch';
  const query = String(searchTerm || '').trim().toLowerCase();
  if (!query) return [];
  
  const isSewa = (attendanceType === 'Sewa');
  const groupList = isSewa ? TARGET_GROUPS.SEWA : TARGET_GROUPS.BRANCH;
  const isBranchNo = (searchType === 'branchNo');
  const numVal = parseInt(query, 10);
  
  // Apply intelligent group routing for branch numbers
  let primaryTargets = [];
  if (isBranchNo && !isNaN(numVal)) {
    if (numVal >= 10501) {
      primaryTargets = groupList.filter(g => g.key.includes('StudentG'));
    } else if (numVal >= 10001) {
      primaryTargets = groupList.filter(g => g.key.includes('StudentB'));
    } else {
      // 1 to 10000: check both Jigyasu Gents & Ladies
      primaryTargets = groupList.filter(g => g.key.includes('Jigyasu'));
    }
  } else {
    // Name search: scan all 4 sheets in that mode
    primaryTargets = groupList;
  }
  
  const results = [];
  
  function scanGroups(groups) {
    groups.forEach(g => {
      const index = getSheetSearchIndex(g.key);
      index.forEach(item => {
        let isMatch = false;
        if (isBranchNo) {
          isMatch = (item.b.toLowerCase() === query);
        } else {
          isMatch = item.n.toLowerCase().includes(query);
        }
        
        if (isMatch) {
          results.push({
            branchNo: item.b,
            name: item.n,
            dob: item.d,
            fatherName: item.f,
            targetGroup: g.key,
            categoryLabel: g.label,
            color: g.color,
            attendanceMode: attendanceType
          });
        }
      });
    });
  }
  
  scanGroups(primaryTargets);
  
  // Fallback: If branch number was not found in predicted range, scan remaining groups
  if (isBranchNo && results.length === 0 && primaryTargets.length < groupList.length) {
    const remaining = groupList.filter(g => !primaryTargets.includes(g));
    scanGroups(remaining);
  }
  
  return results;
}

// ============= VOLUNTEER IDENTITY & LOGGING =============

/**
 * Returns available volunteer emails from the spreadsheet, or standard fallback.
 * Allows seamless volunteer identification without Google OAuth permission screens.
 */
function getVolunteersList() {
  const defaultList = [
    'avichalyadav2104228@dei.ac.in',
    'maharajsaran.db@gmail.com',
    'maharajsaran@dei.ac.in',
    'avichal.ydv@gmail.com',
    'adanbagh1@gmail.com'
  ];
  
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('Authorized_Users') || ss.getSheetByName('Emails') || ss.getSheetByName('Volunteers');
    if (sheet) {
      const values = sheet.getDataRange().getValues();
      const list = [];
      for (let i = 1; i < values.length; i++) {
        for (let j = 0; j < values[i].length; j++) {
          const val = String(values[i][j]).trim();
          if (val && val.includes('@')) list.push(val);
        }
      }
      if (list.length > 0) return [...new Set(list)];
    }
  } catch (e) {}
  
  return defaultList;
}

// ============= QUEUE ARCHITECTURE =============

/**
 * Adds an attendance mark request to the queue.
 * Captures volunteer identity without requiring OAuth.
 */
function markPresent(payload, targetGroup) {
  const branchNo = payload.branchNo || payload; 
  const targetDate = payload.date || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
  const markedBy = payload.markedBy || 'Volunteer';

  const lock = LockService.getScriptLock();
  
  try {
    if (!lock.tryLock(FAST_LOCK_TIMEOUT)) return 'ERROR_LOCKED';
  } catch (e) { return 'ERROR_LOCKED'; }
  
  try {
    const cache = CacheService.getScriptCache();
    let queue = [];
    const queueJson = cache.get(QUEUE_CACHE_KEY);
    
    if (queueJson) {
      try { queue = JSON.parse(queueJson); } catch (e) { queue = []; }
    }

    const queueKey = `${branchNo}_${targetGroup}_${targetDate}`;
    if (queue.some(item => `${item.branchNo}_${item.target}_${item.date}` === queueKey)) {
      lock.releaseLock();
      return 'DUPLICATE';
    }
    
    queue.push({ 
      branchNo: String(branchNo), 
      target: targetGroup, 
      date: targetDate,
      markedBy: markedBy,
      timestamp: Date.now() 
    });
    
    cache.put(QUEUE_CACHE_KEY, JSON.stringify(queue), CACHE_EXPIRY);
    lock.releaseLock();
    return 'SUCCESS';
    
  } catch (e) {
    Logger.log(`markPresent Error: ${e.message}`);
    lock.releaseLock();
    return 'ERROR';
  }
}

/**
 * Triggered function to process the attendance queue.
 * Marks 'P' in target sheets and records audit logs into 'Attendance_Logs' if present.
 */
function processQueue() {
  const lock = LockService.getScriptLock();
  try { if (!lock.tryLock(LOCK_TIMEOUT)) return; } catch (e) { return; }
  
  const cache = CacheService.getScriptCache();
  const queueJson = cache.get(QUEUE_CACHE_KEY);
  
  if (!queueJson) { lock.releaseLock(); return; }

  let queue = JSON.parse(queueJson);
  if (queue.length === 0) { lock.releaseLock(); return; }
  
  cache.remove(QUEUE_CACHE_KEY);
  
  if (queue.length > MAX_QUEUE_BATCH_SIZE) {
    const remaining = queue.slice(MAX_QUEUE_BATCH_SIZE);
    queue = queue.slice(0, MAX_QUEUE_BATCH_SIZE);
    cache.put(QUEUE_CACHE_KEY, JSON.stringify(remaining), CACHE_EXPIRY);
  }
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ssTimeZone = ss.getSpreadsheetTimeZone();

  // Group queue by Target Group AND Date
  const grouped = queue.reduce((acc, item) => {
    const dateKey = item.date || Utilities.formatDate(new Date(), ssTimeZone, "yyyy-MM-dd");
    const key = `${item.target}|${dateKey}`;
    (acc[key] = acc[key] || []).push(item);
    return acc;
  }, {});

  const results = { success: 0, failed: 0, notFound: 0 };
  const auditLogs = [];

  for (const key in grouped) {
    try {
      const [targetGroup, dateStr] = key.split('|');
      const items = grouped[key];
      const branchNosToMark = [...new Set(items.map(it => it.branchNo))];
      const config = getSheetConfig(targetGroup);
      const sheet = ss.getSheetByName(config.sheetName);
      
      if (!sheet) { results.failed += items.length; continue; }
      
      const numRows = sheet.getLastRow();
      const lastCol = sheet.getLastColumn();
      if (numRows <= 1) { results.notFound += items.length; continue; }

      let headers = [];
      if (lastCol > 0) headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];

      const parts = dateStr.split('-');
      const targetDate = new Date(parts[0], parseInt(parts[1]) - 1, parts[2]);
      const targetSearchStr = Utilities.formatDate(targetDate, ssTimeZone, "yyyy-MM-dd");
      const targetDisplayStr = Utilities.formatDate(targetDate, ssTimeZone, "M/d/yy");

      let colIndex = -1;
      
      for (let i = config.attendanceStartCol; i < headers.length; i++) {
        const headerValue = headers[i];
        let headerString = "";
        if (headerValue instanceof Date) {
          headerString = Utilities.formatDate(headerValue, ssTimeZone, "yyyy-MM-dd");
        } else if (headerValue) {
          const parsed = parseSmartDate(headerValue);
          if (parsed) headerString = Utilities.formatDate(parsed, ssTimeZone, "yyyy-MM-dd");
        }

        if (headerString === targetSearchStr) {
          colIndex = i + 1;
          break;
        }
      }
      
      if (colIndex === -1) {
        let nextColumnPosition = Math.max(lastCol, config.attendanceStartCol);
        colIndex = nextColumnPosition + 1;
        
        const headerCell = sheet.getRange(1, colIndex);
        headerCell.setValue(targetDisplayStr)
          .setNumberFormat("M/d/yy")
          .setFontWeight("bold")
          .setHorizontalAlignment("center");
        SpreadsheetApp.flush();
      }

      const branchRange = sheet.getRange(2, 1, numRows - 1, 1);
      const attendanceRange = sheet.getRange(2, colIndex, numRows - 1, 1);
      
      const branchData = branchRange.getValues();
      const attendanceData = attendanceRange.getValues();
      
      const branchNoMap = new Map();
      branchData.forEach((row, index) => {
        const bNo = String(row[0]).trim();
        if (bNo) branchNoMap.set(bNo, index);
      });
      
      let markedCount = 0;
      items.forEach(item => {
        const rowIndex = branchNoMap.get(String(item.branchNo).trim());
        if (rowIndex !== undefined) {
          attendanceData[rowIndex][0] = 'P';
          markedCount++;
          
          // Prepare audit log entry: Timestamp, Date, Branch No, Name, Father Name, MarkedBy, Target
          auditLogs.push([
            new Date(),
            dateStr,
            item.branchNo,
            sheet.getRange(rowIndex + 2, config.nameCol + 1).getValue() || '',
            (config.fatherNameCol !== null) ? sheet.getRange(rowIndex + 2, config.fatherNameCol + 1).getValue() : '',
            item.markedBy || 'Volunteer',
            targetGroup
          ]);
        } else {
          results.notFound++;
        }
      });
      
      if (markedCount > 0) {
        attendanceRange.setValues(attendanceData);
        results.success += markedCount;
      }
      
    } catch (e) {
      Logger.log(`Error processing ${key}: ${e.message}`);
      results.failed += grouped[key].length;
    }
  }
  
  // Write audit log to 'Attendance_Logs' sheet if it exists
  if (auditLogs.length > 0) {
    try {
      const logsSheet = ss.getSheetByName('Attendance_Logs');
      if (logsSheet) {
        const lastLogRow = logsSheet.getLastRow();
        logsSheet.getRange(lastLogRow + 1, 1, auditLogs.length, auditLogs[0].length).setValues(auditLogs);
      }
    } catch (e) {
      Logger.log(`Attendance_Logs recording failed: ${e.message}`);
    }
  }

  SpreadsheetApp.flush();
  lock.releaseLock();
  Logger.log(`processQueue finished | Success: ${results.success}`);
}

// ============= STATS & DETAILS =============

/**
 * Calculates attendance statistics based on registration date.
 */
function getAttendanceStats(branchNo, targetGroup) {
  try {
    const config = getSheetConfig(targetGroup);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(config.sheetName);
    if (!sheet) return { present: 0, total: 0, percentage: 0, dor: 'N/A' };
    
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return { present: 0, total: 0, percentage: 0, dor: 'N/A' };
    
    const branchNos = sheet.getRange(2, 1, lastRow - 1, 1).getValues().flat();
    const rowIndex = branchNos.findIndex(b => String(b).trim() == String(branchNo).trim());
    if (rowIndex === -1) return { present: 0, total: 0, percentage: 0, dor: 'N/A' };
    
    const rowData = sheet.getRange(rowIndex + 2, 1, 1, sheet.getLastColumn()).getValues()[0];
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    
    const regDateStr = rowData[config.dorCol];
    const regDate = parseSmartDate(regDateStr);
    const basePresentCount = parseInt(rowData[config.prefilledCol]) || 0;
    
    let dynamicPresentCount = 0;
    let dynamicTotalClasses = 0;
    
    for (let i = config.attendanceStartCol; i < headers.length; i++) {
      const classDate = parseSmartDate(headers[i]);
      if (classDate) {
        if (!regDate || classDate.getTime() >= regDate.getTime()) {
          dynamicTotalClasses++;
          const mark = String(rowData[i]).trim().toUpperCase();
          if (mark === 'P' || mark === 'PRESENT') dynamicPresentCount++;
        }
      }
    }
    
    const finalPresentCount = basePresentCount + dynamicPresentCount;
    const finalTotalClasses = basePresentCount + dynamicTotalClasses;
    const percentage = (finalTotalClasses > 0) ? ((finalPresentCount / finalTotalClasses) * 100).toFixed(1) : 0;

    return { 
      present: finalPresentCount, 
      total: finalTotalClasses, 
      percentage, 
      dor: regDateStr || 'N/A' 
    };
  } catch (e) {
    return { present: 0, total: 0, percentage: 0, dor: 'Error' };
  }
}

/**
 * Gets full details for a member for the info modal.
 */
function getStudentDetailsForInfoPage(branchNo, baseTargetGroup) {
  const config = getSheetConfig(baseTargetGroup);
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(config.sheetName);
  if (!sheet) return null;
  
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  
  const branchNos = sheet.getRange(2, 1, lastRow - 1, 1).getValues().flat();
  const rowIndex = branchNos.findIndex(b => String(b).trim() == String(branchNo).trim());
  if (rowIndex === -1) return null;
  
  const studentData = sheet.getRange(rowIndex + 2, 1, 1, sheet.getLastColumn()).getValues()[0];

  const details = {
    'Branch No.': studentData[config.branchNoCol],
    'Name': studentData[config.nameCol],
    'DOB': studentData[config.dobCol] instanceof Date ? Utilities.formatDate(studentData[config.dobCol], "GMT+5:30", "dd-MM-yyyy") : (studentData[config.dobCol] || 'N/A'),
    'Age': studentData[config.ageCol],
    'Phone No.': studentData[config.phoneCol],
    'Email ID': studentData[config.emailCol] || 'N/A',
    'Address': studentData[config.addressCol],
    'Aadhaar': studentData[config.aadhaarCol],
    'D O R': studentData[config.dorCol],
  };
  
  if (config.fatherNameCol !== null && config.fatherNameCol !== undefined) details["Father's Name"] = studentData[config.fatherNameCol];
  if (config.motherNameCol !== null && config.motherNameCol !== undefined) details["Mother's Name"] = studentData[config.motherNameCol];
  if (config.spouseNameCol !== null && config.spouseNameCol !== undefined) details['Spouse Name'] = studentData[config.spouseNameCol];
  if (config.classCol !== null && config.classCol !== undefined) details['Class'] = studentData[config.classCol];
  if (config.occupationCol !== null && config.occupationCol !== undefined) details['Occupation'] = studentData[config.occupationCol];
  
  return {
    details,
    satsangStats: getAttendanceStats(branchNo, baseTargetGroup.replace('_Sewa', '')),
    sewaStats: getAttendanceStats(branchNo, `${baseTargetGroup.replace('_Sewa', '')}_Sewa`)
  };
}

// ============= ADMIN FUNCTIONS =============

function invalidateCaches(sheetName) {
  const cache = CacheService.getScriptCache();
  cache.remove(`${COLUMN_CACHE_PREFIX}${sheetName}`);
  cache.remove(`RESOLVED_CONFIG_${sheetName}`);
  
  // Clear search index keys
  const keys = ['StudentB', 'StudentG', 'JigyasuG', 'JigyasuL', 'StudentB_Sewa', 'StudentG_Sewa', 'JigyasuG_Sewa', 'JigyasuL_Sewa'];
  keys.forEach(k => cache.remove(`SEARCH_IDX_${k}`));
}

/**
 * Adds a new member to the sheet.
 */
function addStudent(studentData, targetGroup, alsoAddToSewa) {
  try {
    const config = getSheetConfig(targetGroup);
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(config.sheetName);
    if (!sheet) throw new Error(`Sheet ${config.sheetName} not found`);

    const lastRow = sheet.getLastRow();
    let branchNos = [];
    if (lastRow > 1) {
      branchNos = sheet.getRange(2, 1, lastRow - 1, 1).getValues().flat().map(n => parseInt(n)).filter(n => !isNaN(n));
    }
    let nextBranchNo;

    if (targetGroup.includes('Jigyasu')) {
      nextBranchNo = branchNos.length > 0 ? Math.max(...branchNos) + 1 : 1;
    } else {
      if (studentData.title === 'MR') {
        const maleNos = branchNos.filter(n => n >= 10001 && n <= 10500);
        nextBranchNo = maleNos.length > 0 ? Math.max(...maleNos) + 1 : 10001;
      } else {
        const femaleNos = branchNos.filter(n => n >= 10501);
        nextBranchNo = femaleNos.length > 0 ? Math.max(...femaleNos) + 1 : 10501;
      }
    }

    const columnsCount = Math.max(sheet.getLastColumn(), config.attendanceStartCol);
    const newRow = new Array(columnsCount).fill('');
    const todayStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd-MM-yyyy");
    
    // 1. Core Identity
    newRow[config.branchNoCol] = nextBranchNo;
    newRow[config.titleCol] = studentData.title;
    newRow[config.firstNameCol] = studentData.firstName;
    newRow[config.middleNameCol] = studentData.middleName;
    newRow[config.lastNameCol] = studentData.lastName;
    newRow[config.nameCol] = [studentData.firstName, studentData.middleName, studentData.lastName].filter(Boolean).join(' ');
    newRow[config.dobCol] = studentData.dob;

    // 2. Family
    if (config.fatherNameCol !== null && config.fatherNameCol !== undefined) {
      newRow[config.fatherNameCol] = [studentData.fatherFirstName, studentData.fatherMiddleName, studentData.fatherLastName].filter(Boolean).join(' ');
    }
    
    if (config.motherNameCol !== null && config.motherNameCol !== undefined) {
      newRow[config.motherNameCol] = [studentData.motherFirstName, studentData.motherMiddleName, studentData.motherLastName].filter(Boolean).join(' ');
    }
    
    if (config.spouseNameCol !== null && config.spouseNameCol !== undefined) {
      newRow[config.spouseNameCol] = [studentData.spouseFirstName, studentData.spouseMiddleName, studentData.spouseLastName].filter(Boolean).join(' ');
    }

    // 3. Contact & Address
    newRow[config.addressCol] = [studentData.address1, studentData.address2, studentData.address3].filter(Boolean).join(', ');
    newRow[config.phoneCol] = studentData.phone;
    newRow[config.emailCol] = studentData.email;
    newRow[config.aadhaarCol] = studentData.aadhar;

    // 4. Metadata
    newRow[config.dorCol] = todayStr;
    newRow[config.prefilledCol] = 0;

    // 5. Profile
    if (config.classCol !== null && config.classCol !== undefined) newRow[config.classCol] = studentData.class;
    if (config.occupationCol !== null && config.occupationCol !== undefined) newRow[config.occupationCol] = studentData.occupation;

    sheet.appendRow(newRow);
    invalidateCaches(config.sheetName);
    
    if (alsoAddToSewa && !targetGroup.includes('_Sewa')) {
      const sewaConfig = getSheetConfig(targetGroup + '_Sewa');
      const sewaSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sewaConfig.sheetName);
      if (sewaSheet) {
        sewaSheet.appendRow(newRow);
        invalidateCaches(sewaConfig.sheetName);
      }
    }
    
    return { status: 'success', message: `Registered ${newRow[config.nameCol]} (Branch ${nextBranchNo}).` };
  
  } catch (e) {
    Logger.log(`addStudent Error: ${e.message}`);
    return { status: 'error', message: `Failed: ${e.message}` };
  }
}

// ============= CACHE WARM-UP & UTILS =============

function warmUpCache() {
  const targets = ['StudentB', 'StudentG', 'JigyasuG', 'JigyasuL', 'StudentB_Sewa', 'StudentG_Sewa', 'JigyasuG_Sewa', 'JigyasuL_Sewa'];
  let count = 0;
  targets.forEach(t => { 
    try { 
      getSheetSearchIndex(t); 
      count++; 
    } catch(e){} 
  });
  return `Warmed ${count} sheet indices`;
}

function warmUpColumnCache() {
  const targets = ['StudentB', 'StudentG', 'JigyasuG', 'JigyasuL', 'StudentB_Sewa', 'StudentG_Sewa', 'JigyasuG_Sewa', 'JigyasuL_Sewa'];
  targets.forEach(t => { try { const c = getSheetConfig(t); } catch(e){} });
}

function clearAllCaches() {
  const cache = CacheService.getScriptCache();
  cache.remove(QUEUE_CACHE_KEY);
  const targets = ['StudentB', 'StudentG', 'JigyasuG', 'JigyasuL', 'StudentB_Sewa', 'StudentG_Sewa', 'JigyasuG_Sewa', 'JigyasuL_Sewa'];
  targets.forEach(t => {
    cache.remove(`SEARCH_IDX_${t}`);
    try {
      const c = getSheetConfig(t);
      invalidateCaches(c.sheetName);
    } catch(e){}
  });
  Logger.log('✓ All caches cleared');
  return "All caches flushed successfully!";
}

function checkQueueStatus() {
  const cache = CacheService.getScriptCache();
  const queueJson = cache.get(QUEUE_CACHE_KEY);
  if (!queueJson) return { length: 0, items: [] };
  const queue = JSON.parse(queueJson);
  return { length: queue.length, items: queue };
}

function processQueueManually() {
  processQueue();
}
