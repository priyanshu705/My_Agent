"""The few pages the Python server renders itself (sign-in, "UI not built"), styled with the web UI's tokens.

Colours match web/app/globals.css and follow the system light or dark setting. cloud/ is deployed on its own,
so it carries a copy of the same few rules.
"""

BASE_CSS = """
:root{color-scheme:light dark;--bg:#F7F8FC;--card:#fff;--line:#E8EAF0;--control:#848DA0;--ink:#1F2937;--muted:#5C6B82;
--primary:#5856D6;--link:#5856D6;--danger:#B42F2F;--danger-soft:#FCEBEB}
@media (prefers-color-scheme:dark){:root{--bg:#0B1020;--card:#141B2D;--line:#26304A;--control:#697490;--ink:#E5E7EB;
--muted:#9AA6BC;--link:#8B89F0;--danger:#F87171;--danger-soft:#3E181C}}
body{margin:0;min-height:100vh;display:grid;place-items:center;padding:16px;box-sizing:border-box;background:var(--bg);
color:var(--ink);font:16px/1.5 Inter,system-ui,sans-serif}
.card{width:100%;max-width:384px;box-sizing:border-box;padding:28px;border:1px solid var(--line);border-radius:16px;background:var(--card)}
h1{font-size:22px;margin:0 0 6px}p{color:var(--muted);font-size:14px;margin:0 0 16px}a{color:var(--link)}
"""

LOGIN_HTML = """<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>My Agent: sign in</title>
<style>""" + BASE_CSS + """
label{display:block;font-size:14px;font-weight:500}
input,button{width:100%;box-sizing:border-box;min-height:48px;border-radius:12px;font:inherit}
input{margin-top:4px;padding:0 12px;border:1px solid var(--control);background:var(--card);color:var(--ink)}
button{margin-top:16px;border:0;background:var(--primary);color:#fff;font-weight:600;cursor:pointer}
button:disabled{opacity:.5;cursor:not-allowed}
:focus-visible{outline:2px solid var(--link);outline-offset:2px}
#err{margin:12px 0 0;padding:8px 12px;border-radius:10px;background:var(--danger-soft);color:var(--danger)}
#err:empty{padding:0;margin:0}
</style></head><body>
<main class="card"><form id="f"><h1>My Agent</h1><p>Enter the access PIN (ACCESS_PIN in the .env file on the PC).</p>
<label for="pin">Access PIN</label>
<input id="pin" type="password" autocomplete="current-password" required autofocus aria-describedby="err">
<button id="go">Sign in</button><p id="err" role="alert"></p></form></main>
<script>
const f=document.getElementById("f"),pin=document.getElementById("pin"),go=document.getElementById("go"),err=document.getElementById("err");
f.onsubmit=async e=>{e.preventDefault();go.disabled=true;go.textContent="Signing in...";err.textContent="";
try{const r=await fetch("/api/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({pin:pin.value})});
if(r.ok){location.href="/";return}const d=await r.json().catch(()=>({}));err.textContent=d.detail||"Sign-in failed."}
catch{err.textContent="Could not reach the agent. Check that it is running."}
go.disabled=false;go.textContent="Sign in";pin.setAttribute("aria-invalid","true");pin.focus()};
</script></body></html>"""


def no_ui_html(url: str) -> str:
    """Shown at "/" when web/out has not been built. `url` is the hosted UI."""
    return ("""<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>My_Agent</title><style>""" + BASE_CSS + """
.card{max-width:560px}</style></head><body><main class="card">
<h1>The agent is running, but its web UI is not built yet</h1>
<p>Run <code>run.bat</code> again (it builds the UI once, needs Node.js 18+), or in the <code>web</code> folder run
<code>npm install</code> then <code>npm run build:local</code>, and refresh this page.</p>
<p>You can also use the hosted UI: <a href="%s">%s</a></p></main></body></html>""" % (url, url))
