import fetch from "node-fetch";
import * as cheerio from "cheerio";
import pdf from "pdf-parse/lib/pdf-parse.js";
import * as XLSX from "xlsx";

// Sanitize filename to ASCII-only
function sanitizeFileName(name) {
  return name
    .replace(/\s+/g, "_")
    .replace(/[()]/g, "")
    .replace(/[^\x00-\x7F]/g, "");
}

export default async function handler(req, res) {
  try {
    const pageUrl = "https://en.fa.gov.tw/view.php?theme=VR_of_RFMO&subtheme=&id=10";

    // 1. Fetch the main page
    const pageResp = await fetch(pageUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "text/html,application/xhtml+xml",
      }
    });
    const html = await pageResp.text();

    // 2. Parse all redirect_file.php links
    const $ = cheerio.load(html);
    const links = [];
    $("a").each((_, el) => {
      const href = $(el).attr("href");
      const text = $(el).text().trim();
      if (href && href.includes("redirect_file.php")) {
        links.push({ name: text, link: new URL(href, "https://en.fa.gov.tw/").href });
      }
    });

    if (links.length === 0) return res.status(500).send("No PDF links found");

    // 3. Pick latest by YYYYMMDD in filename
    links.sort((a, b) => {
      const dateA = a.name.match(/(\d{8})/);
      const dateB = b.name.match(/(\d{8})/);
      return (dateB ? dateB[1] : 0) - (dateA ? dateA[1] : 0);
    });

    const latest = links[0];
    const latestFileName = sanitizeFileName(latest.name) + ".pdf";

    // 4. Fetch the PDF
    const pdfResp = await fetch(latest.link, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Referer": pageUrl,
        "Accept": "application/pdf"
      },
      redirect: "follow"
    });

    if (!pdfResp.ok) return res.status(500).send("Failed to download PDF");

    const buffer = Buffer.from(await pdfResp.arrayBuffer());

    // 5. Parse PDF
    const data = await pdf(buffer);
    const lines = data.text
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    // 6. Create XLSX workbook
    const worksheetData = lines.map(line => [line]); // Each line in one row, column A
    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
    const workbook = XLSX.utils.book_new();
	const dateMatch = latest.name.match(/(\d{8})/);
	const sheetName = dateMatch ? dateMatch[1] : "Sheet1";
	
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

    const xlsxBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "buffer" });

    // 7. Return as XLSX download
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