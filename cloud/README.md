# My_Agent cloud (Vercel)

Vercel project settings: Root Directory = `cloud`, Framework = Other.
Environment variables: GEMINI_API_KEY, SUPABASE_SERVICE_KEY, ACCESS_PIN (6+ chars).
Optional: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET.

This project is API-only. The UI is the Next.js app in `web/` (deploy it as its own Vercel project; `API_URL` points it at this one). `index.html` here just redirects there.
