const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 4173;
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');
const QUESTIONS_FILE = path.join(DATA_DIR, 'questions.json');
const PROGRESS_FILE = path.join(DATA_DIR, 'progress.json');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

function defaultProgress() {
  return {
    createdAt: new Date().toISOString(),
    attempts: [],
    stats: {
      beginner: { attempted: 0, correct: 0 },
      medium: { attempted: 0, correct: 0 },
      hard: { attempted: 0, correct: 0 },
      byDeck: {},
      byQuestion: {},
    },
  };
}

function readJSON(file, fallback) {
  try {
    const raw = fs.readFileSync(file, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    return fallback;
  }
}

function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

function ensureProgressFile() {
  if (!fs.existsSync(PROGRESS_FILE)) {
    writeJSON(PROGRESS_FILE, defaultProgress());
  }
}

function sendJSON(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function serveStatic(req, res) {
  let reqPath = decodeURIComponent(req.url.split('?')[0]);
  if (reqPath === '/') reqPath = '/index.html';
  const filePath = path.normalize(path.join(PUBLIC_DIR, reqPath));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function mergeAttemptIntoStats(stats, attempt) {
  for (const qr of attempt.questionResults) {
    const diffBucket = stats[qr.difficulty];
    if (diffBucket) {
      diffBucket.attempted += 1;
      if (qr.correct) diffBucket.correct += 1;
    }

    const deckKey = String(qr.deck);
    if (!stats.byDeck[deckKey]) stats.byDeck[deckKey] = { attempted: 0, correct: 0, topic: qr.topic || '' };
    stats.byDeck[deckKey].attempted += 1;
    if (qr.correct) stats.byDeck[deckKey].correct += 1;
    if (qr.topic) stats.byDeck[deckKey].topic = qr.topic;

    if (!stats.byQuestion[qr.id]) stats.byQuestion[qr.id] = { attempts: 0, correct: 0 };
    stats.byQuestion[qr.id].attempts += 1;
    if (qr.correct) stats.byQuestion[qr.id].correct += 1;
  }
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.url.startsWith('/api/questions') && req.method === 'GET') {
      const questions = readJSON(QUESTIONS_FILE, []);
      sendJSON(res, 200, questions);
      return;
    }

    if (req.url.startsWith('/api/progress') && req.method === 'GET') {
      ensureProgressFile();
      const progress = readJSON(PROGRESS_FILE, defaultProgress());
      sendJSON(res, 200, progress);
      return;
    }

    if (req.url.startsWith('/api/progress/reset') && req.method === 'POST') {
      const fresh = defaultProgress();
      writeJSON(PROGRESS_FILE, fresh);
      sendJSON(res, 200, fresh);
      return;
    }

    if (req.url.startsWith('/api/progress') && req.method === 'POST') {
      ensureProgressFile();
      const body = await readBody(req);
      if (!body || !Array.isArray(body.questionResults)) {
        sendJSON(res, 400, { error: 'Invalid attempt payload' });
        return;
      }
      const progress = readJSON(PROGRESS_FILE, defaultProgress());
      const attempt = {
        timestamp: new Date().toISOString(),
        difficulty: body.difficulty || 'mixed',
        deckFilter: body.deckFilter || null,
        total: body.total || body.questionResults.length,
        correct: body.correct || body.questionResults.filter((q) => q.correct).length,
        questionResults: body.questionResults,
      };
      progress.attempts.push(attempt);
      mergeAttemptIntoStats(progress.stats, attempt);
      writeJSON(PROGRESS_FILE, progress);
      sendJSON(res, 200, progress);
      return;
    }

    if (req.method === 'GET') {
      serveStatic(req, res);
      return;
    }

    sendJSON(res, 405, { error: 'Method not allowed' });
  } catch (err) {
    sendJSON(res, 500, { error: String(err && err.message ? err.message : err) });
  }
});

ensureProgressFile();
server.listen(PORT, () => {
  console.log(`CCDV-F exam prep portal running at http://localhost:${PORT}`);
});
