const fs=require('fs'),path=require('path'),Module=require('module');
const filename=path.join(__dirname,'server.js');
let code=fs.readFileSync(filename,'utf8');
const marker="app.get(/.*/,(q,r)=>r.sendFile(path.join(__dirname,'public','index.html')))";
if(!code.includes(marker))throw new Error('Nie znaleziono punktu montowania API w server.js');
code=code.replace(marker,"require('./light-classifier-api')(app,db);"+marker);
const m=new Module(filename,module);m.filename=filename;m.paths=Module._nodeModulePaths(__dirname);m._compile(code,filename);
// bootstrap.js is the watched entry point. Keep it alive explicitly; server.js owns the HTTP listener.
const keepAlive=setInterval(()=>{},2147483647);
function shutdown(){clearInterval(keepAlive);process.exit(0)}
process.once('SIGINT',shutdown);process.once('SIGTERM',shutdown);
