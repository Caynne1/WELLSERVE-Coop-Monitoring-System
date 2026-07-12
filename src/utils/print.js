import wsLogo from '../assets/logo-hr.svg';

/**
 * Wraps arbitrary HTML content in a print-ready document that adapts to
 * whatever paper size/orientation the user's printer is set to, and uses
 * the WELLSERVE logo in the header (no full letterhead banner).
 *
 * The header repeats on every printed page via a native <thead>, not
 * position:fixed — fixed elements are unreliable across page breaks
 * (they can get clipped or fail to reserve consistent space on
 * continuation pages). A <thead> inside a single wrapping <table> is
 * natively repeated by the browser's print pagination, correctly sized,
 * every time.
 */
export function wrapWithLetterhead(contentHtml, options = {}) {
  const {
    title = 'WELLSERVE Cooperative Report',
    extraCss = '',
  } = options;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${title}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Segoe UI', Arial, sans-serif;
      font-size: 11pt;
      color: #111;
      background: #fff;
    }
    /* One wrapping table so its <thead> (the logo) is natively repeated
       by the browser on every printed page, correctly sized and never
       overlapping the body content. */
    .lh-wrap {
      width: 100%;
      border-collapse: collapse;
    }
    .lh-header-cell {
      padding: 0;
      border: none;
      background: none;
    }
    .lh-header {
      display: flex;
      align-items: center;
      padding: 6mm 16mm;
      border-bottom: 1pt solid #2d7d46;
    }
    .lh-header img {
      height: 14mm;
      width: auto;
      display: block;
    }
    .lh-body-cell {
      padding: 0;
      border: none;
      background: none;
    }
    .lh-content {
      padding: 12mm 16mm 16mm 16mm;
    }
    /* Avoid a table row (or stat box / heading) getting sliced in half by
       a page break, which produces a duplicated/overlapping-row look at
       the top of a new page. */
    tr, .stat-box, .section-heading {
      break-inside: avoid;
      page-break-inside: avoid;
    }
    /* Report-specific styles */
    h1.report-title {
      font-size: 15pt;
      font-weight: 700;
      color: #1a3d2b;
      margin-bottom: 2mm;
    }
    .report-meta {
      font-size: 9pt;
      color: #555;
      margin-bottom: 5mm;
      padding-bottom: 3mm;
      border-bottom: 1.5pt solid #2d7d46;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 9.5pt;
      margin-bottom: 5mm;
    }
    th {
      background: #1a3d2b;
      color: #fff;
      padding: 4pt 6pt;
      text-align: left;
      font-weight: 600;
    }
    td {
      padding: 3.5pt 6pt;
      border-bottom: 0.5pt solid #e5e7eb;
    }
    tr:nth-child(even) td { background: #f9fafb; }
    .section-heading {
      font-size: 11pt;
      font-weight: 700;
      color: #1a3d2b;
      margin: 5mm 0 2mm 0;
      padding-bottom: 1mm;
      border-bottom: 1pt solid #2d7d46;
    }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 3mm;
      margin-bottom: 5mm;
    }
    .stat-box {
      border: 0.5pt solid #d1fae5;
      border-radius: 3pt;
      padding: 3mm 4mm;
      background: #f0fdf4;
    }
    .stat-label { font-size: 8pt; color: #6b7280; margin-bottom: 1mm; }
    .stat-value { font-size: 13pt; font-weight: 700; color: #065f46; }
    .stat-sub { font-size: 7.5pt; color: #6b7280; margin-top: 0.5mm; }
    .confidential {
      font-size: 8pt;
      color: #6b7280;
      text-align: center;
      margin-top: 3mm;
      font-style: italic;
    }
    @media print {
      @page { margin: 0; }
      body { margin: 0; }
    }
    ${extraCss}
  </style>
</head>
<body>
  <table class="lh-wrap">
    <thead>
      <tr>
        <td class="lh-header-cell">
          <div class="lh-header">
            <img src="${new URL(wsLogo, window.location.origin).href}" alt="WELLSERVE Logo" />
          </div>
        </td>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td class="lh-body-cell">
          <div class="lh-content">
            ${contentHtml}
          </div>
        </td>
      </tr>
    </tbody>
  </table>
</body>
</html>`;
}

/**
 * Opens a new window, writes the HTML, and triggers window.print().
 * Resolves with the window reference (or null if popup was blocked).
 */
export function printHtmlDocument(html, options = {}) {
  const {
    width = 900,
    height = 1100,
    delay = 800,
    onBlocked,
  } = options;

  const printWindow = window.open('', '_blank', `width=${width},height=${height}`);
  if (!printWindow) {
    onBlocked?.();
    return null;
  }

  let printed = false;
  const runPrint = async () => {
    if (printed) return;
    if (printWindow.closed) return;
    printed = true;

    try {
      if (printWindow.document?.fonts?.ready) {
        await printWindow.document.fonts.ready;
      }
    } catch {
      // Font readiness is best-effort.
    }

    printWindow.focus();
    printWindow.requestAnimationFrame(() => {
      printWindow.requestAnimationFrame(() => {
        window.setTimeout(() => {
          if (!printWindow.closed) printWindow.print();
        }, delay);
      });
    });
  };

  printWindow.onload = runPrint;
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();

  if (printWindow.document.readyState === 'complete') {
    runPrint();
  } else {
    window.setTimeout(runPrint, delay + 500);
  }

  return printWindow;
}