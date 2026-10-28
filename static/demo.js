// Preview-only: fake backend so the UI works on Vercel (no PC control here).
(function(){
const now=()=>new Date().toISOString().slice(0,19);
let sessions={},todos=[{task:"Report ka draft bhejna",done:false,at:"today"},{task:"Store visit slides",done:true,at:"today"}],notes=[{text:"Jyotish ke saath store visit kal 5 baje",at:"today"}],pend=false;
const J=(o,s=200)=>Promise.resolve(new Response(JSON.stringify(o),{status:s,headers:{"Content-Type":"application/json"}}));
const sess=(id)=>sessions[id]||(sessions[id]={title:"",messages:[],updated:now()});
function rec(id,u,r){const s=sess(id);if(u){s.messages.push({role:"user",text:u,at:now()});if(!s.title)s.title=u.slice(0,48);}s.messages.push({role:"bot",text:r.reply,at:now(),actions:r.actions||[],confirm:r.confirm});s.updated=now();}
function brain(t){t=t.toLowerCase();
if(pend){pend=false;if(/^(haan|han|yes|ok)/.test(t))return{reply:"Bhej diya. (Preview mein asli message nahi jaata.)",actions:[]};return{reply:"Theek hai, cancel kar diya.",actions:[]};}
if(t.includes("whatsapp")){pend=true;return{reply:"Confirm karo: Jyotish ko WhatsApp: \"Main 10 min mein pahunch raha hoon\". Haan ya na?",confirm:{tool:"whatsapp_send",args:{to:"Jyotish",message:"Main 10 min mein pahunch raha hoon"}},actions:[]};}
if(t.includes("mail")){pend=true;return{reply:"Confirm karo: mail bhejna hai. Haan ya na?",confirm:{tool:"gmail_send",args:{to:"hr@example.com",subject:"Report kal tak",body:"Report kal tak bhej dunga."}},actions:[]};}
if(t.includes("todo")||t.includes("to-do")){todos.push({task:t.replace(/.*todo( mein)?( add karo)?/,"").trim()||"Naya kaam",done:false,at:"now"});return{reply:"To-do mein add kar diya.",actions:[{tool:"add_todo",result:"ok"}]};}
return{reply:"Ye sirf UI preview hai. Asli agent aapke Windows PC par chalta hai. Try karo: \"Jyotish ko WhatsApp karo\" ya \"mail bhej do\".",actions:[{tool:"open_app",result:"Preview: kuch nahi khula"}]};}
const real=window.fetch.bind(window);
window.fetch=function(url,o={}){const u=String(url),m=(o.method||"GET").toUpperCase();
if(!u.startsWith("/api/"))return real(url,o);
const body=o.body?JSON.parse(o.body):{};
if(u==="/api/config")return J({agent_name:"Agent",wake_word:"hey agent",user_name:"Om",recognition_lang:"en-IN",voice_lang:"en-IN",demo:true,google_connected:false,phone_url:""});
if(u==="/api/chat"){return new Promise(r=>setTimeout(()=>{const x=brain(body.text);rec(body.session_id,body.text,x);r(new Response(JSON.stringify(x),{headers:{"Content-Type":"application/json"}}));},900));}
if(u==="/api/confirm"){pend=false;const x={reply:body.approved?"Bhej diya. (Preview mein asli message nahi jaata.)":"Theek hai, cancel kar diya.",actions:[]};rec(body.session_id,body.approved?"Haan":"Na",x);return J(x);}
if(u==="/api/sessions"&&m==="GET")return J({sessions:Object.entries(sessions).map(([id,s])=>({id,title:s.title||"Nayi chat",updated:s.updated,count:s.messages.length})).sort((a,b)=>b.updated.localeCompare(a.updated))});
let mm=u.match(/^\/api\/sessions\/(.+)$/);
if(mm){const id=decodeURIComponent(mm[1]);if(m==="DELETE"){delete sessions[id];return J({ok:true});}return J({id,messages:(sessions[id]||{messages:[]}).messages});}
if(u==="/api/activity")return J({tool:"",args:{},seconds:0});
if(u==="/api/dashboard/local"){const d=new Date(Date.now()+25*60000).toISOString().slice(0,16).replace("T"," ");return J({todos:todos.map((t,i)=>({i,...t})),notes:notes.map((n,i)=>({i,...n})).reverse(),reminders:[{text:"Store visit ke liye nikalna",due:d}],status:{google:false,whatsapp:false,battery:{percent:82,plugged:true}}});}
if(u==="/api/dashboard/calendar")return J({connected:true,events:[{title:"Store visit (Jyotish)",day:"Tomorrow",time:"05:00 PM - 06:00 PM",location:"Sector 29"},{title:"Retail Management class",day:"Thu",time:"10:00 AM - 11:00 AM",location:""}]});
if(u==="/api/dashboard/mail")return J({connected:true,mails:[{from:"HR Team",subject:"Interview schedule",snippet:"Aapka interview Friday ko 3 baje hai"},{from:"Prof. Gupte",subject:"Assignment feedback",snippet:"Slides achhi hain, thoda aur data add karo"}]});
mm=u.match(/^\/api\/todos\/(\d+)\/toggle$/);if(mm){todos[+mm[1]].done=!todos[+mm[1]].done;return J({ok:true});}
if(u==="/api/todos"){todos.push({task:body.text,done:false,at:"now"});return J({ok:true});}
if(u==="/api/notes"){notes.push({text:body.text,at:"now"});return J({ok:true});}
if(u==="/api/reminders")return J({message:"Reminder set (preview)."});
if(u==="/api/reminders/due")return J({due:[],notices:[]});
return J({detail:"not in preview"},404);};
const bar=document.createElement("div");bar.textContent="UI preview • demo data, PC control nahi hai";
bar.style.cssText="position:fixed;bottom:6px;left:50%;transform:translateX(-50%);z-index:99;font:11px system-ui;color:#7f93b8;background:#0b1224cc;border:1px solid #1b2a4f;padding:3px 10px;border-radius:999px;pointer-events:none";
document.addEventListener("DOMContentLoaded",()=>document.body.appendChild(bar));
})();
