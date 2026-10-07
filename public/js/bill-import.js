const billImageInput = document.getElementById('billImageInput');
const billPreview = document.getElementById('billPreview');
const billPreviewWrap = document.getElementById('billPreviewWrap');
const processBillBtn = document.getElementById('processBillBtn');
const ocrStatus = document.getElementById('ocrStatus');
const resultsPanel = document.getElementById('resultsPanel');
const pendingBillItems = document.getElementById('pendingBillItems');
const billDetailsList = document.getElementById('billDetailsList');
const selectionStep = document.getElementById('selectionStep');
const detailsStep = document.getElementById('detailsStep');
const continueSelectedBtn = document.getElementById('continueSelectedBtn');
const chooseAnotherFileBtn = document.getElementById('chooseAnotherFileBtn');
const backToSelectionBtn = document.getElementById('backToSelectionBtn');
const billDropZone = document.getElementById('billDropZone');
const selectedBillName = document.getElementById('selectedBillName');
const reviewBillName = document.getElementById('reviewBillName');
const detectedItemCount = document.getElementById('detectedItemCount');
const uploadAnotherBillBtn = document.getElementById('uploadAnotherBillBtn');
const billUploadPanel = document.getElementById('billUploadPanel');

let currentFile = null;
let pendingItems = [];
let billFlowStep = 'selection';
const billDraftKey = 'freshtrack.billImportDraft.v1';

const groceryCategories = [
  'Fruits', 'Vegetables', 'Dairy', 'Bakery', 'Snacks',
  'Beverages', 'Meat', 'Pantry', 'Frozen', 'Household', 'Other'
];

function clearBillDraft() {
  try {
    sessionStorage.removeItem(billDraftKey);
  } catch (error) {
    console.warn('Could not clear the saved bill draft:', error);
  }
}

function suggestCategory(productName) {
  const name = productName.toLowerCase();
  if (/tomato|onion|potato|mushroom|spinach|carrot|cucumber|pepper|vegetable/.test(name)) return 'Vegetables';
  if (/paneer|milk|curd|yogurt|cheese|butter|cream/.test(name)) return 'Dairy';
  if (/apple|banana|mango|orange|grape|fruit/.test(name)) return 'Fruits';
  if (/biscuit|cookie|chips|snack|namkeen|chocolate/.test(name)) return 'Snacks';
  if (/bread|bun|cake|bakery/.test(name)) return 'Bakery';
  return 'Other';
}

function saveBillDraft() {
  try {
    if (!pendingItems.length) {
      clearBillDraft();
      return;
    }

    sessionStorage.setItem(billDraftKey, JSON.stringify({
      version: 1,
      fileName: reviewBillName.textContent,
      step: billFlowStep,
      items: pendingItems
    }));
  } catch (error) {
    console.warn('Could not keep this bill draft for the current tab:', error);
  }
}

function restoreBillDraft() {
  try {
    const savedDraft = sessionStorage.getItem(billDraftKey);
    if (!savedDraft) return;

    const draft = JSON.parse(savedDraft);
    if (draft.version !== 1 || !Array.isArray(draft.items) || !draft.items.length) {
      clearBillDraft();
      return;
    }

    pendingItems = draft.items;
    billFlowStep = draft.step === 'details' ? 'details' : 'selection';
    reviewBillName.textContent = draft.fileName || 'Imported bill';
    renderSelectionItems();
    renderBillDetails();
    selectionStep.classList.toggle('hidden', billFlowStep === 'details');
    detailsStep.classList.toggle('hidden', billFlowStep !== 'details');
    billUploadPanel.classList.add('hidden');
    resultsPanel.classList.remove('hidden');
  } catch (error) {
    console.warn('Could not restore this bill draft:', error);
    clearBillDraft();
  }
}

