const express = require('express');
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = Number(process.env.PORT || 8765);
const DATA = process.env.BAZATU_DATA || path.join(__dirname, 'data');
fs.mkdirSync(DATA, { recursive: true });
const db = new Database(path.join(DATA, 'bazatu.db'));
db.pragma('journal_mode = WAL');

app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

db.exec(`
CREATE TABLE IF NOT EXISTS insurers (id INTEGER PRIMARY KEY, name TEXT UNIQUE NOT NULL, short_name TEXT NOT NULL, active INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS messages (
 id INTEGER PRIMARY KEY, insurer_id INTEGER NOT NULL, subject TEXT NOT NULL, category TEXT NOT NULL,
 received_at TEXT NOT NULL, valid_from TEXT, valid_to TEXT, sender TEXT, source_mailbox TEXT,
 body_html TEXT DEFAULT '', body_text TEXT DEFAULT '', source_message_id TEXT UNIQUE,
 created_at TEXT DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(insurer_id) REFERENCES insurers(id)
);
CREATE TABLE IF NOT EXISTS items (
 id INTEGER PRIMARY KEY, message_id INTEGER NOT NULL, title TEXT NOT NULL, category TEXT NOT NULL,
 valid_from TEXT, valid_to TEXT, status_override TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(message_id) REFERENCES messages(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS tags (id INTEGER PRIMARY KEY, name TEXT UNIQUE NOT NULL);
CREATE TABLE IF NOT EXISTS item_tags (item_id INTEGER NOT NULL, tag_id INTEGER NOT NULL, PRIMARY KEY(item_id,tag_id));
CREATE TABLE IF NOT EXISTS attachments (id INTEGER PRIMARY KEY, message_id INTEGER NOT NULL, filename TEXT NOT NULL, local_path TEXT, size INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS mailboxes (id INTEGER PRIMARY KEY, name TEXT NOT NULL, address TEXT, kind TEXT, last_sync TEXT, status TEXT DEFAULT 'Nie skonfigurowano');
`);

function seed(){
 const n=db.prepare('SELECT count(*) n FROM insurers').get().n; if(n) return;
 const addIns=db.prepare('INSERT INTO insurers(name,short_name) VALUES (?,?)');
 ['PZU','Warta','Compensa','ERGO Hestia','InterRisk','UNIQA','Allianz'].forEach(x=>addIns.run(x,x));
 const iid=name=>db.prepare('SELECT id FROM insurers WHERE name=?').get(name).id;
 const addM=db.prepare(`INSERT INTO messages(insurer_id,subject,category,received_at,valid_from,valid_to,sender,source_mailbox,body_text,source_message_id) VALUES (?,?,?,?,?,?,?,?,?,?)`);
 const addI=db.prepare(`INSERT INTO items(message_id,title,category,valid_from,valid_to) VALUES (?,?,?,?,?)`);
 const examples=[
  ['PZU','Niedostępność aplikacji Kandydat – prace serwisowe','Systemy','2026-09-14','2026-09-14','2026-09-14','PZU','Outlook','Prace serwisowe. Niedostępność aplikacji Kandydat w godzinach 17:00–19:00.','demo-pzu-1',['Kandydat','prace serwisowe']],
  ['Compensa','Letnie FLOW 3','Konkursy i akcje','2026-09-01','2026-09-01','2026-09-30','Compensa','LH','Konkurs Letnie FLOW 3. Szczegóły w regulaminie.','demo-comp-1',['FLOW','konkurs']],
  ['Warta','15% zniżki na nowe domy i mieszkania','Promocje i zniżki','2026-09-15','2026-09-15','2026-09-16','Warta','LH','Promocja 15% na nowe domy i mieszkania.','demo-warta-1',['dom','zniżka']],
  ['InterRisk','Brak przeglądów – Dom Max i PM+ wariant Max w Iron','Produkty','2026-09-10','2026-09-10',null,'InterRisk','LH','Informacja produktowa dotycząca wymogu przeglądów.','demo-ir-1',['Dom Max','Iron']],
  ['PZU','Co nowego w majątku?','Produkty','2026-09-12','2026-09-12',null,'PZU','Outlook','Newsletter źródłowy zawierający kilka tematów.','demo-pzu-2',['newsletter']]
 ];
 const tag=db.prepare('INSERT OR IGNORE INTO tags(name) VALUES (?)'); const tagId=db.prepare('SELECT id FROM tags WHERE name=?'); const link=db.prepare('INSERT OR IGNORE INTO item_tags(item_id,tag_id) VALUES (?,?)');
 for(const e of examples){const m=addM.run(iid(e[0]),e[1],e[2],e[3],e[4],e[5],e[6],e[7],e[8],e[9]); const it=addI.run(m.lastInsertRowid,e[1],e[2],e[4],e[5]); for(const t of e[10]){tag.run(t);link.run(it.lastInsertRowid,tagId.get(t).id)}}
 db.prepare("INSERT INTO attachments(message_id,filename,size) VALUES ((SELECT id FROM messages WHERE source_message_id='demo-comp-1'),'Regulamin_Letnie_FLOW_3.pdf',238400)").run();
 db.prepare("INSERT INTO mailboxes(name,address,kind,status) VALUES ('Stary Outlook','—','Outlook/Exchange','Do konfiguracji'),('LH.pl','—','IMAP','Do konfiguracji')").run();
}
seed();

