export async function handleAdminGetMessages(db, url, cors, json) {
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') || '20', 10)));
  const status = url.searchParams.get('status') || 'all';
  const offset = (page - 1) * limit;

  let countQ;
  let listQ;
  if (status === 'all') {
    countQ = db.prepare('SELECT COUNT(*) as total FROM messages');
    listQ = db.prepare(
      'SELECT id, nickname, content, ip_hash, status, pinned, created_at FROM messages ORDER BY created_at DESC LIMIT ? OFFSET ?'
    ).bind(limit, offset);
  } else {
    countQ = db.prepare('SELECT COUNT(*) as total FROM messages WHERE status=?').bind(status);
    listQ = db.prepare(
      'SELECT id, nickname, content, ip_hash, status, pinned, created_at FROM messages WHERE status=? ORDER BY created_at DESC LIMIT ? OFFSET ?'
    ).bind(status, limit, offset);
  }

  const total = (await countQ.first())?.total || 0;
  const { results: messages } = await listQ.all();
  return json({ messages, total, page, limit }, cors, 200, 'no-store');
}

export async function handleAdminUpdateMessage(db, id, body, cors, json) {
  const fields = [];
  const vals = [];
  if (body.status !== undefined) {
    fields.push('status=?');
    vals.push(body.status);
  }
  if (body.pinned !== undefined) {
    fields.push('pinned=?');
    vals.push(body.pinned ? 1 : 0);
  }
  if (!fields.length) return json({ error: 'No fields to update' }, cors, 400);
  fields.push("updated_at=datetime('now')");
  vals.push(id);
  await db.prepare(`UPDATE messages SET ${fields.join(',')} WHERE id=?`).bind(...vals).run();
  const updated = await db.prepare(
    'SELECT id, nickname, content, ip_hash, status, pinned, created_at FROM messages WHERE id=?'
  ).bind(id).first();
  return json({ success: true, message: updated }, cors, 200, 'no-store');
}

export async function handleAdminDeleteMessage(db, id, cors, json) {
  await db.prepare('DELETE FROM messages WHERE id=?').bind(id).run();
  return json({ success: true }, cors, 200, 'no-store');
}