async function loadPdfDocument(file) {
  const pdfjs = await import('/vendor/pdfjs/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.mjs';
  const document = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  return { pdfjs, document };
}

async function extractPdfText(file) {
  const { document } = await loadPdfDocument(file);
  const pageTexts = [];

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const tokens = content.items
      .filter((item) => item.str && item.str.trim())
      .map((item) => ({
        text: item.str.trim(),
        x: item.transform[4],
        y: item.transform[5]
      }))
      .sort((first, second) => second.y - first.y || first.x - second.x);
    const rows = [];

    tokens.forEach((token) => {
      const row = rows.find((entry) => Math.abs(entry.y - token.y) <= 2.5);
      if (row) {
        row.parts.push(token);
      } else {
        rows.push({ y: token.y, parts: [token] });
      }
    });

    pageTexts.push(rows
      .sort((first, second) => second.y - first.y)
      .map((row) => row.parts.sort((first, second) => first.x - second.x).map((part) => part.text).join(' '))
      .join('\n'));
  }

  return pageTexts.join('\n');
}

function cleanPdfProductName(parts) {
  return parts.join(' ')
    .replace(/^\s*(?:or|and)\s+\d+(?:\.\d+)?\s*(?:g|kg|ml|l)[).]?\s*/i, '')
    .replace(/\s+\d+\s*(?:packs?|pcs?|units?)\b.*$/i, '')
    .replace(/\s+\d+(?:\s*-\s*\d+)?\s*(?:g|kg|ml|l)\b.*$/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function parseInvoiceDate(tokens) {
  const text = tokens
    .slice()
    .sort((first, second) => second.y - first.y || first.x - second.x)
    .map((token) => token.text)
    .join(' ');
  const match = text.match(/\bDate\s*:?\s*(\d{1,2})[-/](\d{1,2})[-/](\d{4})\b/i);
  if (!match) return '';

  return `${match[3]}-${String(match[2]).padStart(2, '0')}-${String(match[1]).padStart(2, '0')}`;
}

async function extractStructuredPdfItems(file) {
  const { document: pdfDocument } = await loadPdfDocument(file);
  const extractedItems = [];

  for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
    const page = await pdfDocument.getPage(pageNumber);
    const tokens = (await page.getTextContent()).items
      .filter((item) => item.str.trim())
      .map((item) => ({
        text: item.str.trim(),
        x: item.transform[4],
        y: item.transform[5]
      }));
    const descriptionHeader = tokens.find((token) => /description/i.test(token.text));
    const quantityHeader = tokens.find((token) => /^qty\.?$/i.test(token.text));
    const unitHeader = tokens.find((token) => /^unit$/i.test(token.text) &&
      token.x > (descriptionHeader?.x ?? Infinity) && token.x < (quantityHeader?.x ?? -Infinity));
    const totalHeader = tokens.find((token) => /^total$/i.test(token.text) && token.x > (quantityHeader?.x ?? Infinity));
    const purchaseDate = parseInvoiceDate(tokens);

    if (!descriptionHeader || !quantityHeader || !unitHeader || !totalHeader) continue;

    const serialRows = tokens
      .filter((token) => token.x < descriptionHeader.x - 8 && token.y < descriptionHeader.y - 8 && /^\d{1,2}$/.test(token.text))
      .sort((first, second) => second.y - first.y);
    const descriptions = tokens.filter((token) => (
      token.x >= descriptionHeader.x - 8 &&
      token.x < unitHeader.x - 4 &&
      token.y < descriptionHeader.y - 8
    ));

    const descriptionGroups = serialRows.map(() => []);
    descriptions.forEach((token) => {
      let closestIndex = 0;
      let closestDistance = Infinity;
      serialRows.forEach((row, index) => {
        const distance = Math.abs(row.y - token.y);
        if (distance < closestDistance) {
          closestDistance = distance;
          closestIndex = index;
        }
      });
      if (serialRows.length && closestDistance < 55) {
        descriptionGroups[closestIndex].push(token);
      }
    });

    serialRows.forEach((row, index) => {
      const quantityToken = tokens
        .filter((token) => token.x >= quantityHeader.x - 12 && token.x <= quantityHeader.x + 35 && /^\d+(?:\.\d+)?$/.test(token.text))
        .sort((first, second) => Math.abs(first.y - row.y) - Math.abs(second.y - row.y))[0];
      const amountToken = tokens
        .filter((token) => token.x >= totalHeader.x - 10 && token.x <= totalHeader.x + 45 && /^\d[\d,]*(?:\.\d{1,2})?$/.test(token.text))
        .sort((first, second) => Math.abs(first.y - row.y) - Math.abs(second.y - row.y))[0];
      const description = descriptionGroups[index]
        .sort((first, second) => second.y - first.y || first.x - second.x)
        .map((token) => token.text);
      const product = cleanPdfProductName(description);

      if (product && quantityToken) {
        const item = { product, quantity: quantityToken.text };
        if (purchaseDate) item.purchaseDate = purchaseDate;
        if (amountToken) item.price = amountToken.text.replace(/,/g, '');
        extractedItems.push(item);
      }
    });
  }

  return extractedItems.slice(0, 50);
}

