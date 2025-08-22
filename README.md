# Taiwan Fisheries Agency PDF Scraper

This project is a **serverless scraper** deployed on Vercel that automatically fetches the **latest PDF of authorized vessels** from the Taiwan Fisheries Agency website and makes it accessible for download. It is designed to integrate seamlessly with **Google Apps Script** to save PDFs directly into Google Drive.

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
│ └─ latest-pdf.js # Vercel serverless function
├─ package.json # Node.js dependencies
└─ .gitignore # Excludes node_modules and .vercel
```

---

## Installation

1. Clone the repository:

```bash / cmd
git clone https://github.com/<your-username>/<your-repo>.git
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
```

## App Script Integration
```
function fetchFromVercel() {
  const url = "https://<your-project>.vercel.app/api/latest-pdf"; // Replace with your deployed URL
  const folderId = "YOUR_FOLDER_ID"; // Replace with your Drive folder ID

  const folder = DriveApp.getFolderById(folderId);

  // Fetch PDF
  const resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });

  // Get filename from Content-Disposition
  const cd = resp.getHeaders()["Content-Disposition"];
  let fileName = "latest.pdf";
  if (cd) {
    const match = cd.match(/filename="(.+)"/);
    if (match && match[1]) fileName = match[1];
  }

  // Check if file already exists in folder
  const files = folder.getFilesByName(fileName);
  if (!files.hasNext()) {
      // Save new file
    const blob = resp.getBlob().setName(fileName);
    folder.createFile(blob);
  } else {
    Logger.log(fileName + " already exists, skipping download.");
  }

}
```
