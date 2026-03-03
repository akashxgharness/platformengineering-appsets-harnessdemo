const el = (id) => document.getElementById(id);

const tile = el('tile');
const tagEl = el('tag');
const details = el('details');
const subtitle = el('subtitle');

let lastTag = null;

function setTileColor(tag) {
  if (!tag) {
    tile.style.background = '';
    return;
  }
  // Let CSS parse named colors; keep subtle gradient for depth.
  const safe = String(tag).trim();
  tile.style.background = `linear-gradient(180deg, rgba(255,255,255,0.16), rgba(0,0,0,0.14)), ${safe}`;
}

function pulse() {
  tile.classList.add('changed');
  window.setTimeout(() => tile.classList.remove('changed'), 240);
}

function render(payload) {
  const tag = payload?.tag || null;

  if (tag && tag !== lastTag) {
    pulse();
  }
  lastTag = tag;

  setTileColor(tag);
  tagEl.textContent = tag || '—';

  const parts = [];
  if (payload?.namespace && payload?.rolloutName) {
    parts.push(`${payload.namespace}/${payload.rolloutName}`);
  }
  if (payload?.image) parts.push(`image: ${payload.image}`);
  if (payload?.phase) parts.push(`phase: ${payload.phase}`);
  if (payload?.updatedAt) parts.push(`updated: ${payload.updatedAt}`);
  if (payload?.message) parts.push(payload.message);

  details.textContent = parts.length ? parts.join(' • ') : '—';
  subtitle.textContent = 'Connected (realtime)';
}

function connect() {
  subtitle.textContent = 'Connecting…';

  const es = new EventSource('/api/stream');

  es.addEventListener('rollout', (ev) => {
    try {
      render(JSON.parse(ev.data));
    } catch (e) {
      // ignore
    }
  });

  es.onerror = () => {
    subtitle.textContent = 'Disconnected — retrying…';
    es.close();
    window.setTimeout(connect, 1200);
  };
}

connect();

