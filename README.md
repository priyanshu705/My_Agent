# My_Agent

A personal Hinglish voice assistant that runs on your Windows PC. You talk to it in the browser, either by pressing the mic or by saying **"Hey Agent"**, and it does the job: it opens apps, finds files, controls volume, takes screenshots, types text, searches Google or YouTube, saves notes and to-dos, and sets reminders.

It also handles Gmail, Google Calendar and WhatsApp (your own number). The AI behind it is Google **Gemini** (free tier), which uses function calling to decide which tool to run.

## Features

| Area | You can say |
|---|---|
| Apps | "Chrome khol do", "VS Code open karo", "Notepad band karo" |
| Files | "Downloads mein resume dhundho aur khol do", "Desktop pe kya hai?" |
| System | "Volume 40 kar do", "Screenshot lo", "Battery kitni hai?", "Screen lock karo" |
| Typing | "Ye type karo: Hello sir, I will join at 5", "Ctrl S dabao" |
| Web | "YouTube pe Arijit ke gaane chalao", "Google pe weather Gurgaon search karo", "Gmail kholo" |
| WhatsApp | "Jyotish ko WhatsApp karo ki main 10 min mein pahunch raha hoon", "Resume Rahul ko WhatsApp karo", "WhatsApp pe kiske message aaye?", "Mom ki chat padho", "Raat 12 baje Rahul ko happy birthday bhejna" |
| Contacts | "Rahul ka number 98765 43210 save karo", "Jyotish ka number kya hai?" |
| Gmail | "Aaj ke unread mail batao", "HR ka last mail padho", "Jyotish ko mail draft karo ki report kal bhejunga", "Sir ko mail bhej do..." |
| Calendar | "Kal meri kya meetings hain?", "Kal 5 baje store visit add karo", "Meeting 6 baje shift karo", "Is hafte kab free hoon?" |
| Memory | "Note karo...", "To-do mein add karo...", "10 minute baad yaad dilana...", "Yaad rakhna ki mera fav color blue hai" |

Risky actions (closing apps, typing, pressing keys, locking the screen, sending a mail or WhatsApp, scheduling a WhatsApp, changing or cancelling an event) ask for **haan / na** before they run.

## Setup on Windows (5 minutes)

1. Install **Python 3.10 or newer** from [python.org](https://www.python.org/downloads/) and tick *"Add Python to PATH"* during install.
2. Get a free Gemini API key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey).
3. Download this repo: **Code → Download ZIP**, then extract it (or `git clone`).
4. Double-click **`run.bat`**.
   * The first run installs everything and opens a `.env` file in Notepad. Paste your key after `GEMINI_API_KEY=`, save, and close it.
   * Double-click `run.bat` again. The agent opens at **http://localhost:8000**.
5. Open it in **Chrome or Edge** and allow microphone access.

### How to use it

* Press the 🎤 button and speak, or
* Turn on **"hey agent" sunte raho**, keep the tab open, and say *"Hey Agent, Chrome khol do"*.
* You can also type in the box.

### No API key yet? Demo mode

Without a Gemini key the agent starts in **Demo mode**: a simple offline brain that understands common commands like "Chrome kholo" or "volume 40 karo". It is much less smart than Gemini, so add your key for the real thing.

## Phase 2: Gmail + Calendar setup (one time, ~10 minutes)

The agent needs your permission to use your Gmail and Calendar. Google asks every app to do this one-time setup.