async function extractScannedPdfItems(file) {
  const { document: pdfDocument } = await loadPdfDocument(file);
  const items = [];

  for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
    showOCRStatus(`Scanning PDF page ${pageNumber} of ${pdfDocument.numPages}...`, 'info');
    const page = await pdfDocument.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    await page.render({ canvasContext: context, viewport }).promise;

    const imageBlob = await new Promise((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Could not render this PDF page.')), 'image/png');
    });
    const formData = new FormData();
    formData.append('billImage', imageBlob, `bill-page-${pageNumber}.png`);
    const response = await fetch('/api/bill/import', { method: 'POST', body: formData });
    const result = await response.json();

    if (!response.ok && response.status !== 422) {
      throw new Error(result.message || `Could not read PDF page ${pageNumber}.`);
    }
    items.push(...(result.items || []));
    if (items.length >= 10) break;
  }

  return items.slice(0, 10);
}

function setBillFile(file) {
  if (!file) return;
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  const isImage = ['image/jpeg', 'image/png', 'image/webp'].includes(file.type);
  if (!isPdf && !isImage) {
    currentFile = null;
    processBillBtn.disabled = true;
    showOCRStatus('Choose a JPG, PNG, WebP, or PDF bill.', 'error');
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    currentFile = null;
    processBillBtn.disabled = true;
    showOCRStatus('The bill image must be smaller than 10 MB.', 'error');
    return;
  }

  currentFile = file;
  pendingItems = [];
  billFlowStep = 'selection';
  clearBillDraft();
  processBillBtn.disabled = false;
  selectedBillName.textContent = file.name;
  resultsPanel.classList.add('hidden');
  uploadAnotherBillBtn.classList.add('hidden');
  showOCRStatus('', 'info');

  billPreviewWrap.classList.toggle('hidden', isPdf);
  if (!isPdf) {
    const reader = new FileReader();
    reader.onload = (event) => {
      billPreview.src = event.target.result;
    };
    reader.readAsDataURL(file);
  }

  processBillBtn.click();
}

function showOCRStatus(message, type) {
  ocrStatus.textContent = message;
  ocrStatus.className = `form-message ${type}${message ? ' is-visible' : ''}`;
}

billImageInput.addEventListener('change', (event) => {
  setBillFile(event.target.files[0]);
});

billDropZone.addEventListener('dragover', (event) => {
  event.preventDefault();
  billDropZone.classList.add('is-dragging');
});

billDropZone.addEventListener('dragleave', () => {
  billDropZone.classList.remove('is-dragging');
});

billDropZone.addEventListener('drop', (event) => {
  event.preventDefault();
  billDropZone.classList.remove('is-dragging');
  setBillFile(event.dataTransfer.files[0]);
});