function status(validTo, override){if(override)return override; if(!validTo)return 'Aktualne'; const end=new Date(validTo+'T23:59:59'); return end < new Date() ? 'Archiwalne' : 'Aktualne';}
app.get('/api/insurers',(req,res)=>res.json(db.prepare(`SELECT i.*, (SELECT count(*) FROM items x JOIN messages m ON m.id=x.message_id WHERE m.insurer_id=i.id) count FROM insurers i WHERE active=1 ORDER BY name`).all()));
app.get('/api/mailboxes',(req,res)=>res.json(db.prepare('SELECT * FROM mailboxes ORDER BY id').all()));
app.get('/api/items',(req,res)=>{
 let sql=`SELECT x.*,m.received_at,m.sender,m.source_mailbox,m.body_text,m.body_html,m.insurer_id,i.name insurer,
 (SELECT count(*) FROM attachments a WHERE a.message_id=m.id) attachments,
 (SELECT group_concat(t.name,'|||') FROM item_tags it JOIN tags t ON t.id=it.tag_id WHERE it.item_id=x.id) tags
 FROM items x JOIN messages m ON m.id=x.message_id JOIN insurers i ON i.id=m.insurer_id WHERE 1=1`;
 const p=[]; if(req.query.insurer){sql+=' AND i.name=?';p.push(req.query.insurer)} if(req.query.category){sql+=' AND x.category=?';p.push(req.query.category)} if(req.query.q){sql+=` AND (x.title LIKE ? OR m.body_text LIKE ? OR EXISTS(SELECT 1 FROM item_tags z JOIN tags t ON t.id=z.tag_id WHERE z.item_id=x.id AND t.name LIKE ?))`; const q='%'+req.query.q+'%';p.push(q,q,q)}
 sql+=' ORDER BY m.received_at DESC,x.id DESC'; const rows=db.prepare(sql).all(...p).map(r=>({...r,tags:r.tags?r.tags.split('|||'):[],status:status(r.valid_to,r.status_override)}));
 res.json(rows);
});
app.get('/api/items/:id',(req,res)=>{const r=db.prepare(`SELECT x.*,m.received_at,m.sender,m.source_mailbox,m.body_text,m.body_html,m.subject source_subject,i.name insurer FROM items x JOIN messages m ON m.id=x.message_id JOIN insurers i ON i.id=m.insurer_id WHERE x.id=?`).get(req.params.id); if(!r)return res.sendStatus(404); r.tags=db.prepare('SELECT t.name FROM item_tags it JOIN tags t ON t.id=it.tag_id WHERE it.item_id=?').all(r.id).map(x=>x.name);r.attachments=db.prepare('SELECT id,filename,size FROM attachments WHERE message_id=?').all(r.message_id);r.status=status(r.valid_to,r.status_override);res.json(r)});
app.post('/api/insurers',(req,res)=>{const name=String(req.body.name||'').trim();if(!name)return res.status(400).json({error:'Brak nazwy'});try{const r=db.prepare('INSERT INTO insurers(name,short_name) VALUES (?,?)').run(name,name);res.json({id:r.lastInsertRowid,name})}catch(e){res.status(409).json({error:'TU już istnieje'})}});
app.get('/api/stats',(req,res)=>{const items=db.prepare('SELECT valid_to,status_override FROM items').all();res.json({all:items.length,current:items.filter(x=>status(x.valid_to,x.status_override)==='Aktualne').length,expiring:items.filter(x=>{if(!x.valid_to)return false;const d=(new Date(x.valid_to+'T23:59:59')-new Date())/86400000;return d>=0&&d<=7}).length,archived:items.filter(x=>status(x.valid_to,x.status_override)==='Archiwalne').length})});

// Express 5 / path-to-regexp no longer accepts app.get('*').
// Regex fallback serves the SPA for every non-API GET route.
app.get(/.*/, (req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));

app.listen(PORT,'0.0.0.0',()=>console.log(`Baza TU: http://localhost:${PORT}`));
