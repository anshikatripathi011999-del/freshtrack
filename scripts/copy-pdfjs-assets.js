const fs = require('fs');
const path = require('path');

const sourceDirectory = path.resolve(__dirname, '../node_modules/pdfjs-dist/build');
const destinationDirectory = path.resolve(__dirname, '../public/vendor/pdfjs');
const browserAssets = ['pdf.mjs', 'pdf.worker.mjs'];

fs.mkdirSync(destinationDirectory, { recursive: true });

browserAssets.forEach((asset) => {
  fs.copyFileSync(path.join(sourceDirectory, asset), path.join(destinationDirectory, asset));
});

const tesseractSource = path.resolve(__dirname, '../node_modules/tesseract.js/dist');
const tesseractCoreSource = path.resolve(__dirname, '../node_modules/tesseract.js-core');
const tesseractDestination = path.resolve(__dirname, '../public/vendor/tesseract');
const tesseractLanguageDirectory = path.join(tesseractDestination, 'lang');

fs.mkdirSync(tesseractLanguageDirectory, { recursive: true });

[
  [path.join(tesseractSource, 'tesseract.esm.min.js'), path.join(tesseractDestination, 'tesseract.esm.min.js')],
  [path.join(tesseractSource, 'worker.min.js'), path.join(tesseractDestination, 'worker.min.js')],
  [path.join(tesseractCoreSource, 'tesseract-core-simd-lstm.wasm.js'), path.join(tesseractDestination, 'tesseract-core-simd-lstm.wasm.js')],
  [path.join(tesseractCoreSource, 'tesseract-core-simd-lstm.wasm'), path.join(tesseractDestination, 'tesseract-core-simd-lstm.wasm')],
  [path.resolve(__dirname, '../eng.traineddata'), path.join(tesseractLanguageDirectory, 'eng.traineddata')]
].forEach(([source, destination]) => {
  fs.copyFileSync(source, destination);
});