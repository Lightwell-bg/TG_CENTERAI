const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');

const app = express();
const PORT = process.env.PORT || 3000;
const PARSER_TOKEN = (process.env.PARSER_TOKEN || '').trim();
const VERSION = 'parser-v12.4-stable';

// Optional shared-secret guard. If PARSER_TOKEN env var is set, every request to /posts
// must pass the same value either via the X-Parser-Token header or ?token= query param.
// /health is intentionally always open so Render's health-check probe keeps working.
function requireToken(req, res, next) {
  if (!PARSER_TOKEN) return next();
  const header = req.get('X-Parser-Token') || '';
  const query = String(req.query.token || '');
  if (header === PARSER_TOKEN || query === PARSER_TOKEN) return next();
  return res.status(401).json({ error: 'Unauthorized: invalid or missing parser token' });
}

// ---------------------------------------------------------------------------
// Rich-text extractor — walks cheerio DOM of .tgme_widget_message_text and
// returns plain text (with links inlined), HTML (with <a>/<b>/<i>/<code>),
// and a deduplicated links array.  No heavy deps, no external packages.
// ---------------------------------------------------------------------------
function parseRichText(textEl) {
  if (!textEl || !textEl.length) {
    return { text: '', text_plain: '', text_html: '', links: [] };
  }

  const links = [];
  const seenUrls = new Set();

  const norm = (raw) => {
    const v = String(raw || '').trim();
    if (!v) return '';
    if (v.startsWith('//')) return 'https:' + v;
    if (v.startsWith('/')) return 'https://telegram.me' + v;
    return v;
  };

  const classify = (url) =>
    /t\.me|telegram\.me/i.test(url) ? 'telegram' : 'external';

  const esc = (s) =>
    String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  function walkNode(node) {
    if (node.type === 'text') {
      const t = node.data || '';
      return { text: t, html: esc(t) };
    }
    if (node.type !== 'tag') return { text: '', html: '' };

    const tag = (node.name || '').toLowerCase();
    if (tag === 'br') return { text: '\n', html: '\n' };

    const inner = walkChildren(node.children || []);

    if (tag === 'a') {
      const href = norm((node.attribs && node.attribs.href) || '');
      const linkText = inner.text.trim();
      if (href) {
        if (!seenUrls.has(href)) {
          seenUrls.add(href);
          links.push({ text: linkText, url: href, type: classify(href) });
        }
        // Inline format: "Label (url)" or bare "url" when label == url or empty
        const plain =
          linkText && linkText !== href
            ? `${linkText} (${href})`
            : href;
        const htmlInner = inner.html || esc(href);
        return { text: plain, html: `<a href="${href}">${htmlInner}</a>` };
      }
      return { text: inner.text, html: inner.html };
    }

    if (tag === 'b' || tag === 'strong')
      return { text: inner.text, html: `<b>${inner.html}</b>` };
    if (tag === 'i' || tag === 'em')
      return { text: inner.text, html: `<i>${inner.html}</i>` };
    if (tag === 'code')
      return { text: inner.text, html: `<code>${inner.html}</code>` };
    if (tag === 'pre')
      return { text: inner.text, html: `<pre><code>${inner.html}</code></pre>` };
    if (tag === 'p' || tag === 'blockquote')
      return { text: inner.text + '\n\n', html: inner.html + '\n\n' };

    return { text: inner.text, html: inner.html };
  }

  function walkChildren(children) {
    let text = '', html = '';
    for (const child of children) {
      const r = walkNode(child);
      text += r.text;
      html += r.html;
    }
    return { text, html };
  }

  const domNode = textEl[0];
  const { text: rawText, html: rawHtml } = walkChildren(domNode.children || []);

  const clean = (s) => s.replace(/\n{3,}/g, '\n\n').trim();

  return {
    text: clean(rawText),
    text_plain: clean(rawText),
    text_html: clean(rawHtml),
    links,
  };
}

// ---------------------------------------------------------------------------

app.get('/health', (_req, res) => {
  res.json({ ok: true, version: VERSION, tokenProtected: Boolean(PARSER_TOKEN) });
});

