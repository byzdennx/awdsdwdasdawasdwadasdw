const express = require('express');
const cors = require('cors');
const path = require('path');
const { execFile } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Helper: jalankan musicaly.js dan ambil JSON output
function runMusicaly(args, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    execFile('node', [path.join(__dirname, 'musicaly.js'), ...args], {
      timeout: timeoutMs,
      maxBuffer: 20 * 1024 * 1024,
    }, (error, stdout, stderr) => {
      if (error && !stdout) return reject(new Error(stderr || error.message));
      try {
        const parsed = JSON.parse(stdout);
        resolve(parsed);
      } catch (e) {
        reject(new Error('Invalid JSON output: ' + stdout.slice(0, 200)));
      }
    });
  });
}

// ============ ROUTES ============

// Health check
app.get('/api', (req, res) => {
  res.json({
    creator: 'MyEx',
    status: true,
    endpoints: {
      'GET /api/search?q=&type=': 'type: all|songs|playlists|artists',
      'GET /api/album?id=': 'browseId album/playlist',
      'GET /api/artist?id=': 'browseId artist',
      'GET /api/lyrics?id=&title=&artist=': 'videoId + opsional title/artist',
      'GET /api/ytplay?url=': 'videoId atau URL',
      'GET /api/suggest?q=': 'query suggestion',
      'GET /api/transcribe?url=': 'videoId atau URL',
      'GET /api/translate?text=&tl=': 'tl default=id',
    },
  });
});

// Search
app.get('/api/search', async (req, res) => {
  const { q, type = 'all' } = req.query;
  if (!q) return res.status(400).json({ status: false, error: 'Parameter q wajib' });
  try {
    const data = await runMusicaly(['search', q, type]);
    res.json(data);
  } catch (e) {
    res.status(500).json({ status: false, error: e.message });
  }
});

// Album
app.get('/api/album', async (req, res) => {
  const { id } = req.query;
  if (!id) return res.status(400).json({ status: false, error: 'Parameter id wajib' });
  try {
    res.json(await runMusicaly(['album', id]));
  } catch (e) {
    res.status(500).json({ status: false, error: e.message });
  }
});

// Artist
app.get('/api/artist', async (req, res) => {
  const { id } = req.query;
  if (!id) return res.status(400).json({ status: false, error: 'Parameter id wajib' });
  try {
    res.json(await runMusicaly(['artist', id]));
  } catch (e) {
    res.status(500).json({ status: false, error: e.message });
  }
});

// Lyrics
app.get('/api/lyrics', async (req, res) => {
  const { id, title = '', artist = '' } = req.query;
  if (!id) return res.status(400).json({ status: false, error: 'Parameter id wajib' });
  try {
    res.json(await runMusicaly(['lyrics', id, title, artist]));
  } catch (e) {
    res.status(500).json({ status: false, error: e.message });
  }
});

// YT Audio
app.get('/api/ytplay', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ status: false, error: 'Parameter url wajib' });
  try {
    res.json(await runMusicaly(['ytplay', url], 30000));
  } catch (e) {
    res.status(500).json({ status: false, error: e.message });
  }
});

// Suggest
app.get('/api/suggest', async (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).json({ status: false, error: 'Parameter q wajib' });
  try {
    res.json(await runMusicaly(['suggest', q]));
  } catch (e) {
    res.status(500).json({ status: false, error: e.message });
  }
});

// Transcribe
app.get('/api/transcribe', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ status: false, error: 'Parameter url wajib' });
  try {
    res.json(await runMusicaly(['transcribe', url], 120000));
  } catch (e) {
    res.status(500).json({ status: false, error: e.message });
  }
});

// Translate
app.get('/api/translate', async (req, res) => {
  const { text, tl = 'id' } = req.query;
  if (!text) return res.status(400).json({ status: false, error: 'Parameter text wajib' });
  try {
    res.json(await runMusicaly(['translate', text, tl], 20000));
  } catch (e) {
    res.status(500).json({ status: false, error: e.message });
  }
});

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
