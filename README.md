# Meeting Mario Assistant

A web app that records, transcribes, analyzes, and manages professional meetings.

## Tech Stack

- Vite, React, TypeScript, Tailwind CSS
- Supabase (Auth, Database, Storage, Edge Functions)
- Google Gemini API for AI-powered meeting analysis
- Google Calendar & Google Drive integrations

## Getting Started

```bash
npm install
npm run dev
```

## Environment Variables

- `VITE_SUPABASE_URL` - Supabase project URL
- `VITE_SUPABASE_ANON_KEY` - Supabase anonymous key
- `GEMINI_API_KEY` - Google Gemini API key (for edge function AI analysis)
