import fetch from "node-fetch";
import * as cheerio from "cheerio";
import pdf from "pdf-parse/lib/pdf-parse.js";
import {
  Document,
  Packer,
  Table,
  TableRow,
  TableCell,
  Paragraph,
  WidthType,
} from "docx";

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

    // 4. Parse PDF
    const data = await pdf(buffer);
    const lines = data.text
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    // 5. Convert to DOCX
    const rows = lines.map(
      (line) =>
        new TableRow({
          children: [
            new TableCell({
              children: [new Paragraph(line)],
              width: { size: 100, type: WidthType.PERCENTAGE },
            }),
          ],
        })
    );

    const doc = new Document({
      sections: [
        {
          children: [
            new Table({
              rows,
              width: { size: 100, type: WidthType.PERCENTAGE },
            }),
          ],
        },
      ],
    });

    const bufferDocx = await Packer.toBuffer(doc);

    // 6. Return as DOCX download
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${latest.name.replace(/\s+/g, "_")}.docx"`
    );
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
    res.send(bufferDocx);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}
