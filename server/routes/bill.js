const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const Tesseract = require('tesseract.js');
const { requireAuth } = require('./groceries');

const router = express.Router();
const uploadDir = path.join(__dirname, '../uploads');

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname);
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, callback) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.mimetype)) {
      return callback(new Error('Upload a JPG, PNG, or WebP image.'));
    }
    callback(null, true);
  }
});

function normalizeText(text) {
  return text
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function detectDate(text) {
  const dateRegex = /(\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4}|\d{2}-\d{2}-\d{4})/;
  const match = text.match(dateRegex);
  if (!match) return '';
  if (/^\d{4}-/.test(match[0])) return match[0];

  const [day, month, year] = match[0].split(/[/-]/);
  return `${year}-${month}-${day}`;
}

function extractBillItems(rawText) {
  const lines = normalizeText(rawText);
  const items = [];
  const totalLine = [...lines].reverse().find((line) => /\btotal\s+bill\b/i.test(line));
  const totalAmounts = totalLine ? totalLine.match(/\d[\d,]*(?:\.\d{1,2})?/g) : null;
  const billTotal = totalAmounts?.length
    ? Number(totalAmounts[totalAmounts.length - 1].replace(/,/g, ''))
    : null;

  lines.forEach((line, lineIndex) => {
    const lineLower = line.toLowerCase();
    if (/\b(order|delivered|items?\s+in\s+order|bill summary|order details|subtotal|grand total|total|tax|gst|receipt|invoice|discount|change|cash|card|payment|thank you|delivery fee|handling fee)\b/.test(lineLower)) {
      return;
    }

    const amountMatch = line.match(/(?:₹|rs\.?|inr)?\s*(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)\s*$/i);
    if (!amountMatch) {
      return;
    }

    let productText = line.slice(0, amountMatch.index).trim();
    const price = Number(amountMatch[1].replace(/,/g, ''));
    let quantity = 1;

    if (/^\d+\s+[A-Za-z]/.test(productText) && amountMatch[1].startsWith('2')) {
      productText = productText.replace(/^\d+\s+/, '');
    }

    const trailingNumbers = [...productText.matchAll(/(?:^|\s)(\d+(?:\.\d+)?)(?=\s|$)/g)].map((match) => ({
      value: match[1],
      start: match.index + match[0].lastIndexOf(match[1]),
      end: match.index + match[0].lastIndexOf(match[1]) + match[1].length
    }));
    const lastNumber = trailingNumbers[trailingNumbers.length - 1];
    const previousNumber = trailingNumbers[trailingNumbers.length - 2];
    const trailingQuantity = productText.match(/\s+(\d+(?:\.\d+)?)\s*(?:x|qty)$/i);
    const leadingQuantity = productText.match(/^(\d+(?:\.\d+)?)\s*(?:x|qty)\s+(.+)$/i);

    if (trailingQuantity) {
      quantity = Number(trailingQuantity[1]) || 1;
      productText = productText.slice(0, trailingQuantity.index).trim();
    } else if (lastNumber && lastNumber.end === productText.length) {
      const hasTrailingRate = previousNumber &&
        productText.slice(previousNumber.end, lastNumber.start).trim() === '';
      const quantityToken = hasTrailingRate ? previousNumber : lastNumber;
      quantity = Number(quantityToken.value) || 1;
      productText = productText.slice(0, quantityToken.start).trim();
    } else if (leadingQuantity) {
      quantity = Number(leadingQuantity[1]) || 1;
      productText = leadingQuantity[2].trim();
    }

    const productName = productText
      .replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9)]+$/g, '')
      .replace(/\s{2,}/g, ' ');

    if (!productName || productName.length < 2 || !Number.isFinite(price)) {
      return;
    }

    const followingDetails = lines.slice(lineIndex + 1, lineIndex + 3).join(' ');
    const unitCountMatch = followingDetails.match(/\b([0-9ilT])\s*units?\b/i);
    if (unitCountMatch) {
      quantity = Number(unitCountMatch[1]) || 1;
    }

    items.push({
      product: productName,
      quantity: String(quantity),
      priceOptions: amountMatch[1].startsWith('2') && amountMatch[1].length > 1
        ? [price, Number(amountMatch[1].slice(1))]
        : [price],
      purchaseDate: detectDate(line) || detectDate(rawText),
      expiryDate: ''
    });
  });

  const limitedItems = items.slice(0, 10);
  if (Number.isFinite(billTotal) && limitedItems.length) {
    let bestPrices = limitedItems.map((item) => item.priceOptions[0]);
    let smallestDifference = Math.abs(bestPrices.reduce((sum, value) => sum + value, 0) - billTotal);

    for (let combination = 1; combination < (1 << limitedItems.length); combination += 1) {
      const candidatePrices = limitedItems.map((item, index) => (
        combination & (1 << index) ? item.priceOptions[item.priceOptions.length - 1] : item.priceOptions[0]
      ));
      const difference = Math.abs(candidatePrices.reduce((sum, value) => sum + value, 0) - billTotal);
      if (difference < smallestDifference) {
        bestPrices = candidatePrices;
        smallestDifference = difference;
      }
    }

    limitedItems.forEach((item, index) => {
      item.price = String(bestPrices[index]);
      delete item.priceOptions;
    });
  } else {
    limitedItems.forEach((item) => {
      item.price = String(item.priceOptions[0]);
      delete item.priceOptions;
    });
  }

  return limitedItems;
}

router.post('/bill/parse', requireAuth, (req, res) => {
  const rawText = typeof req.body.text === 'string' ? req.body.text : '';
  if (!rawText.trim()) {
    return res.status(400).json({ message: 'No readable text was found in this bill.' });
  }

  const items = extractBillItems(rawText);
  if (!items.length) {
    return res.status(422).json({ message: 'No grocery items were detected in this bill.' });
  }

  return res.json({ message: 'Bill processed successfully.', items });
});

router.post('/bill/import', requireAuth, upload.single('billImage'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Please choose a bill image.' });
    }

    const { data } = await Tesseract.recognize(req.file.path, 'eng');
    const parsedItems = extractBillItems(data.text || '');

    return res.status(200).json({
      message: 'Bill processed successfully.',
      items: parsedItems,
      rawText: data.text || ''
    });
  } catch (error) {
    console.error('Bill OCR error:', error);
    return res.status(500).json({ message: 'OCR processing failed. Please try again with a clearer image.' });
  } finally {
    if (req.file) {
      fs.unlink(req.file.path, (unlinkError) => {
        if (unlinkError) {
          console.error('Failed to delete temp bill image:', unlinkError);
        }
      });
    }
  }
});

module.exports = router;
