import express from "express";
import pg from "pg";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
const {Pool}=pg, app=express(), dir=path.dirname(fileURLToPath(import.meta.url));
const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.DATABASE_URL?{rejectUnauthorized:false}:false});
app.use(express.json({limit:"5kb"}));
const ready=pool.query(`CREATE TABLE IF NOT EXISTS activity(id BIGSERIAL PRIMARY KEY,event TEXT NOT NULL CHECK(event IN ('visit','message_open','instagram_click')),created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
function equal(a,b){const x=Buffer.from(String(a||"")),y=Buffer.from(String(b||""));return x.length===y.length&&crypto.timingSafeEqual(x,y);}
function admin(req,res,next){
 const h=req.headers.authorization||"",[scheme,token]=h.split(" ");let decoded="";
 try{if(scheme==="Basic"&&token)decoded=Buffer.from(token,"base64").toString("utf8");}catch{}
 const i=decoded.indexOf(":"),u=i<0?"":decoded.slice(0,i),p=i<0?"":decoded.slice(i+1);
 if(u!==(process.env.ADMIN_USER||"nikhil")||!process.env.ADMIN_PASSWORD||!equal(p,process.env.ADMIN_PASSWORD)){
  res.set("WWW-Authenticate",'Basic realm="Private visitor dashboard"');return res.status(401).send("Sign in required.");
 } next();
}
app.post("/api/track",async(req,res)=>{const e=req.body?.event;if(!["visit","message_open","instagram_click"].includes(e))return res.status(400).end();try{await ready;await pool.query("INSERT INTO activity(event) VALUES($1)",[e]);res.status(204).end();}catch(err){console.error(err);res.status(503).json({error:"Tracking unavailable"});}});
app.get("/admin",admin,async(req,res)=>{try{await ready;const [c,r]=await Promise.all([
 pool.query("SELECT COUNT(*) FILTER(WHERE event='visit')::int visits,COUNT(*) FILTER(WHERE event='message_open')::int opens,COUNT(*) FILTER(WHERE event='instagram_click')::int clicks FROM activity"),
 pool.query("SELECT event,to_char(created_at AT TIME ZONE 'Asia/Kolkata','DD Mon YYYY, HH12:MI:SS AM') time FROM activity ORDER BY id DESC LIMIT 100")]);
 const x=c.rows[0],rows=r.rows.map(v=>`<tr><td>${v.time}</td><td>${v.event.replaceAll("_"," ")}</td></tr>`).join("");
 res.set("Cache-Control","no-store").type("html").send(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Private dashboard</title><style>body{font:15px system-ui;background:#fff7fb;color:#4a1730;margin:0;padding:22px}.wrap{max-width:850px;margin:auto}.box{background:white;border:1px solid #f4c5d8;border-radius:18px;padding:20px;margin:14px 0}.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.stat{background:#fff0f6;border-radius:12px;padding:15px}.num{font-size:30px;font-weight:bold;color:#be185d}small{color:#8b5570}table{width:100%;border-collapse:collapse}td,th{text-align:left;padding:12px 8px;border-bottom:1px solid #f5d9e5;text-transform:capitalize}@media(max-width:520px){.stats{grid-template-columns:1fr}}</style></head><body><main class="wrap"><h1>💗 Nikhil's private dashboard</h1><p>Private activity summary · Times in India Standard Time</p><div class="stats"><div class="stat"><small>Total visits</small><div class="num">${x.visits}</div></div><div class="stat"><small>Message opens</small><div class="num">${x.opens}</div></div><div class="stat"><small>Instagram clicks</small><div class="num">${x.clicks}</div></div></div><section class="box"><h2>Recent activity</h2><table><thead><tr><th>Time (IST)</th><th>Activity</th></tr></thead><tbody>${rows||'<tr><td colspan="2">No activity yet.</td></tr>'}</tbody></table></section><small>Anonymous event data only. No visitor names, IP addresses or precise location are stored. Visits cannot identify Sahana.</small></main></body></html>`);
 }catch(e){console.error(e);res.status(503).send("Dashboard unavailable");}});
app.use(express.static(path.join(dir,"public")));
app.get("/",(req,res)=>res.sendFile(path.join(dir,"public/index.html")));
app.listen(process.env.PORT||3000,()=>console.log("Website started"));
