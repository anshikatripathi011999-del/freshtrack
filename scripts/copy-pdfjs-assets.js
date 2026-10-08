const fs = require('fs');
const path = require('path');

const sourceDirectory = path.resolve(__dirname, '../node_modules/pdfjs-dist/build');
const destinationDirectory = path.resolve(__dirname, '../public/vendor/pdfjs');
const browserAssets = ['pdf.mjs', 'pdf.worker.mjs'];

fs.mkdirSync(destinationDirectory, { recursive: true });

browserAssets.forEach((asset) => {
  fs.copyFileSync(path.join(sourceDirectory, asset), path.join(destinationDirectory, asset));
});