app.get('/posts', requireToken, async (req, res) => {
  try {
    const rawChannel = String(req.query.channel || '').trim();
    const limit = Math.min(Math.max(parseInt(req.query.limit || '20', 10), 1), 100);
    const before = String(req.query.before || '').trim();

    if (!rawChannel) {
      return res.status(400).json({ error: 'Query param "channel" is required' });
    }

    const channel = rawChannel
      .replace(/^https?:\/\/(?:telegram\.me|t\.me)\//i, '')
      .replace(/^@/, '')
      .replace(/^s\//, '')
      .split('/')[0]
      .trim();

    if (!channel) {
      return res.status(400).json({ error: 'Invalid channel value' });
    }

    const url = `https://telegram.me/s/${encodeURIComponent(channel)}${
      before ? `?before=${encodeURIComponent(before)}` : ''
    }`;

    const response = await axios.get(url, {
      timeout: 20000,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9,ru;q=0.8',
      },
    });

    const $ = cheerio.load(response.data);
    const posts = [];

    const normalizeUrl = (raw) => {
      const value = String(raw || '').trim();
      if (!value) return '';
      if (value.startsWith('//')) return `https:${value}`;
      if (value.startsWith('/')) return `https://telegram.me${value}`;
      return value;
    };

    const isDirectVideoUrl = (value) => {
      const v = String(value || '').toLowerCase();
      return /(\.mp4($|\?)|\/file\/|cdn\d*\.telesco\.pe\/file\/)/i.test(v);
    };

    const embedHeaders = {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9,ru;q=0.8',
    };

    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const getEmbedWithRetry = async (embedUrl) => {
      let lastErr;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          return await axios.get(embedUrl, { timeout: 20000, headers: embedHeaders });
        } catch (e) {
          lastErr = e;
          await sleep(1500 * (attempt + 1));
        }
      }
      throw lastErr;
    };

    /**
     * Fetch the first direct video URL from embed page (for single-video posts).
     * Returns '' when nothing is found.
     */
    const fetchVideoFromEmbed = async (channelName, postId, postUrlToSkip) => {
      if (!channelName || !postId) return '';

      try {
        const embedUrl = `https://telegram.me/${encodeURIComponent(channelName)}/${encodeURIComponent(
          postId
        )}?embed=1`;
        const embedResp = await getEmbedWithRetry(embedUrl);

        const $$ = cheerio.load(embedResp.data);
        // Collect meta-level candidates first (single URL from OG tags)
        const metaCandidates = [
          normalizeUrl($$('meta[property="og:video"]').attr('content') || ''),
          normalizeUrl($$('meta[name="twitter:player:stream"]').attr('content') || ''),
        ].filter(Boolean).filter((v) => v !== normalizeUrl(postUrlToSkip));

        // Then inline <video> / <source> / <a> elements (may be multiple in an album embed)
        const inlineCandidates = [];
        $$('video source[src], video[src]').each((_, v) => {
          const src = normalizeUrl($$(v).attr('src') || '');
          if (src) inlineCandidates.push(src);
        });
        $$('a[href*=".mp4"], a[href*="/file/"]').each((_, a) => {
          const href = normalizeUrl($$(a).attr('href') || '');
          if (href) inlineCandidates.push(href);
        });

        const allCandidates = [...metaCandidates, ...inlineCandidates]
          .filter(Boolean)
          .filter((v) => v !== normalizeUrl(postUrlToSkip));

        return allCandidates.find((v) => isDirectVideoUrl(v)) || '';
      } catch (_e) {
        return '';
      }
    };

    /**
     * Fetch ALL direct video URLs from embed page (for album/grouped-media posts).
     * Returns array (may be empty).
     */
    const fetchAllVideosFromEmbed = async (channelName, postId, postUrlToSkip) => {
      if (!channelName || !postId) return [];

      try {
        const embedUrl = `https://telegram.me/${encodeURIComponent(channelName)}/${encodeURIComponent(
          postId
        )}?embed=1`;
        const embedResp = await getEmbedWithRetry(embedUrl);

        const $$ = cheerio.load(embedResp.data);
        const seen = new Set();
        const results = [];

        const add = (url) => {
          const v = normalizeUrl(url || '');
          if (!v) return;
          if (v === normalizeUrl(postUrlToSkip)) return;
          if (seen.has(v)) return;
          if (!isDirectVideoUrl(v)) return;
          seen.add(v);
          results.push(v);
        };

        // Meta tags (usually single video reference)
        add($$('meta[property="og:video"]').attr('content') || '');
        add($$('meta[name="twitter:player:stream"]').attr('content') || '');

        // All inline video/source/a elements — album embeds contain one per video
        $$('video source[src]').each((_, el) => add($$(el).attr('src') || ''));
        $$('video[src]').each((_, el) => add($$(el).attr('src') || ''));
        $$('a[href*=".mp4"]').each((_, el) => add($$(el).attr('href') || ''));
        $$('a[href*="/file/"]').each((_, el) => add($$(el).attr('href') || ''));

        return results;
      } catch (_e) {
        return [];
      }
    };

    /** Preview image for video posts (og:image on embed) — usable as sendPhoto when MP4 URL fails for bots. */
    const fetchVideoThumbFromEmbed = async (channelName, postId) => {
      if (!channelName || !postId) return '';
      try {
        const embedUrl = `https://telegram.me/${encodeURIComponent(channelName)}/${encodeURIComponent(
          postId
        )}?embed=1`;
        const embedResp = await getEmbedWithRetry(embedUrl);
        const $$ = cheerio.load(embedResp.data);
        const og = normalizeUrl($$('meta[property="og:image"]').attr('content') || '');
        return og || '';
      } catch (_e) {
        return '';
      }
    };

    // ---------------------------------------------------------------------------
    // Pass 1: collect raw data from each .tgme_widget_message_wrap element.
    // Album posts (grouped media) produce MULTIPLE wraps with the same post id.
    // We collect all of them first, then merge by id in Pass 2.
    // ---------------------------------------------------------------------------
    const rawItems = [];

    $('.tgme_widget_message_wrap').each((_, el) => {
      const msg = $(el).find('.tgme_widget_message');
      const dataPost = msg.attr('data-post') || '';
      if (!dataPost.includes('/')) return;

      const postUrl = `https://telegram.me/${dataPost}`;

      const idFromDataPost = (dataPost.match(/\/(\d+)(?:\?|$)/) || [])[1];
      const idFromUrl = (postUrl.match(/\/(\d+)(?:\?|$)/) || [])[1];
      const id = Number(idFromDataPost || idFromUrl || 0) || null;

      // Text — may be empty for non-last elements of an album
      const rich = parseRichText($(el).find('.tgme_widget_message_text').first());

      const viewsRaw = $(el).find('.tgme_widget_message_views').first().text().trim();
      const views = Number((viewsRaw || '0').replace(/[^\d]/g, '')) || 0;

      const datetime =
        $(el).find('.tgme_widget_message_date time').attr('datetime') ||
        $(el).find('time[datetime]').first().attr('datetime') ||
        '';
      const date = datetime || null;
      const dateTs = Date.parse(datetime || '') || 0;

      // Photo — from photo wrap style or video thumbnail style
      let photoUrl = '';
      const photoWrap = $(el).find('.tgme_widget_message_photo_wrap').first();
      const style = photoWrap.attr('style') || '';
      const photoMatch = style.match(/url\('([^']+)'\)/);
      if (photoMatch && photoMatch[1]) photoUrl = photoMatch[1];
      if (!photoUrl) {
        const thumbStyle = $(el).find('.tgme_widget_message_video_thumb').first().attr('style') || '';
        const thumbMatch = thumbStyle.match(/url\('([^']+)'\)/);
        if (thumbMatch && thumbMatch[1]) photoUrl = thumbMatch[1];
      }

      // Video candidates from inline HTML of this wrap element
      const sourceSrc = normalizeUrl($(el).find('video source').attr('src') || '');
      const inlineVideoSrc = normalizeUrl($(el).find('video').attr('src') || '');
      const playerHref = normalizeUrl(
        $(el).find('.tgme_widget_message_video_player').attr('href') || ''
      );
      const wrapHref = normalizeUrl(
        $(el).find('.tgme_widget_message_video_wrap a').attr('href') || ''
      );
      const anyMp4Href = normalizeUrl($(el).find('a[href*=".mp4"]').first().attr('href') || '');
      const anyFileHref = normalizeUrl($(el).find('a[href*="/file/"]').first().attr('href') || '');

      const videoCandidates = [
        sourceSrc,
        inlineVideoSrc,
        playerHref,
        wrapHref,
        anyMp4Href,
        anyFileHref,
      ]
        .filter(Boolean)
        .filter((v) => normalizeUrl(v) !== normalizeUrl(postUrl));

      const videoUrl = videoCandidates.find((v) => isDirectVideoUrl(v)) || '';

      const hasVideoHint =
        $(el).find('video').length > 0 ||
        $(el).find('.tgme_widget_message_video_wrap').length > 0 ||
        $(el).find('.tgme_widget_message_video_player').length > 0;

      rawItems.push({
        id,
        postUrl,
        rich,
        views,
        date,
        dateTs,
        photoUrl,
        videoUrl,
        hasVideoHint,
      });
    });

    // ---------------------------------------------------------------------------
    // Pass 2: merge album elements that share the same post id.
    // For each unique id we build one merged post:
    //   - text / links: take from whichever element has non-empty text
    //   - views / date: take from first element that has them
    //   - photo_url: first non-empty photo found across all elements
    //   - video_urls: all distinct direct video URLs across all elements (album support)
    //   - has_video_hint: OR across all elements
    // Order of rawItems is DOM order (top → bottom), which matches Telegram's layout.
    // ---------------------------------------------------------------------------
    const mergedMap = new Map(); // id → merged post object

    for (const item of rawItems) {
      const key = item.id;

      if (!mergedMap.has(key)) {
        mergedMap.set(key, {
          id: item.id,
          postUrl: item.postUrl,
          rich: item.rich.text ? item.rich : null, // will be filled on first non-empty text
          views: item.views,
          date: item.date,
          dateTs: item.dateTs,
          photoUrl: item.photoUrl,
          videoUrls: item.videoUrl ? [item.videoUrl] : [],
          hasVideoHint: item.hasVideoHint,
          albumSize: 1,
        });
      } else {
        const merged = mergedMap.get(key);
        merged.albumSize += 1;

        // Take the text/links from whichever element has content (last non-empty wins,
        // but typically it's the LAST element in an album that carries the caption).
        if (item.rich.text) merged.rich = item.rich;

        // Take views from the element that has them (usually the last/main one)
        if (item.views > 0 && merged.views === 0) merged.views = item.views;

        // Take date from first non-null
        if (!merged.date && item.date) {
          merged.date = item.date;
          merged.dateTs = item.dateTs;
        }

        // First non-empty photo
        if (!merged.photoUrl && item.photoUrl) merged.photoUrl = item.photoUrl;

        // Collect all distinct video URLs across album elements
        if (item.videoUrl && !merged.videoUrls.includes(item.videoUrl)) {
          merged.videoUrls.push(item.videoUrl);
        }

        // has_video_hint: OR across all elements
        if (item.hasVideoHint) merged.hasVideoHint = true;
      }
    }

    for (const merged of mergedMap.values()) {
      const rich = merged.rich || { text: '', text_plain: '', text_html: '', links: [] };
      const isAlbum = merged.albumSize > 1;

      posts.push({
        id: merged.id,
        text: rich.text,
        text_plain: rich.text_plain,
        text_html: rich.text_html,
        links: rich.links,
        views: merged.views,
        date: merged.date,
        dateTs: merged.dateTs,
        author: channel,
        photo_url: merged.photoUrl || '',
        // video_url: first video for backwards compatibility with existing n8n nodes
        video_url: merged.videoUrls[0] || '',
        // video_urls: full list for album posts (may contain 1+ items)
        video_urls: merged.videoUrls,
        post_url: merged.postUrl,
        has_video_hint: merged.hasVideoHint,
        is_album: isAlbum,
        album_size: merged.albumSize,
      });
    }

    const sorted = posts.sort((a, b) => {
      if ((b.id || 0) !== (a.id || 0)) return (b.id || 0) - (a.id || 0);
      return (b.dateTs || 0) - (a.dateTs || 0);
    });

    const latest = sorted.slice(0, limit);

    // ---------------------------------------------------------------------------
    // Enrich: fetch video URLs and text via embed page when not found in HTML.
    //
    // WHY we need this:
    // telegram.me/s/<channel> renders album/grouped-media posts as empty HTML —
    // the videos are loaded by JS player, <video> tags are absent, and sometimes
    // even has_video_hint is false. The embed URL (?embed=1) is the only reliable
    // source for these posts.
    //
    // Strategy:
    // 1. Any post that has no text AND no media → probe embed unconditionally.
    //    This catches "completely empty" album posts that the /s/ page hides.
    // 2. Posts with has_video_hint but no video URL found in HTML → embed.
    // 3. Album posts with fewer videos than album_size → embed for the full set.
    // ---------------------------------------------------------------------------
    for (const post of latest) {
      const hasText = String(post.text || '').trim().length > 0;
      const hasMedia = post.video_urls.length > 0 || String(post.photo_url || '').trim();
      const needsEmbed =
        (!hasText && !hasMedia) ||                                    // completely empty post
        (post.has_video_hint && post.video_urls.length === 0) ||     // video hinted but not found
        (post.is_album && post.video_urls.length < post.album_size); // album with missing videos

      if (!needsEmbed) continue;

      // Always try fetchAllVideosFromEmbed — it collects all <video>/<source>/<a> elements,
      // which gives us both single-video and multi-video results correctly.
      const allVideos = await fetchAllVideosFromEmbed(channel, post.id, post.post_url);
      if (allVideos.length > 0) {
        post.video_urls = allVideos;
        post.video_url = allVideos[0];
        // If album_size was 1 but we got multiple videos, correct it
        if (allVideos.length > 1) {
          post.is_album = true;
          post.album_size = allVideos.length;
        }
      }

      // Also try to get text from embed when it was empty in /s/ HTML
      if (!hasText) {
        try {
          const embedUrl = `https://telegram.me/${encodeURIComponent(channel)}/${encodeURIComponent(post.id)}?embed=1`;
          const embedResp = await getEmbedWithRetry(embedUrl);
          const $$ = cheerio.load(embedResp.data);
          const embedRich = parseRichText($$('.tgme_widget_message_text').first());
          if (embedRich.text) {
            post.text = embedRich.text;
            post.text_plain = embedRich.text_plain;
            post.text_html = embedRich.text_html;
            post.links = embedRich.links;
          } else {
            // Fallback: for album/media posts Telegram often hides .tgme_widget_message_text
            // but the post caption is available in og:description / twitter:description meta tags
            const ogDesc = String($$('meta[property="og:description"]').attr('content') || '').trim();
            const twDesc = String($$('meta[name="twitter:description"]').attr('content') || '').trim();
            const metaText = ogDesc || twDesc;
            if (metaText) {
              post.text = metaText;
              post.text_plain = metaText;
              post.text_html = metaText;
              post.links = [];
            }
          }
          // Also grab photo from embed og:image if still missing
          if (!String(post.photo_url || '').trim()) {
            const ogImage = String($$('meta[property="og:image"]').attr('content') || '').trim();
            if (ogImage) post.photo_url = ogImage;
          }
        } catch (_e) { /* ignore */ }
      }
    }

    for (const post of latest) {
      const needsThumb =
        (post.video_url || post.has_video_hint) && !String(post.photo_url || '').trim();
      if (needsThumb) {
        const thumb = await fetchVideoThumbFromEmbed(channel, post.id);
        if (thumb) post.photo_url = thumb;
      }
    }

    const enriched = latest.map(({ dateTs: _dateTs, has_video_hint: _hint, ...rest }) => {
      const hasVideo = rest.video_url || (rest.video_urls && rest.video_urls.length > 0);
      const mediaType = hasVideo ? 'video' : rest.photo_url ? 'photo' : 'none';
      const postUid = `${channel}_${rest.id}`;
      return { ...rest, media_type: mediaType, post_uid: postUid };
    });

    res.json({ channel, count: enriched.length, posts: enriched });
  } catch (err) {
    res.status(500).json({
      error: 'Failed to fetch/parse channel page',
      details: err.message,
    });
  }
});

