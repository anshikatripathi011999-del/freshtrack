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
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';
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

app.use('/api', authRoutes);
app.use('/api', groceryRoutes);
app.use('/api', billRoutes);

app.use('/vendor/pdfjs', express.static(path.join(__dirname, '../node_modules/pdfjs-dist/build')));
app.use(express.static(path.join(__dirname, '../public')));

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

// Database connection function
let isConnected = false;

const connectDB = async () => {
  if (isConnected && mongoose.connection.readyState === 1) return;

  try {
    const db = await mongoose.connect(process.env.MONGODB_URI || MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      bufferCommands: false,
    });
    isConnected = db.connections[0].readyState === 1;
    console.log('MongoDB connected successfully.');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    throw error;
  }
};

// Middleware to ensure DB connection before handling routes
app.use(async (req, res, next) => {
  await connectDB();
  next();
});

// Local testing ke liye (Vercel par app listen nahi call hota)
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

// Vercel serverless function requirement
module.exports = app;
