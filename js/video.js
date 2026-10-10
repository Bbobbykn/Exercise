// Turns an instruction-video link into something the page can play.
// Supports YouTube, Vimeo and direct video files (.mp4, .webm, .mov).

export function parseVideo(url) {
  const raw = String(url ?? '').trim();
  if (!raw) return null;
  let u;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(u.protocol)) return null;
  const host = u.hostname.replace(/^(www\.|m\.)/, '');

  let yt = null;
  if (host === 'youtu.be') yt = u.pathname.slice(1).split('/')[0];
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    yt = u.searchParams.get('v') ?? u.pathname.match(/^\/(?:shorts|embed|live)\/([^/?]+)/)?.[1] ?? null;
  }
  if (yt && /^[\w-]{6,20}$/.test(yt)) {
    return { kind: 'iframe', src: `https://www.youtube-nocookie.com/embed/${yt}?rel=0&playsinline=1` };
  }

  const vimeo = host === 'vimeo.com' && u.pathname.match(/^\/(\d+)/)?.[1];
  if (vimeo) return { kind: 'iframe', src: `https://player.vimeo.com/video/${vimeo}` };

  if (/\.(mp4|webm|mov|m4v)$/i.test(u.pathname)) return { kind: 'file', src: u.href };
  return { kind: 'link', src: u.href };
}

export function videoEmbed(url, title = 'Instruction video') {
  const v = parseVideo(url);
  if (!v) return '';
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  if (v.kind === 'iframe') {
    return `<div class="video"><iframe src="${esc(v.src)}" title="${esc(title)}" loading="lazy"
      allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowfullscreen
      referrerpolicy="strict-origin-when-cross-origin"></iframe></div>`;
  }
  if (v.kind === 'file') {
    return `<div class="video"><video src="${esc(v.src)}" controls playsinline preload="metadata"></video></div>`;
  }
  return `<a class="btn ghost" href="${esc(v.src)}" target="_blank" rel="noopener">Open instruction video</a>`;
}