function escapeHtmlAttr(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '')
    .replace(/>/g, '');
}

app.get('/tg-preview', (req, res) => {
  const img = String(req.query.img || '').trim();
  const titleRaw = String(req.query.title || 'Media preview').trim();
  const uid = String(req.query.uid || '').trim();
  const v = String(req.query.v || '').trim();

  if (!img) {
    return res
      .status(400)
      .type('text/plain; charset=utf-8')
      .send('Missing img');
  }

  if (!/^https?:\/\//i.test(img)) {
    return res
      .status(400)
      .type('text/plain; charset=utf-8')
      .send('Invalid img URL');
  }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  const title = escapeHtml(titleRaw.slice(0, 120) || 'Media preview');
  const image = escapeHtml(img);

  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host || '';
  const currentUrl = `${proto}://${host}${req.originalUrl || req.url}`;

  const pageUrl = escapeHtml(currentUrl);

  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  // Telegram кеширует preview.
  // Поэтому в URL из n8n обязательно должен быть уникальный uid/v для каждого поста.
  res.setHeader('Cache-Control', 'public, max-age=300, no-transform');

  res.send(`<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">

  <title>${title}</title>

  <meta property="og:type" content="article">
  <meta property="og:url" content="${pageUrl}">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${title}">
  <meta property="og:image" content="${image}">
  <meta property="og:image:secure_url" content="${image}">

  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${title}">
  <meta name="twitter:image" content="${image}">

  <style>
    html, body {
      margin: 0;
      padding: 0;
      background: #ffffff;
      font-family: Arial, sans-serif;
    }

    img {
      display: block;
      width: 100%;
      max-width: 1200px;
      height: auto;
      margin: 0 auto;
    }
  </style>
</head>
<body>
  <img src="${image}" alt="${title}">
</body>
</html>`);
});

app.listen(PORT, () => {
  console.log(`[${VERSION}] listening on http://localhost:${PORT}`);
  if (PARSER_TOKEN) console.log('PARSER_TOKEN guard enabled.');
});
