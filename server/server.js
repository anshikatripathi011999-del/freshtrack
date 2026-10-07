const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const session = require('express-session');
const helmet = require('helmet');
const MongoStore = require('connect-mongo').default;
const authRoutes = require('./routes/auth');
const groceryRoutes = require('./routes/groceries').router;
const billRoutes = require('./routes/bill');

const app = express();
const isProduction = process.env.NODE_ENV === 'production';
const PORT = process.env.PORT || (isProduction ? 3000 : 5000);
const MONGODB_URI = process.env.MONGODB_URI || (isProduction ? '' : 'mongodb://127.0.0.1:27017/freshtrack');
const SESSION_SECRET = process.env.SESSION_SECRET || (isProduction ? '' : 'freshtrack-local-development-secret');

if (isProduction && !MONGODB_URI) {
  throw new Error('MONGODB_URI must be configured in production.');
}
if (isProduction && SESSION_SECRET.length < 32) {
  throw new Error('Set SESSION_SECRET to a random value of at least 32 characters in production.');
}

if (isProduction) {
  app.set('trust proxy', 1);
}

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      imgSrc: ["'self'", 'data:', 'blob:'],
      objectSrc: ["'none'"],
      scriptSrc: ["'self'", "'wasm-unsafe-eval'"],
      scriptSrcAttr: ["'none'"],
      styleSrc: ["'self'", 'https://fonts.googleapis.com'],
      styleSrcAttr: ["'none'"],
      workerSrc: ["'self'", 'blob:'],
      upgradeInsecureRequests: isProduction ? [] : null
    }
  }
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: SESSION_SECRET,
  store: MongoStore.create({
    mongoUrl: MONGODB_URI,
    collectionName: 'sessions',
    ttl: 60 * 60 * 8
  }),
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 8
  }
}));

let connectionPromise;
async function connectDB() {
  if (mongoose.connection.readyState === 1) return;
  if (!connectionPromise) {
    connectionPromise = mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 5000 })
      .catch((error) => {
        connectionPromise = null;
        throw error;
      });
  }
  await connectionPromise;
}

app.use('/api', (req, res, next) => {
  connectDB().then(() => next()).catch(next);
});

app.use('/api', authRoutes);
app.use('/api', groceryRoutes);
app.use('/api', billRoutes);

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.get('/dashboard.html', (req, res) => {
  if (!req.session.userId) {
    return res.redirect('/login.html');
  }
  res.sendFile(path.join(__dirname, '../public/dashboard.html'));
});

app.get('/groceries.html', (req, res) => {
  if (!req.session.userId) {
    return res.redirect('/login.html');
  }
  res.sendFile(path.join(__dirname, '../public/groceries.html'));
});

app.get('/add-grocery.html', (req, res) => {
  if (!req.session.userId) {
    return res.redirect('/login.html');
  }
  res.sendFile(path.join(__dirname, '../public/add-grocery.html'));
});

app.get('/bill-import.html', (req, res) => {
  if (!req.session.userId) {
    return res.redirect('/login.html');
  }
  res.sendFile(path.join(__dirname, '../public/bill-import.html'));
});

app.use('/vendor/pdfjs', express.static(path.join(__dirname, '../node_modules/pdfjs-dist/build')));
app.use(express.static(path.join(__dirname, '../public'), { index: false, dotfiles: 'deny' }));

app.use((error, req, res, next) => {
  console.error('Request failed:', error);
  if (res.headersSent) return next(error);
  const status = error.code === 'LIMIT_FILE_SIZE' ? 413 : (error.status || 500);
  res.status(status).json({ message: isProduction ? 'Request failed.' : error.message });
});

if (!isProduction) {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

// Vercel serverless function requirement
module.exports = app;
