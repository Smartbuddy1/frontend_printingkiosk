"use strict";
const fs=require("node:fs"),path=require("node:path");
const {appOverlay}=require("./overlay.cjs");
const {dictionaries}=require("./i18n.cjs");
module.exports=function buildDigiLocker(dist,config){
  if(!config.digilockerEnabled)return;
  const backend=new URL(config.backendUrl);
  if(backend.protocol!=="https:" || backend.username || backend.password || backend.pathname!=="/" || backend.search || backend.hash)throw new Error("Hosted DigiLocker requires the exact HTTPS backend origin");
  const dir=path.join(dist,"digilocker");fs.mkdirSync(dir,{recursive:true});
  for(const file of ["kiosk.js","kiosk.css"])fs.copyFileSync(path.join(__dirname,file),path.join(dir,file));
  const runtime={enabled:true,hosted:true,preview:false,apiBase:backend.origin,translations:dictionaries,maxFiles:5};
  fs.writeFileSync(path.join(dir,"runtime.js"),`window.DigiLockerConfig=${JSON.stringify(runtime)};window.DigiLockerConfig.assetBase=new URL("../",document.currentScript.src).href;\n`);
  const app=path.join(dist,"app.js");fs.writeFileSync(app,appOverlay(fs.readFileSync(app,"utf8"),{hosted:true}));
  const html=path.join(dist,"index.html"),before=fs.readFileSync(html,"utf8");
  const marker='<script src="./assets/morphdom.js"></script>';
  if(before.split(marker).length!==2)throw new Error("Cannot locate frontend DigiLocker script insertion point");
  fs.writeFileSync(html,before.replace(marker,'<link rel="stylesheet" href="./digilocker/kiosk.css"><script src="./digilocker/runtime.js"></script><script src="./digilocker/kiosk.js"></script>\n'+marker));
  // Runtime assets only; CommonJS build helpers must not be publicly served.
  for(const name of fs.readdirSync(dir))if(name.endsWith(".cjs"))fs.unlinkSync(path.join(dir,name));
};
