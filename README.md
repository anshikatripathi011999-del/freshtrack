# FreshTrack

## Setup

1. Install Node.js from the official website.
2. Open a terminal in this project folder and install dependencies:

   ```bash
   npm install
   ```

3. Start MongoDB locally.
4. Configure the MongoDB connection in the server configuration if needed. The default connection is:

   ```bash
   mongodb://127.0.0.1:27017/freshtrack
   ```

5. Start the Express server:

   ```bash
   npm start
   ```

6. Open the website in your browser:

   ```text
   http://localhost:3000
   ```

## Production security

Set `NODE_ENV=production`, `MONGODB_URI` to a secured MongoDB connection string, and `SESSION_SECRET` to a unique random value of at least 32 characters. Terminate HTTPS at the hosting provider or trusted reverse proxy; production session cookies are marked `Secure` and require HTTPS. Do not reuse the local development session secret in a deployment.
