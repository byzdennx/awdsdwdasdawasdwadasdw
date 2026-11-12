const https = require('https');
const http  = require('http');
const crypto = require('crypto');
const fs    = require('fs');
const path  = require('path');
const os    = require('os');
const axios = require('axios');

const CREATOR = 'MyEx';
const SALURAN = 'x';
const API_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';
const ASSEMBLYAI_KEY = 'b6d6101e7ded44a6921bc5a8146765a1';

const ok  = (data) => { console.log(JSON.stringify({ creator: CREATOR, saluran: SALURAN, status: true, result: data }, null, 2)); };
const err = (msg, detail) => { console.log(JSON.stringify({ creator: CREATOR, saluran: SALURAN, status: false, error: msg, detail: detail || undefined }, null, 2)); process.exit(1); };

function getRunsText(r) { return Array.isArray(r) ? r.map(x => x.text || '').join('') : ''; }

function toHDThumb(url, videoId) {
  if (!url && videoId) return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  if (!url) return '';
  let h = String(url);
  if (h.includes('googleusercontent.com') || h.includes('ggpht.com') || h.includes('ytimg.com')) {
    if (/=w\d+-h\d+/i.test(h))  h = h.replace(/=w\d+-h\d+[^?#]*/i, '=w800-h800-l90-rj');
    else if (/=s\d+/i.test(h))  h = h.replace(/=s\d+[^?#]*/i, '=s800-c-k-c0x00ffffff-no-rj');
    else if (/=w\d+/i.test(h))  h = h.replace(/=w\d+[^?#]*/i, '=w800-h800-l90-rj');
  }
  if (h.includes('i.ytimg.com/vi/') || h.includes('img.youtube.com/vi/')) {
    h = h.split('?')[0].replace(/(hqdefault|mqdefault|sddefault|default)\.jpg/i, 'hqdefault.jpg');
  }
  return h;
}

function txThumbs(arr, vid) {
  if (!Array.isArray(arr) || !arr.length) return vid ? [{ url: `https://i.ytimg.com/vi/${vid}/hqdefault.jpg` }] : [];
  return arr.map(t => ({ ...t, url: toHDThumb(t.url, vid) }));
}

function findAll(obj, key, out = []) {
  if (!obj || typeof obj !== 'object') return out;
  if (Object.prototype.hasOwnProperty.call(obj, key)) out.push(obj[key]);
  for (const v of Object.values(obj)) if (typeof v === 'object') findAll(v, key, out);
  return out;
}

function makeReq(opts, body) {
  return new Promise((res, rej) => {
    const mod = (opts.hostname || '').startsWith('http:') ? http : https;
    const req = mod.request(opts, r => {
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => { try { res(JSON.parse(d)); } catch { res(d); } });
    });
    req.on('error', rej);
    req.on('timeout', () => { req.destroy(); rej(new Error('Timeout')); });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function httpGetJson(url, ms = 3500) {
  return new Promise(res => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: ms }, r => {
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => { try { res(JSON.parse(d)); } catch { res(null); } });
    });
    req.on('error', () => res(null));
    req.on('timeout', () => { req.destroy(); res(null); });
  });
}

async function ytmSearch(query, type) {
  const payload = {
    context: { client: { clientName: 'WEB_REMIX', clientVersion: '1.20240101.00.00', hl: 'id', gl: 'ID' } },
    query,
    ...(type === 'songs'   ? { params: 'EgWKAQIIAWoSEAQQAxAFEAkQChAVEBAQERAO' } : {}),
    ...(type === 'artists' ? { params: 'EgWKAQIgAWoKEAoQCRADEAA=' } : {}),
  };
  const { data } = await axios.post('https://music.youtube.com/youtubei/v1/search?prettyPrint=false', payload, {
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0', 'Origin': 'https://music.youtube.com' },
    timeout: 15000,
  });
  return data;
}

async function cmdSearch(query, type = 'all') {
  const urlVidMatch = query.match(/[?&]v=([^&]+)/) || query.match(/youtu\.be\/([^?]+)/);
  const urlVid = urlVidMatch?.[1] || '';

  if (urlVid && (type === 'all' || type === 'songs')) {
    try {
      const p = { context: { client: { clientName: 'WEB_REMIX', clientVersion: '1.20240101.00.00', hl: 'id', gl: 'ID' } }, videoId: urlVid };
      const r = await axios.post('https://music.youtube.com/youtubei/v1/next?prettyPrint=false', p, { timeout: 15000 });
      const item = r.data?.contents?.singleColumnMusicWatchNextResultsRenderer?.tabbedRenderer?.watchNextTabbedResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.musicQueueRenderer?.content?.playlistPanelRenderer?.contents?.[0]?.playlistPanelVideoRenderer;
      if (item && item.videoId === urlVid) {
        const title = getRunsText(item.title?.runs || []);
        const artist = getRunsText(item.longBylineText?.runs || []);
        const dur = getRunsText(item.lengthText?.runs || []);
        const thumb = toHDThumb((item.thumbnail?.thumbnails || []).at(-1)?.url, urlVid);
        const m = dur.match(/(\d+):(\d+)/);
        return ok({ query, totalSongs: 1, songs: [{ title, videoId: urlVid, thumbnail: thumb, url: `https://music.youtube.com/watch?v=${urlVid}`, artist, artistId: '', album: '', albumId: '', duration: m ? `${m[1]}.${m[2]}` : dur }], albums: [], playlists: [], artists: [] });
      }
    } catch {}
  }

  const tasks = [];
  if (type === 'all' || type === 'songs')     tasks.push(ytmSearch(query, 'songs').then(d => ({ t: 'songs', d })));
  if (type === 'all' || type === 'playlists') tasks.push(ytmSearch(query, 'playlists').then(d => ({ t: 'playlists', d })));
  if (type === 'all' || type === 'artists')   tasks.push(ytmSearch(query, 'artists').then(d => ({ t: 'artists', d })));
  const results = await Promise.all(tasks);

  const songs = [], albums = [], playlists = [], artists = [];

  for (const { t, d } of results) {
    const items = [];
    findAll(d, 'musicResponsiveListItemRenderer', items);
    findAll(d, 'musicTwoRowItemRenderer', items);

    if (t === 'playlists') {
      const seen = {};
      for (const item of items) {
        const bid = item?.navigationEndpoint?.browseEndpoint?.browseId || item?.title?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId || '';
        if (!bid || seen[bid]) continue;
        seen[bid] = true;
        const title = item.flexColumns ? getRunsText(item.flexColumns[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs) : getRunsText(item.title?.runs);
        const sub   = item.flexColumns ? getRunsText(item.flexColumns[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs) : getRunsText(item.subtitle?.runs);
        const thumbs = item.flexColumns ? (item.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails || []) : (item.thumbnailRenderer?.musicThumbnailRenderer?.thumbnail?.thumbnails || []);
        const thumb = toHDThumb(thumbs.at(-1)?.url);
        const m = sub.match(/^(Album|Single|EP)\s*[•]\s*(.+?)\s*[•]\s*(\d{4})/i);
        if (m) albums.push({ id: bid, title, artist: m[2].trim(), albumType: m[1], year: m[3], cover: thumb });
        else if (sub.toLowerCase().includes('playlist')) playlists.push({ id: bid, title, artist: sub, cover: thumb });
      }
    } else if (t === 'artists') {
      const seen = {};
      for (const item of items) {
        const bid = item?.navigationEndpoint?.browseEndpoint?.browseId || item?.title?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId || '';
        if (!bid || seen[bid]) continue;
        seen[bid] = true;
        const title = item.flexColumns ? getRunsText(item.flexColumns[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs) : getRunsText(item.title?.runs);
        const sub   = item.flexColumns ? getRunsText(item.flexColumns[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs) : getRunsText(item.subtitle?.runs);
        const thumbs = item.flexColumns ? (item.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails || []) : (item.thumbnailRenderer?.musicThumbnailRenderer?.thumbnail?.thumbnails || []);
        const thumb = toHDThumb(thumbs.at(-1)?.url);
        if (/artist|monthly|pendengar|audiens|subscriber/i.test(sub)) artists.push({ id: bid, title, artist: sub, cover: thumb });
      }
      const ql = query.toLowerCase().trim();
      artists.sort((a, b) => {
        const am = a.title.toLowerCase().trim() === ql, bm = b.title.toLowerCase().trim() === ql;
        if (am && !bm) return -1; if (bm && !am) return 1; return 0;
      });
    } else {
      for (const sec of (findAll(d, 'sectionListRenderer', []).flatMap(s => s.contents || []))) {
        for (const item of (sec?.musicShelfRenderer?.contents || sec?.itemSectionRenderer?.contents || [])) {
          const r = item?.musicResponsiveListItemRenderer;
          if (!r) continue;
          const cols = r.flexColumns || [];
          const title = getRunsText(cols[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs);
          const subRuns = cols[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [];
          if ((subRuns[0]?.text || '') === 'Video') continue;
          const videoId = r?.playlistItemData?.videoId || '';
          if (!videoId) continue;
          let artist = '', artistId = '', album = '', albumId = '', duration = '';
          for (const run of subRuns) {
            const bid = run?.navigationEndpoint?.browseEndpoint?.browseId || '';
            if (bid.startsWith('UC')) { artist = run.text; artistId = bid; }
            else if (bid.startsWith('MPRE')) { album = run.text; albumId = bid; }
          }
          const acc = cols[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.accessibility?.accessibilityData?.label || '';
          const dm = acc.match(/(\d+)\s*(?:menit|min)\s*(?:(\d+)\s*(?:detik|det))?/);
          if (dm) duration = `${dm[1]}.${(dm[2] || '00').padStart(2, '0')}`;
          const thumbs = r?.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails || [];
          songs.push({ title, videoId, thumbnail: toHDThumb(thumbs.at(-1)?.url, videoId), url: `https://music.youtube.com/watch?v=${videoId}`, artist: artist || subRuns[1]?.text || '', artistId, album, albumId, duration });
        }
      }
    }
  }

  ok({ query, totalSongs: songs.length, songs, albums, playlists, artists });
}

async function cmdAlbum(id) {
  let browseId = id;
  if (!browseId.startsWith('VL') && browseId.startsWith('PL')) browseId = 'VL' + browseId;
  const isPlaylist = browseId.startsWith('VL');
  const hostname = isPlaylist ? 'youtubei.googleapis.com' : 'music.youtube.com';
  const clientName = isPlaylist ? 'WEB' : 'WEB_REMIX';

  const data = await makeReq({
    hostname, path: '/youtubei/v1/browse?key=' + API_KEY, method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0 Chrome/131.0.0.0', 'Origin': 'https://music.youtube.com' },
  }, { context: { client: { clientName, clientVersion: isPlaylist ? '2.20240726.00.00' : '1.20240101.00.00', hl: 'en', gl: 'ID' } }, browseId });

  let title = 'Unknown', description = '', thumbnails = [];
  const songs = [];

  if (isPlaylist) {
    const sidebars = findAll(data, 'playlistSidebarPrimaryInfoRenderer');
    if (sidebars[0]) {
      title = sidebars[0].title?.runs?.[0]?.text || 'Unknown';
      description = getRunsText(sidebars[0].description?.runs || []);
      const th = sidebars[0].thumbnailRenderer?.playlistVideoThumbnailRenderer?.thumbnail?.thumbnails || [];
      thumbnails = th.length ? [{ url: th.at(-1).url.split('?')[0] }] : [];
    }
    for (const lock of findAll(data, 'lockupViewModel')) {
      const videoId = lock.contentId || '';
      if (!videoId || songs.find(s => s.videoId === videoId)) continue;
      const songTitle = lock.metadata?.lockupMetadataViewModel?.title?.content || 'Unknown';
      const rows = lock.metadata?.lockupMetadataViewModel?.metadata?.contentMetadataViewModel?.metadataRows || [];
      const artist = rows[0]?.metadataParts?.[0]?.text?.content || '';
      const sources = lock.contentImage?.thumbnailViewModel?.image?.sources || [];
      songs.push({ videoId, title: songTitle, artist: artist || 'Unknown', artistId: '', duration: '', thumbnails: txThumbs(sources.map(s => ({ url: s.url })), videoId) });
    }
  } else {
    title = data?.microformat?.microformatDataRenderer?.title || 'Unknown Album';
    description = data?.microformat?.microformatDataRenderer?.description || '';
    thumbnails = txThumbs(data?.microformat?.microformatDataRenderer?.thumbnail?.thumbnails || []);
    const h = data?.header?.musicDetailHeaderRenderer || {};
    const items = data?.contents?.twoColumnBrowseResultsRenderer?.secondaryContents?.sectionListRenderer?.contents?.[0]?.musicPlaylistShelfRenderer?.contents
               || data?.contents?.singleColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents?.[0]?.musicPlaylistShelfRenderer?.contents || [];
    let albumArtist = getRunsText(h.subtitle?.runs || []).split(' • ').find(x => !['Album','Single','EP','Playlist'].includes(x.trim()) && !/^\d{4}$/.test(x.trim())) || '';
    for (const item of items) {
      const i = item.musicResponsiveListItemRenderer;
      if (!i) continue;
      const videoId = i.playlistItemData?.videoId || '';
      if (!videoId) continue;
      const songTitle = getRunsText(i.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs);
      const artRuns = i.flexColumns?.[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [];
      const artist = getRunsText(artRuns) || albumArtist || 'Unknown Artist';
      const artistId = artRuns[0]?.navigationEndpoint?.browseEndpoint?.browseId || '';
      const duration = getRunsText(i.fixedColumns?.[0]?.musicResponsiveListItemFixedColumnRenderer?.text?.runs);
      songs.push({ videoId, title: songTitle, artist, artistId, duration, thumbnails: txThumbs(i.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails || [], videoId) });
    }
    if (!thumbnails.length && songs.length) thumbnails = songs[0].thumbnails || [];
  }

  ok({ id, title, description, thumbnails, songs });
}

async function cmdArtist(artistId) {
  const data = await makeReq({
    hostname: 'music.youtube.com', path: '/youtubei/v1/browse?key=' + API_KEY, method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0 Chrome/120.0.0.0', 'Origin': 'https://music.youtube.com' }, timeout: 15000,
  }, { context: { client: { clientName: 'WEB_REMIX', clientVersion: '1.20240101.00.00', hl: 'en', gl: 'ID' } }, browseId: artistId });

  const h = data?.header?.musicImmersiveHeaderRenderer || data?.header?.musicVisualHeaderRenderer || {};
  const name = getRunsText(h.title?.runs || []);
  const thumbnails = txThumbs(h.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails || []);
  const topSongs = [], topAlbums = [], topSingles = [], topVideos = [], featuredOn = [], playlists = [], similarArtists = [];

  for (const tab of (data?.contents?.singleColumnBrowseResultsRenderer?.tabs || [])) {
    for (const sec of (tab?.tabRenderer?.content?.sectionListRenderer?.contents || [])) {
      if (sec.musicShelfRenderer) {
        for (const item of sec.musicShelfRenderer.contents || []) {
          const i = item.musicResponsiveListItemRenderer;
          if (!i) continue;
          const videoId = i.playlistItemData?.videoId || '';
          topSongs.push({ videoId, title: getRunsText(i.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs), artist: getRunsText(i.flexColumns?.[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs), thumbnails: txThumbs(i.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails || [], videoId) });
        }
      }
      if (sec.musicCarouselShelfRenderer) {
        const car = sec.musicCarouselShelfRenderer;
        const ht = getRunsText(car.header?.musicCarouselShelfBasicHeaderRenderer?.title?.runs || []);
        for (const item of car.contents || []) {
          const it = item.musicTwoRowItemRenderer;
          if (!it) continue;
          const vId = it.navigationEndpoint?.watchEndpoint?.videoId || '';
          const parsed = { name: getRunsText(it.title?.runs || []), artist: getRunsText(it.subtitle?.runs || []), browseId: it.navigationEndpoint?.browseEndpoint?.browseId || it.title?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId || '', thumbnails: txThumbs(it.thumbnailRenderer?.musicThumbnailRenderer?.thumbnail?.thumbnails || [], vId) };
          if (/album/i.test(ht))         topAlbums.push(parsed);
          else if (/singles|ep/i.test(ht)) topSingles.push(parsed);
          else if (/video/i.test(ht))    { parsed.videoId = vId; topVideos.push(parsed); }
          else if (/playlist/i.test(ht)) playlists.push(parsed);
          else if (/featured/i.test(ht)) featuredOn.push(parsed);
          else if (/similar|fans/i.test(ht)) similarArtists.push(parsed);
        }
      }
    }
  }

  ok({ artistId, name, thumbnails, topSongs, topAlbums, topSingles, topVideos, playlists, featuredOn, similarArtists });
}

const _transCache = new Map();

async function translateText(text, tl = 'id') {
  if (!text?.trim() || text.trim() === '• • •') return '';
  const key = text.trim() + '_' + tl;
  if (_transCache.has(key)) return _transCache.get(key);
  const srcLang = /[\u3040-\u30ff\u4e00-\u9fff]/.test(text) ? 'ja' : /[\uac00-\ud7af]/.test(text) ? 'ko' : /[\u0600-\u06ff]/.test(text) ? 'ar' : 'en';

  try {
    const d = await httpGetJson(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${tl}&dt=t&q=${encodeURIComponent(text.trim())}`, 3000);
    if (d?.[0]) { const t = d[0].map(x => x[0]).filter(Boolean).join('').trim(); if (t) { _transCache.set(key, t); return t; } }
  } catch {}
  
  try {
    const d = await httpGetJson(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text.trim())}&langpair=${srcLang}|${tl}`, 3500);
    const t = d?.responseData?.translatedText?.trim() || '';
    if (t && !t.includes('MYMEMORY WARNING') && t.toLowerCase() !== text.trim().toLowerCase()) { _transCache.set(key, t); return t; }
  } catch {}
  return '';
}

async function translateLines(lines, tl = 'id') {
  if (!lines?.length) return lines;
  const texts = lines.map(l => typeof l === 'string' ? l : l.text || '');
  
  try {
    const joined = texts.join('\n');
    const d = await httpGetJson(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${tl}&dt=t&q=${encodeURIComponent(joined)}`, 5000);
    if (d?.[0]) {
      const full = d[0].map(x => x[0]).filter(Boolean).join('');
      const split = full.split('\n');
      if (split.length === lines.length) {
        return lines.map((l, i) => {
          const orig = texts[i]; const tr = split[i]?.trim() || '';
          return typeof l === 'string' ? { text: l, translation: tr.toLowerCase() === orig.toLowerCase() ? '' : tr } : { ...l, translation: tr.toLowerCase() === orig.toLowerCase() ? '' : tr };
        });
      }
    }
  } catch {}

  const BATCH = 6;
  const result = [];
  for (let i = 0; i < lines.length; i += BATCH) {
    const chunk = await Promise.all(lines.slice(i, i + BATCH).map(async l => {
      const orig = typeof l === 'string' ? l : l.text || '';
      const tr = await translateText(orig, tl);
      return typeof l === 'string' ? { text: l, translation: tr } : { ...l, translation: tr };
    }));
    result.push(...chunk);
  }
  return result;
}

function parseSynced(s) {
  if (!s) return [];
  const lines = [], p = /\[(\d{2,}):(\d{2})(?:\.(\d{2,3}))?\]\s*(.*)/;
  for (const l of s.split('\n')) {
    const m = l.trim().match(p);
    if (m) { let ms = m[3] ? (m[3].length === 3 ? +m[3]/1000 : +m[3]/100) : 0; lines.push({ time: Math.round((+m[1]*60 + +m[2] + ms)*100)/100, text: m[4].trim() || '• • •' }); }
  }
  return lines;
}

function parsePlain(p) { return (p || '').split('\n').map(t => t.trim()).filter(Boolean).map(t => ({ time: -1, text: t })); }

function cleanTitle(t = '') {
  return t.replace(/(official|lyric|video|audio|mv|visualizer|music video)/gi, '').replace(/f(ea)?t\..*/gi, '').replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim();
}

async function getLyrics(videoId, qTitle = '', qArtist = '') {
  let title = qTitle.trim(), artist = qArtist.trim(), album = '';
  if (!title || !artist) {
    try {
      const o = await makeReq({ hostname: 'www.youtube.com', path: `/oembed?url=https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}&format=json`, method: 'GET', headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 3000 }, null);
      if (!title) title = o?.title || '';
      if (!artist) artist = o?.author_name || '';
    } catch {}
  }
  if (!title || !artist) {
    try {
      const ytd = await makeReq({ hostname: 'music.youtube.com', path: '/youtubei/v1/next?key=' + API_KEY, method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0 Chrome/120.0.0.0', 'Origin': 'https://music.youtube.com' }, timeout: 4000 }, { context: { client: { clientName: 'WEB_REMIX', clientVersion: '1.20240101.00.00', hl: 'en', gl: 'ID' } }, videoId });
      const c = ytd?.contents?.singleColumnMusicWatchNextResultsRenderer?.tabbedRenderer?.watchNextTabbedResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.musicQueueRenderer?.content?.playlistPanelRenderer?.contents?.[0]?.playlistPanelVideoRenderer || {};
      if (!title) title = getRunsText(c.title?.runs || []);
      if (!artist) artist = getRunsText(c.shortBylineText?.runs || c.longBylineText?.runs || []);
      if (!album) album = getRunsText(c.longBylineText?.runs || []);
    } catch {}
  }

  let cTitle = cleanTitle(title);
  let cArtist = artist.replace(/- Topic/gi, '').replace(/\s+/g, ' ').trim();
  if (cTitle.includes(' - ')) { const p = cTitle.split(' - '); cArtist = cArtist || p[0].trim(); cTitle = p.slice(1).join(' - ').trim(); }

  let lyricsData = { type: 'none', lines: [] };
  for (const q of [cTitle && cArtist ? `${cTitle} ${cArtist}` : null, cTitle, cleanTitle(title)].filter(Boolean)) {
    if (lyricsData.lines.length) break;
    try {
      const lrc = await makeReq({ hostname: 'lrclib.net', path: '/api/search?q=' + encodeURIComponent(q), method: 'GET', headers: { 'User-Agent': 'Mozilla/5.0 Chrome/120.0.0.0' }, timeout: 5000 }, null);
      if (Array.isArray(lrc) && lrc.length) {
        const b = lrc.find(x => x.syncedLyrics) || lrc.find(x => x.plainLyrics) || lrc[0];
        if (b.syncedLyrics) lyricsData = { type: 'synced', lines: parseSynced(b.syncedLyrics) };
        else if (b.plainLyrics) lyricsData = { type: 'plain', lines: parsePlain(b.plainLyrics) };
      }
    } catch {}
  }

  if (lyricsData.lines.length) {
    const race = await Promise.race([translateLines(lyricsData.lines), new Promise(r => setTimeout(() => r(lyricsData.lines), 3500))]);
    lyricsData.lines = race;
  }

  return { videoId, title, artist, album, lyrics: lyricsData };
}

const ytPlayCache = new Map();
const CACHE_TTL = 90 * 60 * 1000;
const CDNS = ['cdn405.savetube.vip', 'cdn403.savetube.vip', 'cdn401.savetube.vip'];

async function ytGetAudio(urlOrId) {
  const vid = String(urlOrId).match(/(?:v=|youtu\.be\/|shorts\/)([a-zA-Z0-9_-]{11})/)?.[1] || (urlOrId.length === 11 ? urlOrId : null);
  if (!vid) throw new Error('URL/ID YouTube tidak valid');
  const cached = ytPlayCache.get(vid);
  if (cached && cached.expireAt > Date.now()) return cached.data;
  const fullUrl = `https://www.youtube.com/watch?v=${vid}`;
  const ctrl = new AbortController();
  const result = await Promise.any(CDNS.map(async cdn => {
    const api = axios.create({ headers: { 'content-type': 'application/json', 'origin': 'https://yt.savetube.me', 'user-agent': 'Mozilla/5.0' }, timeout: 9000, signal: ctrl.signal });
    const info = await api.post(`https://${cdn}/v2/info`, { url: fullUrl });
    const enc = info?.data?.data;
    if (!enc) throw new Error('no data');
    const encrypted = Buffer.from(enc, 'base64');
    const dec = crypto.createDecipheriv('aes-128-cbc', Buffer.from('C5D58EF67A7584E4A29F6C35BBC4EB12', 'hex'), encrypted.slice(0, 16));
    const parsed = JSON.parse(Buffer.concat([dec.update(encrypted.slice(16)), dec.final()]).toString());
    const dl = await api.post(`https://${cdn}/download`, { id: vid, downloadType: 'audio', quality: '128', key: parsed.key });
    const audioUrl = dl.data?.data?.downloadUrl || dl.data?.downloadUrl;
    if (!audioUrl) throw new Error('no audio url');
    return { vid, duration: `${Math.floor(parsed.duration / 60)}:${(parsed.duration % 60).toString().padStart(2, '0')}`, audio: audioUrl, title: parsed.title || '' };
  }));
  ctrl.abort();
  ytPlayCache.set(vid, { data: result, expireAt: Date.now() + CACHE_TTL });
  return result;
}

function parseSubtitles(raw) {
  if (!raw) return [];
  const lines = [];
  if (raw.includes('<text')) {
    const re = /<text\s+start="([^"]+)"(?:\s+dur="([^"]+)")?[^>]*>([\s\S]*?)<\/text>/gi;
    let m;
    while ((m = re.exec(raw)) !== null) {
      const s = parseFloat(m[1]) || 0;
      const t = m[3].replace(/&amp;/g,'&').replace(/&#39;/g,"'").replace(/&quot;/g,'"').replace(/<[^>]+>/g,'').replace(/\n/g,' ').trim();
      if (t) lines.push({ time: Math.round(s*100)/100, start: `${s.toFixed(2)}s`, text: t });
    }
    if (lines.length) return lines;
  }
  const rows = raw.replace(/&amp;/g,'&').replace(/&#39;/g,"'").replace(/&quot;/g,'"').split('\n');
  for (let i = 0; i < rows.length; i++) {
    const m = rows[i].trim().match(/(\d+:\d+(?::\d+)?[.,]\d+)\s*-->\s*(\d+:\d+(?::\d+)?[.,]\d+)/);
    if (m) {
      const ts = (s) => { const c = s.replace(',','.').split(':'); return c.length===3 ? +c[0]*3600 + +c[1]*60 + +c[2] : +c[0]*60 + +c[1]; };
      const text = (rows[i+1]||'').replace(/<[^>]+>/g,'').trim();
      if (text && !/^\d+$/.test(text) && !text.includes('-->')) lines.push({ time: Math.round(ts(m[1])*100)/100, start: `${ts(m[1]).toFixed(2)}s`, end: `${ts(m[2]).toFixed(2)}s`, text });
    }
  }
  return lines;
}

function formatAAIWords(words) {
  if (!words?.length) return [];
  const lines = []; let cur = [], ls = words[0].start;
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (!cur.length) ls = w.start;
    cur.push(w.text);
    const last = i === words.length - 1;
    const pause = last ? 0 : (words[i+1].start - w.end);
    if (last || cur.length >= 7 || pause > 800 || /[.?!,]$/.test(w.text)) {
      const ss = ls / 1000, es = w.end / 1000;
      lines.push({ time: Math.round(ss*100)/100, start: `${ss.toFixed(2)}s`, end: `${es.toFixed(2)}s`, text: cur.join(' '), confidence: w.confidence });
      cur = [];
    }
  }
  return lines;
}

async function transcribe(urlOrId) {
  const vid = String(urlOrId).match(/(?:v=|youtu\.be\/|shorts\/)([a-zA-Z0-9_-]{11})/)?.[1] || (urlOrId.length === 11 ? urlOrId : null);
  if (!vid) throw new Error('URL YouTube tidak valid');
  let title = '';
  try { const r = await axios.get(`https://www.youtube.com/oembed?url=https://youtube.com/watch?v=${vid}&format=json`, { timeout: 8000 }); title = r.data.title || ''; } catch {}
  
  try {
    const { data } = await axios.get(`https://www.youtube.com/watch?v=${vid}`, { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'id-ID,en-US;q=0.9' }, timeout: 10000 });
    const cm = data.match(/"captionTracks"\s*:\s*(\[[^\]]*\])/);
    if (cm) {
      const caps = JSON.parse(cm[1]);
      const cap = caps.find(c => c.languageCode === 'en' || c.languageCode === 'id') || caps[0];
      if (cap?.baseUrl) {
        const sr = await axios.get(cap.baseUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 10000 });
        const synced = parseSubtitles(sr.data);
        if (synced.length) return { title, videoId: vid, method: 'subtitle', language: cap.languageCode || 'en', text: synced.map(s => s.text).join(' '), synced };
      }
    }
  } catch {}
  
  const audio = await ytGetAudio(vid);
  if (!audio?.audio) throw new Error('Gagal mendapatkan audio');
  const aRes = await axios.get(audio.audio, { responseType: 'arraybuffer', timeout: 30000 });
  const mp3 = path.join(os.tmpdir(), `${vid}_${Date.now()}.mp3`);
  fs.writeFileSync(mp3, Buffer.from(aRes.data));
  try {
    const up = await axios.post('https://api.assemblyai.com/v2/upload', fs.createReadStream(mp3), { headers: { 'Authorization': ASSEMBLYAI_KEY }, maxBodyLength: Infinity, timeout: 60000 });
    if (fs.existsSync(mp3)) fs.unlinkSync(mp3);
    const tr = await axios.post('https://api.assemblyai.com/v2/transcript', { audio_url: up.data.upload_url, speaker_labels: true }, { headers: { 'Authorization': ASSEMBLYAI_KEY, 'Content-Type': 'application/json' }, timeout: 15000 });
    let result;
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const poll = await axios.get(`https://api.assemblyai.com/v2/transcript/${tr.data.id}`, { headers: { 'Authorization': ASSEMBLYAI_KEY }, timeout: 10000 });
      if (poll.data.status === 'completed') { result = poll.data; break; }
      if (poll.data.status === 'error') throw new Error(poll.data.error || 'AssemblyAI Error');
    }
    if (!result) throw new Error('Timeout AssemblyAI');
    const synced = formatAAIWords(result.words || []);
    return { title: title || audio.title || '', videoId: vid, method: 'savetube+assemblyai', language: result.language_code, duration: result.audio_duration, text: result.text, synced };
  } catch (e) {
    if (fs.existsSync(mp3)) fs.unlinkSync(mp3);
    throw e;
  }
}

async function cmdSuggest(q) {
  const raw = await new Promise((res, rej) => {
    https.get({ hostname: 'suggestqueries.google.com', path: '/complete/search?client=youtube&ds=yt&q=' + encodeURIComponent(q), headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 15000 }, r => {
      let d = ''; r.on('data', c => d += c); r.on('end', () => res(d));
    }).on('error', rej);
  });
  const json = JSON.parse(raw.replace(/^window\.google\.ac\.h\(/, '').replace(/\)$/, ''));
  const suggestions = (Array.isArray(json) && Array.isArray(json[1])) ? json[1].filter(i => Array.isArray(i) && i[0]).map(i => i[0]) : [];
  ok({ query: q, suggestions });
}

const usage = () => {
  console.log(`Creator : ${CREATOR}
Saluran : ${SALURAN}

Usage:
  node musicaly.js search <query> [all|songs|playlists|artists]
  node musicaly.js album <browseId>
  node musicaly.js artist <browseId>
  node musicaly.js lyrics <videoId> [title] [artist]
  node musicaly.js ytplay <videoId | url>
  node musicaly.js suggest <query>
  node musicaly.js transcribe <videoId | url>
  node musicaly.js translate <text> [targetLang=id]`);
  process.exit(0);
};

(async () => {
  const [cmd, a, b, c] = process.argv.slice(2);
  try {
    switch (cmd) {
      case 'search':
        if (!a) return err('Query wajib diisi');
        return await cmdSearch(a, b || 'all');

      case 'album':
        if (!a) return err('browseId wajib diisi');
        return await cmdAlbum(a);

      case 'artist':
        if (!a) return err('browseId wajib diisi');
        return await cmdArtist(a);

      case 'lyrics': {
        if (!a) return err('videoId wajib diisi');
        const result = await getLyrics(a, b || '', c || '');
        return ok(result);
      }

      case 'ytplay': {
        if (!a) return err('videoId atau URL wajib diisi');
        const res = await ytGetAudio(a);
        return ok({ videoId: res.vid, title: res.title, duration: res.duration, audio: res.audio });
      }

      case 'suggest':
        if (!a) return err('Query wajib diisi');
        return await cmdSuggest(a);

      case 'transcribe': {
        if (!a) return err('videoId atau URL wajib diisi');
        const res = await transcribe(a);
        return ok(res);
      }

      case 'translate': {
        if (!a) return err('Text wajib diisi');
        const tl = b || 'id';
        const translated = await translateText(a, tl);
        return ok({ original: a, translated, targetLang: tl });
      }

      default:
        return usage();
    }
  } catch (e) {
    err(e.message);
  }
})();
