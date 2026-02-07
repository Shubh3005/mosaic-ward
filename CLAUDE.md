# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Mosaic Ward is a HIPAA-compliant patient monitoring system with 3D digital twin visualization. It monitors multiple patient rooms simultaneously, detects falls in real-time using computer vision (MediaPipe), and triggers emergency alerts via Twilio. An AI nurse (LLM via OpenRouter) generates clinical incident reports.

## Tech Stack

- **Frontend**: Next.js 16 (React 19), Three.js with React Three Fiber/Drei, Tailwind CSS 4, TypeScript
- **Backend**: FastAPI (Python), Uvicorn ASGI server
- **Vision**: MediaPipe pose detection, OpenCV for video capture
- **Alerts**: Twilio for emergency calls
- **AI**: OpenRouter API (Llama 3) for clinical incident reports

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
│           ┌───────────┴───────────┐                              │
│           ▼                       ▼                              │
│    Twilio (on FALL)      OpenRouter (AI Report)                  │
└───────────────────────────────────────────────────────────────────┘
                       │
                       ▼
              WardDashboard.tsx (2×2 grid of rooms)
```

### Patient Rooms
- **301-A, 302-B, 303-C**: Simulated patients (backend generates skeleton data)
- **304-A**: Live camera feed via `vision.py`

### Frontend Structure (`frontend/src/app/`)
- `page.tsx` - Entry point, dynamically imports WardDashboard
- `components/WardDashboard.tsx` - Main 2×2 grid dashboard with all patient cards
- `components/DigitalTwin.tsx` - Single-room 3D skeleton visualization (used in detail views)

### Backend Endpoints (`server.py`)
- `GET /api/status` - All room states
- `POST /api/acknowledge/{room_id}` - Nurse acknowledges fall alert
- `POST /api/director/fall/{room_id}` - Demo mode: force a fall in room 303-C
- `POST /api/analyze_fall` - Trigger LLM to generate clinical incident report
- `WebSocket /ws/skeleton` - Bidirectional skeleton data stream (broadcasts to all clients)

### Status States
- `NORMAL` - Patient upright, no issues (cyan)
- `RESTING` - Patient lying in safe zone/bed (amber)
- `FALL` - Patient on floor outside safe zone (red, pulsing)
- `ACKNOWLEDGED` - Fall acknowledged by staff, help en route (orange)

### Fall Detection Logic (`vision.py`)
1. Checks if patient is horizontal (nose Y ≈ hip Y, difference < 0.2)
2. If horizontal, checks if hips are within "bed zone" (center 50% of frame: x ∈ [0.25, 0.75])
3. In bed zone → RESTING; outside → FALL

## Key Conventions

- **HIPAA compliance**: Only pose landmarks (x, y, z coordinates) transmitted, never video frames
- **Multi-room WebSocket**: Single connection routes data by `room_id` field
- **Simulation engine**: Runs on server startup, animates rooms 301-303 at 10 FPS
- **Twilio cooldown**: 30-second cooldown between emergency calls (only triggers for live room 304-A)

## Environment Variables (`.env`)
```
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=...
TO_PHONE_NUMBER=...
OPENROUTER_API_KEY=...
```
