# Taiwan Fisheries Agency PDF Scraper

This project is a **serverless scraper** deployed on Vercel that automatically fetches the **latest PDF of authorized vessels** from the Taiwan Fisheries Agency website and makes it accessible for download. It is designed to integrate seamlessly with **Google Apps Script** to save PDFs / convert into excel directly into Google Drive.

---

## Features

- Fetches the **latest PDF** link from the Fisheries Agency page.
- Follows the redirect to get the **actual PDF content**.
- Sanitizes filenames to avoid issues with special characters in Vercel or Google Drive.
- Supports **Apps Script integration** for automated download into Google Drive.
- Avoids **duplicate files** by checking existing filenames.

---

## Folder Structure

```
taiwan_fisheries_automation
├─ api/
│ └─ latest-pdf.js
│ └─ latest-pdf-excel.js
├─ package.json
└─ .gitignore
```

---

## Installation

1. Clone the repository:

```bash / cmd
git clone https://github.com/yuanyiho/taiwan_fisheries_automation.git
cd taiwan_fisheries_automation
```

2. Clone the repository:
```
npm install
```

3. Add .gitignore (if not present) to exclude node_modules:
```
node_modules/
.vercel/
```

## Deployment on Vercel
1. Install Vercel CLI:
```
npm install -g vercel
```

2. Deploy the project:
```
vercel deploy --prod
```

3. Endpoint on vercel
```
https://<your-project>.vercel.app/api/latest-pdf
https://<your-project>.vercel.app/api/latest-pdf-excel
```

## App Script Integration
```
function updateVesselMasterSheet() {
  const url = "URL"; // Vercel XLSX endpoint

  // 1. Fetch XLSX from Vercel
  const resp = UrlFetchApp.fetch(url);
  if (resp.getResponseCode() !== 200) {
    throw new Error("Failed to fetch XLSX: " + resp.getContentText());
  }
  const xlsxBlob = resp.getBlob().setName("latest.xlsx");

  // 2. Prepare multipart payload correctly
  const boundary = "-------314159265358979323846";
  const delimiter = "\r\n--" + boundary + "\r\n";
  const closeDelimiter = "\r\n--" + boundary + "--";

  const metadata = {
    name: "tempFile",
    mimeType: "application/vnd.google-apps.spreadsheet"
  };

  const multipartRequestBody =
    delimiter +
    "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
    JSON.stringify(metadata) +
    delimiter +
    "Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n";

  // Combine multipart body properly using a blob
  const combinedBlob = Utilities.newBlob(
    multipartRequestBody,
    "multipart/related; boundary=" + boundary
  ).getBytes()
    .concat(xlsxBlob.getBytes())
    .concat(Utilities.newBlob(closeDelimiter).getBytes());

  const options = {
    method: "post",
    contentType: "multipart/related; boundary=" + boundary,
    headers: {
      Authorization: "Bearer " + ScriptApp.getOAuthToken()
    },
    payload: combinedBlob,
    muteHttpExceptions: true
  };

  // 3. Send to Drive API v3
  const driveResponse = UrlFetchApp.fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
    options
  );

  const json = JSON.parse(driveResponse.getContentText());
  if (!json.id) throw new Error("Drive API upload failed: " + driveResponse.getContentText());

  const tempFileId = json.id;

  // 4. Open converted temp spreadsheet
  const tempSpreadsheet = SpreadsheetApp.openById(tempFileId);

  // 5. Open master spreadsheet
  const masterSpreadsheet = SpreadsheetApp.openById("Your master copy spreedsheet");

  // 6. Copy tabs to master if tab name doesn't exist
  tempSpreadsheet.getSheets().forEach(sheet => {
    const tabName = sheet.getName();
    if (!masterSpreadsheet.getSheetByName(tabName)) {
      sheet.copyTo(masterSpreadsheet).setName(tabName);
      Logger.log("Added new tab: " + tabName);
    } else {
      Logger.log("Tab already exists, skipping: " + tabName);
    }
  });

  // 7. Delete temporary sheet from Drive
  DriveApp.getFileById(tempFileId).setTrashed(true);

}

/**
 * Creates a time-based trigger to run updateVesselMasterSheet every day at 9AM
 */
function createDailyTrigger() {
  // Remove previous triggers for this function
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === "updateVesselMasterSheet") {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  // Create new daily trigger at 9AM
  ScriptApp.newTrigger("updateVesselMasterSheet")
    .timeBased()
    .everyDays(1)
    .atHour(9)
    .create();
}
```
