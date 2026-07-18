const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

async function main() {
  // Command line args
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error("Usage: node form-test/workflow.js [path_to_filled_pdf]");
    process.exit(1);
  }
  const filledPdfPath = path.resolve(args[0]);
  if (!fs.existsSync(filledPdfPath)) {
    console.error(`Error: Filled PDF file not found at ${filledPdfPath}`);
    process.exit(1);
  }

  const pdfFolder = path.dirname(filledPdfPath);
  const pdfBasename = path.basename(filledPdfPath, '.pdf');

  // Ground truth schema
  const referenceSchemaPath = path.resolve(__dirname, '..', 'Original', 'Unfilled', 'Swaram_ParsedForm_UNFILLED.json');
  if (!fs.existsSync(referenceSchemaPath)) {
    console.error(`Error: Reference schema not found at ${referenceSchemaPath}`);
    process.exit(1);
  }
  const referenceFields = JSON.parse(fs.readFileSync(referenceSchemaPath, 'utf8'));

  // Template PDF
  const templatePdfPath = path.resolve(__dirname, '..', 'Original', 'Unfilled', 'Swaram Stress Test Form.pdf');
  if (!fs.existsSync(templatePdfPath)) {
    console.error(`Error: Template PDF not found at ${templatePdfPath}`);
    process.exit(1);
  }

  console.log(`\n======================================================`);
  console.log(`SWARAM CLI Form Testing & Verification Workflow (LLM-Assisted)`);
  console.log(`======================================================`);
  console.log(`Filled PDF: ${filledPdfPath}`);
  console.log(`Template PDF: ${templatePdfPath}`);
  console.log(`Ground Truth Schema: ${referenceSchemaPath}`);

  // Dynamic import pdfjs-dist
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(path.resolve(__dirname, '../../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs')).toString();

  // Helper to extract text items from a PDF page-by-page
  async function extractTextItems(pdfPath) {
    const bytes = new Uint8Array(fs.readFileSync(pdfPath));
    const doc = await pdfjs.getDocument({
      data: bytes,
      standardFontDataUrl: pathToFileURL(path.resolve(__dirname, '../../node_modules/pdfjs-dist/standard_fonts/')).toString() + '/'
    }).promise;

    const allItems = [];
    for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
      const page = await doc.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1 });
      const pw = viewport.width;
      const ph = viewport.height;
      const textContent = await page.getTextContent();
      const items = textContent.items.map(item => {
        const tx = item.transform[4];
        const ty = item.transform[5];
        return {
          str: item.str,
          x: tx / pw,
          y: 1 - (ty + item.height) / ph,
          w: item.width / pw,
          h: item.height / ph,
          pageNum: pageNum - 1 // 0-indexed to match parsed_form.json
        };
      });
      allItems.push(...items);
    }
    return allItems;
  }

  // Extract text items from template and filled PDFs
  console.log("Extracting text and coordinates from PDFs...");
  const templateItems = await extractTextItems(templatePdfPath);
  const filledItems = await extractTextItems(filledPdfPath);

  // Template Subtraction to isolate user's answers
  const addedItems = [];
  filledItems.forEach(filledItem => {
    if (!filledItem.str.trim()) return;
    
    // Fuzzy matching against template to handle minor rendering coordinate shifts
    const isTemplate = templateItems.some(tempItem => {
      if (tempItem.str.trim() !== filledItem.str.trim()) return false;
      const dx = Math.abs(tempItem.x - filledItem.x);
      const dy = Math.abs(tempItem.y - filledItem.y);
      return dx < 0.02 && dy < 0.02 && tempItem.pageNum === filledItem.pageNum;
    });

    if (!isTemplate) {
      addedItems.push(filledItem);
    }
  });

  console.log(`Found ${addedItems.length} user-filled data segments.`);

  const consumedItems = new Set();
  const mappedFields = [];
  referenceFields.forEach(refField => {
    if (refField.type === 'table') {
      refField.rows.forEach((rowName, r) => {
        refField.columns.forEach((colName, c) => {
          const cellBbox = refField.cells[r][c];
          if (cellBbox) {
            mappedFields.push({
              label: `${refField.label} [${rowName} - ${colName}]`,
              page: refField.page,
              type: 'text',
              bbox: cellBbox,
              value: '',
              actualBbox: null,
              refId: `${refField.id}_${r}_${c}`
            });
          }
        });
      });
    } else {
      mappedFields.push({
        label: refField.label,
        page: refField.page,
        type: refField.type,
        options: refField.options,
        bbox: refField.bbox,
        value: '',
        actualBbox: null,
        refId: refField.id,
        profileKey: refField.profileKey
      });
    }
  });

  // 1. Process Choice Checkmarks first
  mappedFields.forEach(field => {
    if (field.type !== 'choice') return;
    
    const pageAddedItems = addedItems.filter(item => item.pageNum === field.page);
    const matchedOptions = [];
    
    if (field.options) {
      field.options.forEach(opt => {
        const optTemplateItems = templateItems.filter(item => {
          if (item.pageNum !== field.page) return false;
          const normOpt = opt.toLowerCase().trim();
          const normStr = item.str.toLowerCase().trim();
          const isNear = Math.abs(item.y - field.bbox.y) < 0.08;
          if (!isNear) return false;
          
          const escapedOpt = normOpt.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
          return normStr === normOpt || new RegExp(`\\b${escapedOpt}\\b`).test(normStr);
        });

        optTemplateItems.forEach(optTempItem => {
          const checkmark = pageAddedItems.find(added => {
            const str = added.str.trim();
            const isGlyph = ['3', '4', '51', '52', '✓', 'x', 'X', '✔'].includes(str) || str.length > 0;
            const dx = optTempItem.x - added.x;
            const dy = Math.abs(optTempItem.y - added.y);
            return dx > -0.02 && dx < 0.08 && dy < 0.025 && isGlyph;
          });
          
          if (checkmark) {
            matchedOptions.push({ opt, item: checkmark });
          }
        });
      });
    }

    if (matchedOptions.length > 0) {
      field.value = matchedOptions.map(o => o.opt).join(', ');
      field.actualBbox = {
        x: parseFloat(matchedOptions[0].item.x.toFixed(3)),
        y: parseFloat(matchedOptions[0].item.y.toFixed(3)),
        w: parseFloat(matchedOptions[0].item.w.toFixed(3)),
        h: parseFloat(matchedOptions[0].item.h.toFixed(3))
      };
      matchedOptions.forEach(o => consumedItems.add(o.item));
    }
  });

  // 2. Assign remaining added items to their single closest matching field
  const unconsumedItems = addedItems.filter(item => !consumedItems.has(item));
  
  // For each unconsumed item, find the best matching field on the same page
  const fieldToItems = {};
  mappedFields.forEach(f => {
    fieldToItems[f.refId] = [];
  });

  unconsumedItems.forEach(item => {
    let bestField = null;
    let bestScore = Infinity;

    mappedFields.forEach(field => {
      if (field.page !== item.pageNum) return;
      
      if (!field.bbox) return;

      const dy = Math.abs(item.y - field.bbox.y);
      const isYNear = dy < 0.025; // vertical alignment threshold (2.5% of page height)
      
      // X boundaries check with generous margin
      const startX = field.bbox.x - 0.05;
      const endX = field.bbox.x + field.bbox.w + 0.05;
      const isXOverlap = item.x >= startX && item.x <= endX;

      if (isYNear && isXOverlap) {
        // Score primarily by vertical offset and X alignment
        const dx = Math.max(0, field.bbox.x - item.x, item.x - (field.bbox.x + field.bbox.w));
        const score = dy * 6 + dx; // Weight vertical distance heavily
        if (score < bestScore) {
          bestScore = score;
          bestField = field;
        }
      }
    });

    if (bestField) {
      fieldToItems[bestField.refId].push(item);
    }
  });

  // 3. Compile values for the fields based on closest item mappings
  mappedFields.forEach(field => {
    // If choice field was already mapped via checkmarks, do not overwrite it unless empty
    if (field.type === 'choice' && field.value) {
      return;
    }

    const items = fieldToItems[field.refId];
    if (items && items.length > 0) {
      // Sort items left-to-right to reconstruct words in correct visual order
      items.sort((a, b) => a.x - b.x);
      field.value = items.map(i => i.str).join(' ');
      
      const minX = Math.min(...items.map(i => i.x));
      const maxX = Math.max(...items.map(i => i.x + i.w));
      const minY = Math.min(...items.map(i => i.y));
      const maxY = Math.max(...items.map(i => i.y + i.h));

      field.actualBbox = {
        x: parseFloat(minX.toFixed(3)),
        y: parseFloat(minY.toFixed(3)),
        w: parseFloat((maxX - minX).toFixed(3)),
        h: parseFloat((maxY - minY).toFixed(3))
      };

      // Mark these items as consumed so they are not listed as false positives
      items.forEach(i => consumedItems.add(i));
    }
  });

  // Identify False Positives: added items that did not map to any field
  const falsePositives = [];
  addedItems.forEach(added => {
    if (!consumedItems.has(added)) {
      // Exclude Next.js auto-populated page headers to keep report clean
      const isPageHeader = added.str.match(/Sufiyan Shiraj Mohammed\d?/);
      if (!isPageHeader) {
        falsePositives.push({
          page: added.pageNum,
          str: added.str,
          x: parseFloat(added.x.toFixed(3)),
          y: parseFloat(added.y.toFixed(3)),
          w: parseFloat(added.w.toFixed(3)),
          h: parseFloat(added.h.toFixed(3))
        });
      }
    }
  });

  // Programmatic verification, validation and coordinate diffing engine (100% Offline)
  console.log("Running programmatic verification, validation, and coordinate diffing...");

  const validations = {
    aadhaar: (val) => /^\d{12}$/.test(val.replace(/\s+/g, '')),
    pan: (val) => /^[A-Z]{5}\d{4}[A-Z]$/i.test(val.replace(/\s+/g, '')),
    ifsc: (val) => /^[A-Z]{4}0[A-Z0-9]{6}$/i.test(val.replace(/\s+/g, '')),
    phone: (val) => /^\d{10}$/.test(val.replace(/\s+/g, '')),
    pincode: (val) => /^\d{6}$/.test(val.replace(/\s+/g, ''))
  };

  const processedFields = mappedFields.map(field => {
    let profileKey = field.profileKey;
    let expectedBbox = field.bbox;

    let status = "success";
    let explanation = "Field successfully mapped and aligned.";

    const val = (field.value || "").trim();

    if (!val) {
      status = "missing";
      explanation = "No user-input text segments detected overlapping these coordinate bounds.";
    } else {
      // Validate field value structure if matching rules are found
      if (profileKey && validations[profileKey]) {
        const isValid = validations[profileKey](val);
        if (!isValid) {
          status = "validation_failure";
          explanation = `Value "${val}" failed format validation for type "${profileKey}".`;
        }
      }

      // Check alignment coordinate shift (only if not already failing validation)
      if (status !== "validation_failure" && field.actualBbox && expectedBbox) {
        const dx = Math.abs(field.actualBbox.x - expectedBbox.x);
        const dy = Math.abs(field.actualBbox.y - expectedBbox.y);
        if (dx > 0.02 || dy > 0.02) {
          status = "shift";
          explanation = `Bounding box coordinates shifted by dx=${(dx * 100).toFixed(1)}%, dy=${(dy * 100).toFixed(1)}%.`;
        }
      }
    }

    return {
      label: field.label,
      page: field.page,
      type: field.type,
      value: val,
      status: status,
      expectedBbox: expectedBbox,
      actualBbox: field.actualBbox,
      explanation: explanation
    };
  });

  const successes = processedFields.filter(f => f.status === "success");
  const missing = processedFields.filter(f => f.status === "missing");
  const shifts = processedFields.filter(f => f.status === "shift");
  const validationFailures = processedFields.filter(f => f.status === "validation_failure");

  // Format AI-optimized markdown report (extremely compact and token-efficient)
  let reportMarkdown = `# SWARAM Form Verification Report: ${pdfBasename}.pdf\n\n`;
  reportMarkdown += `## Summary Metrics\n`;
  reportMarkdown += `| Metric | Count |\n`;
  reportMarkdown += `| :--- | :--- |\n`;
  reportMarkdown += `| **Total Expected Fields** | ${referenceFields.length} |\n`;
  reportMarkdown += `| **Successes** | ${successes.length} |\n`;
  reportMarkdown += `| **Missing / Untagged** | ${missing.length} |\n`;
  reportMarkdown += `| **Alignment Shifts (>2%)** | ${shifts.length} |\n`;
  reportMarkdown += `| **Validation Failures** | ${validationFailures.length} |\n`;
  reportMarkdown += `| **False Positives** | ${falsePositives.length} |\n\n`;

  reportMarkdown += `## 1. Successes\n`;
  if (successes.length === 0) {
    reportMarkdown += `*No successes detected.*\n\n`;
  } else {
    reportMarkdown += `| Page | Label | Extracted Value |\n`;
    reportMarkdown += `| :--- | :--- | :--- |\n`;
    successes.forEach(f => {
      reportMarkdown += `| P${f.page + 1} | ${f.label} | \`${f.value}\` |\n`;
    });
    reportMarkdown += `\n`;
  }

  reportMarkdown += `## 2. Missing/Untagged Fields\n`;
  if (missing.length === 0) {
    reportMarkdown += `*No missing fields.*\n\n`;
  } else {
    reportMarkdown += `| Page | Label | Type |\n`;
    reportMarkdown += `| :--- | :--- | :--- |\n`;
    missing.forEach(f => {
      reportMarkdown += `| P${f.page + 1} | ${f.label} | \`${f.type}\` |\n`;
    });
    reportMarkdown += `\n`;
  }

  reportMarkdown += `## 3. False Positives\n`;
  if (falsePositives.length === 0) {
    reportMarkdown += `*No false positives detected.*\n\n`;
  } else {
    reportMarkdown += `| Page | Value | BBox (x, y, w, h) |\n`;
    reportMarkdown += `| :--- | :--- | :--- |\n`;
    falsePositives.forEach(f => {
      reportMarkdown += `| P${f.page + 1} | \`${f.str}\` | (${f.x.toFixed(3)}, ${f.y.toFixed(3)}, ${f.w.toFixed(3)}, ${f.h.toFixed(3)}) |\n`;
    });
    reportMarkdown += `\n`;
  }

  reportMarkdown += `## 4. Bounding Box Alignment Shifts (>2%)\n`;
  if (shifts.length === 0) {
    reportMarkdown += `*No alignment shifts detected.*\n\n`;
  } else {
    reportMarkdown += `| Page | Label | Expected BBox | Actual BBox | Shift (dx%, dy%) | Extracted Value |\n`;
    reportMarkdown += `| :--- | :--- | :--- | :--- | :--- | :--- |\n`;
    shifts.forEach(f => {
      const dx = Math.abs(f.actualBbox.x - f.expectedBbox.x);
      const dy = Math.abs(f.actualBbox.y - f.expectedBbox.y);
      reportMarkdown += `| P${f.page + 1} | ${f.label} | (${f.expectedBbox.x.toFixed(3)}, ${f.expectedBbox.y.toFixed(3)}) | (${f.actualBbox.x.toFixed(3)}, ${f.actualBbox.y.toFixed(3)}) | (${(dx*100).toFixed(1)}%, ${(dy*100).toFixed(1)}%) | \`${f.value}\` |\n`;
    });
    reportMarkdown += `\n`;
  }

  reportMarkdown += `## 5. Validation Failures / Format Mismatches\n`;
  if (validationFailures.length === 0) {
    reportMarkdown += `*No validation failures detected.*\n\n`;
  } else {
    reportMarkdown += `| Page | Label | Value | Explanation |\n`;
    reportMarkdown += `| :--- | :--- | :--- | :--- |\n`;
    validationFailures.forEach(f => {
      reportMarkdown += `| P${f.page + 1} | ${f.label} | \`${f.value}\` | ${f.explanation} |\n`;
    });
    reportMarkdown += `\n`;
  }

  reportMarkdown += `## 6. Recommended Programmatic Solutions\n\n`;
  reportMarkdown += `### 6.1 Bounding Box Shifts (>2% deviation)\n`;
  reportMarkdown += `- **Issue:** Coordinates mapped to visual text deviates from reference schema.\n`;
  reportMarkdown += `- **Fix:** Calculate bounding box shifts relative to a static anchor (e.g. page headers or logo) and apply translation scaling. Standardize page viewport dimensions (e.g. normalize to standard A4 points size 595x842) before writing fields.\n\n`;
  reportMarkdown += `### 6.2 Missing / Untagged Fields\n`;
  reportMarkdown += `- **Issue:** Fields are unpopulated because no overlapping text items were detected.\n`;
  reportMarkdown += `- **Fix:** Expand search box margins (specifically horizontal padding) for character cells like Aadhaar and PAN, and implement checks for ZapfDingbats checkmark glyphs (e.g. checking characters like '3', '51', '✓').\n\n`;
  reportMarkdown += `### 6.3 False Positives\n`;
  reportMarkdown += `- **Issue:** Template texts or labels parsed as input values.\n`;
  reportMarkdown += `- **Fix:** Implement robust template subtraction by building a cached key of the empty template's text items and filtering them out of any scanned form before layout calculations.\n\n`;
  reportMarkdown += `### 6.4 Validation Failures\n`;
  reportMarkdown += `- **Issue:** Scanned values fail format checks (e.g. Aadhaar shorter than 12 digits, or PAN having 13 characters).\n`;
  reportMarkdown += `- **Fix:** Enhance character recognition validation by applying dynamic regex patterns per profile key (e.g. \\d{12} for Aadhaar, [A-Z]{5}\\d{4}[A-Z] for PAN) and flagging violations prior to data ingestion.\n`;

  // Save the actual parsed results JSON
  const actualJsonPath = path.join(pdfFolder, `${pdfBasename}_actual.json`);
  fs.writeFileSync(actualJsonPath, JSON.stringify(processedFields, null, 2), 'utf8');

  // Format and save Markdown report
  const reportPath = path.join(pdfFolder, `${pdfBasename}_comparison_report.md`);
  fs.writeFileSync(reportPath, reportMarkdown, 'utf8');

  // Output compact token-efficient summary to the console for the AI Agent
  console.log(`\n=== AGENT METRICS SUMMARY ===`);
  console.log(`Total: ${mappedFields.length} | Success: ${successes.length} | Missing: ${missing.length} | Shifts: ${shifts.length} | Validation Failures: ${validationFailures.length} | False Positives: ${falsePositives.length}`);
  
  if (missing.length > 0) {
    console.log(`\n[Missing Fields]:\n` + missing.map(m => `- ${m.label}`).join('\n'));
  }
  if (validationFailures.length > 0) {
    console.log(`\n[Validation Failures]:\n` + validationFailures.map(v => `- ${v.label} (Value: ${v.value}): ${v.explanation}`).join('\n'));
  }
  if (shifts.length > 0) {
    console.log(`\n[Alignment Shifts]:\n` + shifts.map(s => `- ${s.label}: ${s.explanation}`).join('\n'));
  }
  console.log(`\nReport saved to: ${reportPath}`);
}

main().catch(console.error);
