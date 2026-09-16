const { ImapFlow } = require('imapflow');

const ALLOWED_FOLDERS = ['Allianz','Compensa','Generali','Hestia','Interrisk','Link4','PZU','Uniqa','Warta'];

function config(password) {
  return {
    host: 'mail-serwer287110.lh.pl',
    port: 993,
    secure: true,
    auth: { user: 'kontakt@elefi.pl', pass: password },
    logger: false
  };
}

async function withClient(password, fn) {
  if (!password) throw new Error('Brak hasła IMAP');
  const client = new ImapFlow(config(password));
  try {
    await client.connect();
    return await fn(client);
  } finally {
    try { await client.logout(); } catch (_) {}
  }
}

async function testConnection(password) {
  return withClient(password, async client => {
    const boxes = await client.list();
    const byName = new Map(boxes.map(b => [String(b.name).toLowerCase(), b]));
    return ALLOWED_FOLDERS.map(name => {
      const box = byName.get(name.toLowerCase());
      return { name, found: !!box, path: box ? box.path : null };
    });
  });
}

async function scanFolders(password) {
  return withClient(password, async client => {
    const boxes = await client.list();
    const byName = new Map(boxes.map(b => [String(b.name).toLowerCase(), b]));
    const result = [];
    for (const wanted of ALLOWED_FOLDERS) {
      const box = byName.get(wanted.toLowerCase());
      if (!box) { result.push({ name: wanted, found: false, messages: 0 }); continue; }
      // CRITICAL SAFETY: mailbox is opened read-only. No move/delete/flag/expunge methods exist in this module.
      const lock = await client.getMailboxLock(box.path, { readOnly: true });
      try {
        result.push({ name: wanted, found: true, path: box.path, messages: client.mailbox.exists || 0 });
      } finally { lock.release(); }
    }
    return result;
  });
}

module.exports = { ALLOWED_FOLDERS, testConnection, scanFolders };