1. Open [console.cloud.google.com](https://console.cloud.google.com) and sign in with the Gmail account you want to use.
2. At the top, click the project picker, then **New Project**. Name it `My Agent` and click **Create**. Make sure it is selected.
3. Turn on the two APIs. Open each link and click **Enable**:
   * [Gmail API](https://console.cloud.google.com/apis/library/gmail.googleapis.com)
   * [Google Calendar API](https://console.cloud.google.com/apis/library/calendar-json.googleapis.com)
4. Go to **APIs & Services → OAuth consent screen** (it may be called **Google Auth Platform → Branding**). Click **Get started**.
   * App name: `My Agent`, support email: your Gmail.
   * Audience: **External**.
   * Contact email: your Gmail. Agree and **Create**.
5. Go to **Audience** (or *Test users*) and **Add users**: add your own Gmail address. This step is required, otherwise login says "access blocked".
6. Go to **Clients** (or *Credentials*), click **Create client** and pick Application type **Desktop app**. Name it `My Agent` and click **Create**.
7. Click **Download JSON**. Rename the file to **`credentials.json`** and put it in the My_Agent folder, next to `run.bat`.
8. Double-click **`setup_google.bat`**. A Google page opens.
   * Choose your account.
   * You will see "Google hasn't verified this app". That is normal because you made the app yourself. Click **Continue**.
   * Tick all permissions and click **Continue**.
9. When it says *"Google connect ho gaya"*, start `run.bat` again. The header now shows **Gmail ✓**.

Your login is saved in `token.json` on your PC only. Both `credentials.json` and `token.json` are in `.gitignore`, so keep them private and never upload them. To disconnect, delete `token.json`, or remove access at [myaccount.google.com/permissions](https://myaccount.google.com/permissions).

How mails are handled: by default the agent **creates a draft** in Gmail. It sends a mail only when you clearly say "bhej do", and it still asks **haan/na** first. It never guesses an email address: it looks the person up in your old mails or asks you.

## Phase 3: WhatsApp setup (one time, 2 minutes)

The agent sends WhatsApp messages from **your own number** by controlling WhatsApp Web in a separate Edge/Chrome window.

1. Run `run.bat` once so everything is installed, then close it.
2. Double-click **`setup_whatsapp.bat`**. A browser window opens with WhatsApp Web.
3. On your phone, open WhatsApp → **Settings → Linked devices → Link a device**, and scan the QR code.
4. When it says *"WhatsApp connect ho gaya"*, close it and start `run.bat` again.

The login is saved in `data/wa_profile` (private, never uploaded). When the agent sends something, the WhatsApp window opens and you can watch it type. To hide that window, set `WA_HEADLESS=1` in `.env`.

How the agent finds a person ("Jyotish ko WhatsApp karo"), in this order:

1. **Your saved contacts.** Say "Jyotish ka number ... save karo".
2. **Google Contacts.** This needs the Phase 2 Google login. If you set up Google before Phase 3, run `setup_google.bat` again so it can read contacts, and enable the [People API](https://console.cloud.google.com/apis/library/people.googleapis.com) in the same Google Cloud project.
3. **Your WhatsApp chat list**, searched by name.

Every message, file and scheduled message asks **haan/na** first and shows you the exact text.

> **Important:** This is unofficial automation of WhatsApp Web. WhatsApp can ban numbers that send bulk or spam messages. Use it for normal personal messages only. As a safety net the agent waits a few seconds between messages and never sends more than 30 per hour. Scheduled messages only go out while your PC and the agent are running.

If WhatsApp changes its website and something stops working, a screenshot is saved to `data/wa_debug.png`, and the selectors at the top of `app/whatsapp_tools.py` need updating.

## Settings (`.env`)

| Key | What it does |
|---|---|
| `GEMINI_API_KEY` | Your Gemini key (required) |
| `GEMINI_MODEL` | Default `gemini-2.5-flash` |
| `AGENT_NAME`, `WAKE_WORD`, `USER_NAME` | Name, wake word, and how it addresses you |
| `RECOGNITION_LANG` | `en-IN` (Hinglish in English letters, recommended) or `hi-IN` |
| `VOICE_LANG` | Voice used to speak replies |
| `TIMEZONE` | Default `Asia/Kolkata`, used for Calendar and reminders |
| `WA_HEADLESS` | `1` hides the WhatsApp window (after the QR login) |

Notes, to-dos, reminders, contacts and the WhatsApp login are saved in the `data/` folder on your PC. They never go to GitHub.

## Project structure

```
app/
  main.py          FastAPI server (serves UI + API)
  agent.py         Gemini brain, tool loop, haan/na confirmation
  pc_tools.py      Windows: apps, files, volume, screenshot, typing
  web_tools.py     Google search, YouTube, websites
  memory_tools.py  Notes, to-dos, reminders, facts
  google_tools.py  Gmail + Google Calendar (Phase 2)
  whatsapp_tools.py WhatsApp Web: send, files, read, schedule (Phase 3)
  contacts_tools.py Saved contacts + Google Contacts lookup
  demo_agent.py    Offline demo brain (no API key)
static/            Web UI (voice in/out, wake word)
run.bat            One-click start on Windows
setup_google.bat   One-time Google login for Gmail + Calendar
setup_whatsapp.bat One-time WhatsApp QR login
```

## Adding a new skill

Write a normal Python function with type hints and a docstring in any `*_tools.py` file, then add it to that file's tools list. Gemini reads the docstring to decide when to use it.

## Roadmap

- [x] Phase 1: voice, wake word, PC control, web actions, notes/to-dos/reminders
- [x] Phase 2: Gmail (read, search, draft, send) and Google Calendar (view, add, change, cancel, free time)
- [x] Phase 3: WhatsApp on your own number (send text/files, read unread and chats, scheduled messages)
- [ ] Deploy the web UI online so it works from the phone too

## Safety

* The server only listens on `127.0.0.1`, so nobody else on your network can control your PC.
* No files or emails are ever deleted. Cancelling a calendar event and every other risky action needs your confirmation.
* Keep `.env` private. It is already in `.gitignore`.