processBillBtn.addEventListener('click', async () => {
  if (!currentFile) {
    showOCRStatus('Please choose a bill image first.', 'error');
    return;
  }

  processBillBtn.disabled = true;
  processBillBtn.textContent = 'Reading bill...';
  showOCRStatus('Reading items from your bill. This may take a moment.', 'info');

  try {
    const isPdf = currentFile.type === 'application/pdf' || currentFile.name.toLowerCase().endsWith('.pdf');
    let response;

    if (isPdf) {
      pendingItems = await extractStructuredPdfItems(currentFile);

      if (!pendingItems.length) {
        const text = await extractPdfText(currentFile);
        response = await fetch('/api/bill/parse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text })
        });
        let result = await response.json();

        if (response.status === 400 || response.status === 422 || (response.ok && !result.items?.length)) {
          const items = await extractScannedPdfItems(currentFile);
          if (!items.length) {
            throw new Error('No grocery items were detected. Try a clearer PDF or image-based bill.');
          }
          result = { items };
        } else if (!response.ok) {
          throw new Error(result.message || 'Could not extract grocery items from this PDF.');
        }

        pendingItems = result.items || [];
      }
    } else {
      const formData = new FormData();
      formData.append('billImage', currentFile);
      response = await fetch('/api/bill/import', {
        method: 'POST',
        body: formData
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || 'Could not extract grocery items.');
      }
      pendingItems = result.items || [];
    }

    if (!pendingItems.length) {
      throw new Error('No grocery items were detected. Try a clearer bill or a text-based PDF.');
    }

    pendingItems = pendingItems.map((item, index) => ({
      ...item,
      id: `${Date.now()}-${index}`,
      product: item.product || item.name || '',
      quantity: item.quantity || '1',
      category: suggestCategory(item.product || item.name || ''),
      purchaseDate: item.purchaseDate || '',
      expiryDate: item.expiryDate || '',
      price: item.price || '',
      selected: item.selected !== false
    }));
    reviewBillName.textContent = currentFile.name;
    renderSelectionItems();
    billFlowStep = 'selection';
    saveBillDraft();
    selectionStep.classList.remove('hidden');
    detailsStep.classList.add('hidden');
    billUploadPanel.classList.add('hidden');
    resultsPanel.classList.remove('hidden');
    showOCRStatus('');
  } catch (error) {
    console.error('OCR failed:', error);
    showOCRStatus(error.message || 'Could not read this bill. Please try a clearer image.', 'error');
  } finally {
    processBillBtn.disabled = false;
    processBillBtn.textContent = 'Find grocery items';
  }
});

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderSelectionItems() {
  detectedItemCount.textContent = `${pendingItems.length} ${pendingItems.length === 1 ? 'item' : 'items'}`;
  pendingBillItems.innerHTML = pendingItems.map((item) => `
    <article class="bill-selection-row" data-item-id="${escapeHtml(item.id)}">
      <label class="bill-select-control" aria-label="Select ${escapeHtml(item.product)}">
        <input type="checkbox" data-selected ${item.selected === false ? '' : 'checked'} />
      </label>
      <label class="bill-selection-name">Item name
        <input data-field="product" value="${escapeHtml(item.product)}" required />
      </label>
      <label class="bill-selection-quantity">Quantity
        <input data-field="quantity" type="number" min="0.01" step="0.01" value="${escapeHtml(item.quantity)}" required />
      </label>
    </article>
  `).join('');
}

function renderBillDetails() {
  detectedItemCount.textContent = `${pendingItems.length} selected ${pendingItems.length === 1 ? 'item' : 'items'}`;
  billDetailsList.innerHTML = pendingItems.map((item) => `
    <article class="pending-bill-card" data-item-id="${escapeHtml(item.id)}">
      <div class="bill-item-summary">
        <strong>${escapeHtml(item.product)}</strong>
        <span>Quantity: ${escapeHtml(item.quantity)}</span>
      </div>
      <div class="pending-bill-fields">
        <label>Category<select data-field="category" required>${groceryCategories.map((category) => `
          <option value="${escapeHtml(category)}" ${category === item.category ? 'selected' : ''}>${escapeHtml(category)}</option>
        `).join('')}</select></label>
        <label>Purchase date<input data-field="purchaseDate" type="date" value="${escapeHtml(item.purchaseDate)}" required /></label>
        <label>Expiry date<input data-field="expiryDate" type="date" value="${escapeHtml(item.expiryDate)}" required /></label>
        <label>Price (₹)<input data-field="price" type="number" min="0.01" step="0.01" value="${escapeHtml(item.price)}" required /></label>
      </div>
      <div class="pending-bill-actions">
        <p class="pending-item-message" aria-live="polite"></p>
        <button class="btn btn-primary" type="button" data-add-item="true">Add to Grocery</button>
      </div>
    </article>
  `).join('');
}

continueSelectedBtn.addEventListener('click', () => {
  storeBillSelection();
  const selectedItems = [...pendingBillItems.querySelectorAll('.bill-selection-row')]
    .filter((row) => row.querySelector('[data-selected]').checked)
    .map((row) => {
      const item = pendingItems.find((pendingItem) => pendingItem.id === row.dataset.itemId);
      return {
        ...item,
        product: row.querySelector('[data-field="product"]').value.trim(),
        quantity: row.querySelector('[data-field="quantity"]').value
      };
    })
    .filter((item) => item.product && Number(item.quantity) > 0);

  if (!selectedItems.length) {
    document.getElementById('selectionMessage').textContent = 'Select at least one item and check its name and quantity.';
    return;
  }

  document.getElementById('selectionMessage').textContent = '';
  pendingItems = selectedItems.map((item) => ({ ...item, selected: true }));
  billFlowStep = 'details';
  saveBillDraft();
  selectionStep.classList.add('hidden');
  detailsStep.classList.remove('hidden');
  renderBillDetails();
});

