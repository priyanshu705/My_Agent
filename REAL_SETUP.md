# Real setup: Vercel UI + your PC agent

The agent (and all PC control) runs on **your Windows PC**. The Vercel page is only the screen.
A free Cloudflare tunnel connects the two, and a PIN protects it.

## One-time
1. Run `run.bat` once so everything installs, then close it.
2. In `.env` set a PIN of at least 6 characters: `ACCESS_PIN=meraPin2026` (and your `GEMINI_API_KEY`).
3. Double-click `run_online.bat`. The first time it downloads `cloudflared` (~30 MB).
4. It prints a link like `https://my-agent-ui-three.vercel.app/#connect=https://xxxx.trycloudflare.com`
   (also saved in `data\phone_link.txt`). Open that link on your phone or any browser, enter the PIN.
   On Vercel the mic works too, because it is HTTPS.

The tunnel link changes every start. For a fixed link use a named Cloudflare tunnel (needs a domain) and
put the same address in the Connect box.

## Autostart
`install_autostart.bat` starts the agent hidden when you log in to Windows. Run `remove_autostart.bat` to stop.
After a reboot, get the new link from `data\phone_link.txt` or Settings at `http://localhost:8000`.

## Safety
- The agent only listens on 127.0.0.1. The tunnel is the only way in and needs the PIN (5 wrong tries lock that device, longer each time).
- Risky actions (sending mail or WhatsApp, typing, closing apps, locking, cancelling events) still ask haan/na.
- Keep the PIN private. To log everyone out, delete `data\auth_tokens.json` and restart.
- Your PC must be on and awake for this to work.

## Test checklist (tick as you go)
- [ ] `run_online.bat` prints a link; the link opens and asks for the PIN
- [ ] Wrong PIN is refused; right PIN opens the chat; the "PC online" badge shows
- [ ] Type "Chrome kholo": Chrome opens on the PC and the reply appears on the phone
- [ ] Say "Volume 40 kar do" using the mic on the phone
- [ ] "Aaj ke unread mail batao" (needs Gmail setup): the Mail panel fills in
- [ ] "Kal meri kya meetings hain?": the Calendar panel fills in
- [ ] "Jyotish ko WhatsApp karo ki ..." shows a confirm card; tap Na and nothing is sent; repeat and tap Haan
- [ ] "10 minute baad yaad dilana ...": reminder appears in the panel and fires on time
- [ ] To-do and notes added from the panel show up when you ask the agent for them
- [ ] Close the tunnel window: the phone shows "PC offline"; start it again and reconnect with the new link
- [ ] Restart the PC (with autostart on): the agent is back and `data\phone_link.txt` has a new link

## Power features (all optional, all off by default)

Install once: `pip install -r requirements-extra.txt`, then switch on what you want in `.env`.

See README.md for the full table.
