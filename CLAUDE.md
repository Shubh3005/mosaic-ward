# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Mosaic Ward is a HIPAA-compliant patient monitoring system with a 3D digital twin visualization. It detects patient falls in real-time using computer vision (MediaPipe) and triggers emergency alerts via Twilio.

## Tech Stack

- **Frontend**: Next.js 16 (React 19), Three.js with React Three Fiber, Tailwind CSS 4, TypeScript
- **Backend**: FastAPI (Python), Uvicorn ASGI server
- **Vision**: MediaPipe pose detection, OpenCV for video capture
- **Alerts**: Twilio for emergency calls/SMS

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
python vision.py           # Start webcam pose detection client
```

### Full Stack Development
Run these in separate terminals:
1. `cd frontend && npm run dev`
2. `python server.py`
3. `python vision.py`
4. Open `http://localhost:3000`

## Architecture

### Data Flow
```
Webcam → vision.py (MediaPipe) → WebSocket → server.py (FastAPI) → WebSocket → DigitalTwin.tsx (Three.js)
                                                    ↓
                                            Twilio (on fall)
```

### Frontend Structure (`frontend/src/app/`)
- `page.tsx` - Main dashboard with bento grid layout, real-time status polling
- `components/DigitalTwin.tsx` - Three.js 3D skeleton visualization with WebSocket connection to `ws://localhost:8000/ws/skeleton`
- Uses dynamic import (`next/dynamic`) to disable SSR for Three.js component

### Backend Endpoints (`server.py`)
- `GET /api/status` - Current system state (NORMAL/FALL)
- `POST /api/reset` - Reset alarm to NORMAL
- `WebSocket /ws/skeleton` - Bidirectional skeleton data stream

### Fall Detection Logic (`vision.py`)
Compares nose Y position to mid-hip Y position. If difference < 0.2, triggers FALL status which initiates Twilio emergency call (30s cooldown).

## Key Conventions

- **HIPAA compliance**: Only pose landmarks (x, y, z coordinates) are transmitted, never video frames
- **WebSocket resilience**: Frontend falls back to HTTP polling if WebSocket disconnects
- **3D coordinate system**: MediaPipe 33 landmarks mapped to Three.js spheres with bone connections
- **Alert colors**: Cyan (#00e5ff) for normal, red (#ef4444) for fall detection

## Environment Variables (`.env`)
```
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_FROM_NUMBER=...
EMERGENCY_TO_NUMBER=...
```