backToSelectionBtn.addEventListener('click', () => {
  storeBillDetails();
  billFlowStep = 'selection';
  saveBillDraft();
  detailsStep.classList.add('hidden');
  selectionStep.classList.remove('hidden');
  renderSelectionItems();
});

chooseAnotherFileBtn.addEventListener('click', () => {
  if (window.confirm('Discard these detected items and choose another bill?')) {
    billImageInput.value = '';
    billImageInput.click();
  }
});

billDetailsList.addEventListener('click', async (event) => {
  const addButton = event.target.closest('[data-add-item="true"]');
  if (!addButton) return;

  const card = addButton.closest('.pending-bill-card');
  const item = pendingItems.find((pendingItem) => pendingItem.id === card.dataset.itemId);
  if (!item) return;

  const fields = Object.fromEntries([...card.querySelectorAll('[data-field]')].map((field) => [field.dataset.field, field]));
  const invalidField = Object.values(fields).find((field) => !field.checkValidity());
  if (invalidField) {
    invalidField.reportValidity();
    return;
  }

  const payload = {
    name: item.product,
    quantity: Number(item.quantity),
    category: fields.category.value,
    purchaseDate: fields.purchaseDate.value,
    expiryDate: fields.expiryDate.value || null,
    price: Number(fields.price.value),
    unit: 'pcs',
    source: 'Bill Import'
  };

  addButton.disabled = true;
  addButton.textContent = 'Adding...';

  try {
    const response = await fetch('/api/groceries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.message || 'Could not add this grocery.');
    }

    storeBillDetails();
    pendingItems = pendingItems.filter((pendingItem) => pendingItem.id !== item.id);
    if (pendingItems.length) {
      saveBillDraft();
      renderBillDetails();
    } else {
      clearBillDraft();
      resultsPanel.classList.add('hidden');
      billUploadPanel.classList.remove('hidden');
      uploadAnotherBillBtn.classList.remove('hidden');
      billImageInput.value = '';
      currentFile = null;
      billPreviewWrap.classList.add('hidden');
      selectedBillName.textContent = 'JPG, PNG, WebP, or PDF';
      showOCRStatus('All selected items are saved. Upload another bill whenever you’re ready.', 'success');
    }
  } catch (error) {
    card.querySelector('.pending-item-message').textContent = error.message || 'Unable to save this grocery.';
    addButton.disabled = false;
    addButton.textContent = 'Add to Grocery';
  }
});

function storeBillDetails() {
  billDetailsList.querySelectorAll('.pending-bill-card').forEach((card) => {
    const item = pendingItems.find((pendingItem) => pendingItem.id === card.dataset.itemId);
    if (!item) return;

    card.querySelectorAll('[data-field]').forEach((field) => {
      item[field.dataset.field] = field.value;
    });
  });
}

function storeBillSelection() {
  pendingBillItems.querySelectorAll('.bill-selection-row').forEach((row) => {
    const item = pendingItems.find((pendingItem) => pendingItem.id === row.dataset.itemId);
    if (!item) return;

    item.product = row.querySelector('[data-field="product"]').value;
    item.quantity = row.querySelector('[data-field="quantity"]').value;
    item.selected = row.querySelector('[data-selected]').checked;
  });
}

pendingBillItems.addEventListener('input', () => {
  storeBillSelection();
  saveBillDraft();
});
pendingBillItems.addEventListener('change', () => {
  storeBillSelection();
  saveBillDraft();
});
billDetailsList.addEventListener('input', () => {
  storeBillDetails();
  saveBillDraft();
});
billDetailsList.addEventListener('change', () => {
  storeBillDetails();
  saveBillDraft();
});

uploadAnotherBillBtn.addEventListener('click', () => {
  billImageInput.value = '';
  billImageInput.click();
});

restoreBillDraft();
