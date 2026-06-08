# Mosaic-Ward

> Privacy-first patient monitoring using computer vision — skeletal tracking at 30fps, sub-100ms WebSocket streaming, zero video stored.

**TartanHacks 2026** · Live at [mosaic-ward.onrender.com](https://mosaic-ward.onrender.com/docs)

---

## The Problem

Hospital falls cost the US healthcare system $50 billion annually. Cameras could prevent most of them — but storing patient video violates HIPAA. Hospitals are flying blind.

The naive solution (record video, review later) fails on two counts: it's a privacy violation, and by the time someone reviews the footage, the patient has already fallen.

---

## The Solution

Track skeletal landmarks, not pixels. MediaPipe extracts 33 body keypoints per frame in real time. The raw video never leaves the device — only the numeric coordinates stream over WebSockets to the backend. No video = no HIPAA exposure.

When a fall is detected, Gemini analyzes the physics data (velocity vectors, impact angle, joint trajectories) and generates a clinical incident report automatically — reducing documentation time by ~20 minutes per event.

---

## Architecture

```
Camera (edge device)
    ↓ MediaPipe pose estimation (33 keypoints, 30fps)
    ↓ [no video transmitted — coordinates only]
WebSocket connection → FastAPI backend
    ↓ fall detection (velocity + angle thresholds)
    ↓ Gemini API → clinical report generation
    ↓ SQLite incident log
React/Three.js dashboard ← real-time 3D skeleton visualization
    ↓ Twilio → voice/SMS alert to nursing staff (<2s)
```

**Key decision: WebSockets over HTTP polling**
Fall detection requires continuous stream analysis — you can't poll at intervals and catch a fall in progress. WebSocket maintains a persistent connection with <100ms round-trip latency, enabling frame-by-frame anomaly detection.

**Key decision: In-memory processing only**
Every frame is processed and discarded. Nothing is written to disk except the final incident record (timestamp, severity, report text). This is HIPAA compliance by architecture, not policy.

---

## Stack

| Layer | Tech |
|-------|------|
| Vision | MediaPipe Pose (Python) |
| Backend | FastAPI, WebSockets |
| AI | Google Gemini (via OpenRouter) |
| Frontend | Next.js, Three.js |
| Alerts | Twilio Voice + SMS |
| Deploy | Docker, Vercel (frontend), Render (backend) |

---

## Why This Is Hard

1. **Real-time constraint** — fall detection is useless if it fires 500ms after impact. MediaPipe inference + WebSocket round-trip + threshold check must complete in <100ms per frame
2. **HIPAA by design** — "we delete the video after" is not compliant. Zero-storage means zero risk. Every architectural decision flows from this constraint
3. **False positive cost** — a fall alert that fires for a patient sitting down trains staff to ignore alerts. Tuning velocity + joint angle thresholds to minimize false positives without missing real falls required extensive testing
4. **3D visualization from 2D camera** — Three.js renders a 3D skeleton from 2D keypoints using depth estimation heuristics. The visual is the primary interface for nursing staff reviewing incidents

---

## Results

- Sub-100ms end-to-end latency (camera → alert)
- 30fps sustained skeletal tracking
- Zero video storage — HIPAA-compliant by architecture
- ~20 min reduction in incident documentation time per event

---

*Built by [Shubham Gupta](https://shubham.us) · Penn State CS, Schreyer Honors College*
