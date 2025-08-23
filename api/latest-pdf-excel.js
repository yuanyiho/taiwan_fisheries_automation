import fetch from "node-fetch";
import * as cheerio from "cheerio";
import * as XLSX from "xlsx";
import pdf_table_extractor from "pdf-table-extractor";
import fs from "fs";
import path from "path";
import os from "os";

// Wrap pdf-table-extractor in a promise
function extractTables(filePath) {
  return new Promise((resolve, reject) => {
    pdf_table_extractor(filePath, resolve, reject);
  });
}

function sanitizeFileName(name) {
  return (name || "latest")
    .replace(/\s+/g, "_")
    .replace(/[()]/g, "")
    .replace(/[^\x00-\x7F]/g, ""); // ASCII-only for headers
}

export default async function handler(req, res) {
  try {
    const pageUrl = "https://en.fa.gov.tw/view.php?theme=VR_of_RFMO&subtheme=&id=10";

    // 1) fetch listing page
    const pageResp = await fetch(pageUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "text/html,application/xhtml+xml",
      },
    });
    const html = await pageResp.text();

    // 2) collect redirect_file.php links
    const $ = cheerio.load(html);
    const links = [];
    $("a").each((_, el) => {
      const href = $(el).attr("href");
      const text = $(el).text().trim();
      if (href && href.includes("redirect_file.php")) {
        links.push({
          name: text,
          link: new URL(href, "https://en.fa.gov.tw/").href,
        });
      }
    });
    if (!links.length) return res.status(500).send("No PDF links found");

    // 3) pick latest by YYYYMMDD
    links.sort((a, b) => {
      const A = a.name.match(/(\d{8})/);
      const B = b.name.match(/(\d{8})/);
      return (B ? +B[1] : 0) - (A ? +A[1] : 0);
    });
    const latest = links[0];

    // 4) download the PDF
    const pdfResp = await fetch(latest.link, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Referer": pageUrl,
        "Accept": "application/pdf",
      },
      redirect: "follow",
    });
    if (!pdfResp.ok) return res.status(502).send(`Failed to download PDF (status ${pdfResp.status})`);
    const pdfBuffer = Buffer.from(await pdfResp.arrayBuffer());

    // 5) save buffer to temp file
    const tmpFile = path.join(os.tmpdir(), "latest.pdf");
    fs.writeFileSync(tmpFile, pdfBuffer);

    // 6) extract tables
    const data = await extractTables(tmpFile);

    // Cleanup temp file
    fs.unlinkSync(tmpFile);

    // Flatten all table data
    const rows = [];
    for (const t of data.pageTables) {
      rows.push(...t.tables);
    }

    if (!rows.length) return res.status(500).send("No tables extracted from PDF");

    // 7) write Excel
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    const sheetName = latest.name.match(/(\d{8})/)?.[1] || "Sheet1";
    XLSX.utils.book_append_sheet(wb, ws, sheetName);

    const xlsxBuffer = XLSX.write(wb, { bookType: "xlsx", type: "buffer" });

    // 8) return download
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${sanitizeFileName(latest.name)}.xlsx"`
    );
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.send(xlsxBuffer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}
