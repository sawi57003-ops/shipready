import api, { route } from '@forge/api';

// Create a Confluence page with the given title and storage-format HTML body.
// Returns { id, url } on success.
export async function createPage(spaceKey, title, htmlBody) {
  const res = await api.asApp().requestConfluence(route`/wiki/rest/api/content`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'page',
      title,
      space: { key: spaceKey },
      body: { storage: { value: htmlBody, representation: 'storage' } },
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Confluence create page -> HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  const body = await res.json();
  const self = (body._links && body._links.base) || '';
  const webui = (body._links && body._links.webui) || '';
  return { id: body.id, url: `${self}${webui}` };
}

// First writable space, used when the user does not name one.
export async function firstSpace() {
  const res = await api.asApp().requestConfluence(route`/wiki/rest/api/space?limit=25`);
  if (!res.ok) {
    throw new Error(`Confluence list spaces -> HTTP ${res.status}`);
  }
  const body = await res.json();
  const spaces = (body.results || []).filter((s) => s && s.key);
  if (spaces.length === 0) throw new Error('No Confluence space found that this app can write to.');
  return spaces[0].key;
}

// Minimal Markdown -> Confluence storage-format conversion for the report.
// Handles headings, bold, tables (as plain lines) and bullet lists.
export function markdownToStorage(md) {
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const inline = (s) => esc(s).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  const out = [];
  for (const line of md.split('\n')) {
    if (line.startsWith('# ')) out.push(`<h1>${inline(line.slice(2))}</h1>`);
    else if (line.startsWith('## ')) out.push(`<h2>${inline(line.slice(3))}</h2>`);
    else if (line.startsWith('- ')) out.push(`<p>&bull; ${inline(line.slice(2))}</p>`);
    else if (line.startsWith('|')) out.push(`<p>${inline(line)}</p>`);
    else if (line.trim() === '') continue;
    else out.push(`<p>${inline(line)}</p>`);
  }
  return out.join('\n');
}
