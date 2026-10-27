# My_Agent

A personal Hinglish voice assistant that runs on your Windows PC. You talk to it in the browser, either by pressing the mic or by saying **"Hey Agent"**, and it does the job: it opens apps, finds files, controls volume, takes screenshots, types text, searches Google or YouTube, saves notes and to-dos, and sets reminders.

The AI behind it is Google **Gemini** (free tier), which uses function calling to decide which tool to run.

## Features (Phase 1)

| Area | You can say |
|---|---|
| Apps | "Chrome khol do", "VS Code open karo", "Notepad band karo" |
| Files | "Downloads mein resume dhundho aur khol do", "Desktop pe kya hai?" |
| System | "Volume 40 kar do", "Screenshot lo", "Battery kitni hai?", "Screen lock karo" |
| Typing | "Ye type karo: Hello sir, I will join at 5", "Ctrl S dabao" |
| Web | "YouTube pe Arijit ke gaane chalao", "Google pe weather Gurgaon search karo", "Gmail kholo" |
| WhatsApp | "9876543210 ko WhatsApp karo ki main late hoon" (opens WhatsApp Web with the message ready; you press Send) |
| Memory | "Note karo...", "To-do mein add karo...", "10 minute baad yaad dilana...", "Yaad rakhna ki mera fav color blue hai" |

Risky actions (closing apps, typing, pressing keys, locking the screen) ask for **haan / na** before they run.

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

## Settings (`.env`)

| Key | What it does |
|---|---|
| `GEMINI_API_KEY` | Your Gemini key (required) |
| `GEMINI_MODEL` | Default `gemini-2.5-flash` |
| `AGENT_NAME`, `WAKE_WORD`, `USER_NAME` | Name, wake word, and how it addresses you |
| `RECOGNITION_LANG` | `en-IN` (Hinglish in English letters, recommended) or `hi-IN` |
| `VOICE_LANG` | Voice used to speak replies |

Notes, to-dos and reminders are saved in `data/memory.json` on your PC. They never go to GitHub.

## Project structure

```
app/
  main.py          FastAPI server (serves UI + API)
  agent.py         Gemini brain, tool loop, haan/na confirmation
  pc_tools.py      Windows: apps, files, volume, screenshot, typing
  web_tools.py     Google, YouTube, websites, WhatsApp Web
  memory_tools.py  Notes, to-dos, reminders, facts
static/            Web UI (voice in/out, wake word)
run.bat            One-click start on Windows
```

## Adding a new skill

Write a normal Python function with type hints and a docstring in any `*_tools.py` file, then add it to that file's tools list. Gemini reads the docstring to decide when to use it.

## Roadmap

- [x] Phase 1: voice, wake word, PC control, web actions, notes/to-dos/reminders
- [ ] Phase 2: Gmail and Google Calendar (OAuth): read and draft emails, add meetings
- [ ] Phase 3: WhatsApp sending through the official API
- [ ] Deploy the web UI online so it works from the phone too

## Safety

* The server only listens on `127.0.0.1`, so nobody else on your network can control your PC.
* Nothing gets deleted. Risky actions need your confirmation.
* Keep `.env` private. It is already in `.gitignore`.
