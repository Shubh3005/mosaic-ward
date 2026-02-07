# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Mosaic Ward is a HIPAA-compliant patient monitoring system with 3D digital twin visualization. It monitors multiple patient rooms simultaneously, detects falls in real-time using computer vision (MediaPipe), and triggers emergency alerts via Twilio. An AI nurse (LLM via OpenRouter) automatically generates clinical incident reports on fall events.

## Tech Stack

- **Frontend**: Next.js 16 (React 19), Three.js with React Three Fiber/Drei, Tailwind CSS 4, TypeScript
- **Backend**: FastAPI (Python) with async lifespan, Uvicorn ASGI server
- **Vision**: MediaPipe pose detection, OpenCV for video capture
- **Alerts**: Twilio for emergency calls
- **AI**: OpenRouter API (auto-selects free models via `openrouter/free`) for clinical incident reports

## Development Commands

### Frontend (run from `frontend/` directory)
```bash
npm run dev      # Start dev server on localhost:3000
npm run build    # Production build
npm run start    # Start production server
npm run lint     # Run ESLint
```

### Backend (run from root directory)
```bash
source venv/bin/activate   # Activate Python venv
python server.py           # Start FastAPI on localhost:8000
python vision.py           # Start webcam pose detection (Room 304-A)
```

### Full Stack Development
Run in separate terminals:
1. `cd frontend && npm run dev`
2. `python server.py`
3. `python vision.py` (optional - for live camera feed)
4. Open `http://localhost:3000`

## Architecture

### Data Flow
```
┌─────────────────────────────────────────────────────────────────┐
│                         server.py                                │
│  ┌─────────────────┐    ┌─────────────────────────────────────┐ │
│  │ Simulation      │    │ Live Feed (Room 304-A)              │ │
│  │ Engine          │    │                                     │ │
│  │ (Rooms 301-303) │    │  vision.py → WebSocket → server.py  │ │
│  └────────┬────────┘    └──────────────────┬──────────────────┘ │
│           │                                │                     │
│           └───────────┬────────────────────┘                     │
│                       ▼                                          │
│              WebSocket Broadcast                                 │
│                       │                                          │
│           ┌───────────┼───────────┐                              │
│           ▼           ▼           ▼                              │
│     Twilio      OpenRouter    Frontend                           │
│    (on FALL)   (AI Report)   (Dashboard)                         │
└───────────────────────────────────────────────────────────────────┘
```

### Patient Rooms
- **301-A**: James R. - Simulated standing patient (routine monitoring cycle)
- **302-B**: Elena K. - Simulated resting patient (continuous bed rest)
- **303-C**: Robert M. - Simulated patient who randomly falls (demo triggers available)
- **304-A**: Shubham G. - Live camera feed via `vision.py`

### Frontend Structure (`frontend/src/app/`)
- `page.tsx` - Entry point, dynamically imports WardDashboard (SSR disabled)
- `components/WardDashboard.tsx` - Main 2x2 grid dashboard with all patient cards, vitals, AI loading states
- `components/Dashboard.tsx` - Single-patient detail view with terminal-style logs
- `components/DigitalTwin.tsx` - Full-featured single-room 3D visualization with SafeZone, fog, floor grid
- `patient/[roomId]/page.tsx` - Dynamic route for individual patient detail pages
- `family/page.tsx` - Family portal with wellness scores, metrics, and SMS summaries

### Backend Endpoints (`server.py`)
- `GET /api/status` - All room states
- `GET /api/status/{room_id}` - Single room state
- `POST /api/acknowledge/{room_id}` - Nurse acknowledges fall alert
- `POST /api/reset/{room_id}` - Reset room to NORMAL and resolve active incident
- `POST /api/director/fall/{room_id}` - Demo mode: force fall in room 303-C
- `POST /api/analyze_fall` - Manually trigger AI incident report
- `GET /api/incidents` - Paginated incident list with stats (`?limit=&offset=`)
- `GET /api/incidents/{id}` - Single incident details
- `POST /api/incidents/{id}/resolve` - Mark incident resolved
- `GET /api/family/rooms` - Available rooms for family portal
- `GET /api/family/wellness/{room_id}` - Wellness score and metrics
- `POST /api/family/send-summary/{room_id}` - Send SMS wellness update
- `WebSocket /ws/skeleton` - Bidirectional skeleton stream (broadcasts to all clients)

### WebSocket Message Types
- `skeleton_update` - Pose data with landmarks, status, room_id, tracked flag
- `status_update` - Status change broadcast (e.g., after acknowledge or reset)
- `incident_report` - AI-generated clinical report text

### Database (`incidents.db` - SQLite, auto-created on startup)
- **incidents** - Fall events with status (ACTIVE/ACKNOWLEDGED/RESOLVED), AI reports, timestamps
- **wellness_stats** - Daily per-room sleep hours, rest periods, activity events, scores
- **family_subscribers** - Phone numbers subscribed to room updates

### Status States
| Status | Color | Meaning |
|--------|-------|---------|
| `NORMAL` | Cyan | Patient upright, no issues |
| `RESTING` | Amber | Patient lying in safe zone (bed) |
| `FALL` | Red (pulsing) | Patient on floor outside safe zone |
| `ACKNOWLEDGED` | Orange | Fall acknowledged, staff en route |

### Fall Detection Logic (`vision.py`)
1. Checks if patient is horizontal: `abs(nose_y - hip_y) < 0.2`
2. If horizontal, checks hip X position against bed zone: `0.25 < hip_x < 0.75`
3. In bed zone → `RESTING`; outside → `FALL`

### Simulation Engine
- Runs at 10 FPS via `asyncio` background task
- Room 303-C has random fall chance after 500 ticks (or via director API)
- Falls auto-recover after 20 seconds unless acknowledged
- AI incident report automatically generated on simulated falls

### AI Report Generation
- Uses OpenRouter with model fallback chain: `openrouter/free` (meta-router) → Gemma 3 27B → Llama 3.3 70B → Llama 4 Maverick → Mistral Small 3.1 → Qwen QWQ 32B → Nemotron Nano 8B
- Falls back to smart mock generator if all models fail or no API key
- Runs in `asyncio.to_thread()` to avoid blocking
- Reports broadcast via WebSocket `incident_report` message type
- Free models rotate frequently on OpenRouter; 429 rate limits are common (1s retry delay between models)

## Key Conventions

- **HIPAA compliance**: Only pose landmarks (x, y, z, visibility) transmitted, never video
- **Async-first**: AI reports use `asyncio.to_thread()` to avoid blocking
- **Single WebSocket**: All rooms share one connection, routed by `room_id` field
- **Twilio cooldown**: 30-second cooldown, only triggers for live room 304-A
- **Graceful degradation**: AI/Twilio features disabled if env vars missing
- **No SSR for 3D**: Three.js components use `next/dynamic` with `ssr: false`
- **CORS**: Locked to `localhost:3000` and `127.0.0.1:3000`
- **No test framework**: No Jest/pytest configured; testing is manual

## Environment Variables (`.env`)
```
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=...
TO_PHONE_NUMBER=...
OPENROUTER_API_KEY=...
```
