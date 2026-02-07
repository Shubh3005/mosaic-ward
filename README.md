# Mosaic-Ward 🏥
**Privacy-First Autonomous Patient Monitoring System**

> 🏆 TartanHacks 2026 Submission

![Dashboard](https://raw.githubusercontent.com/Shubh3005/mosaic-ward/main/screenshots/dashboard.png) 

## 💡 The Problem
Hospital falls cost the US healthcare system **$50 billion annually**. Cameras could prevent them, but they violate **HIPAA privacy regulations**. Hospitals are flying blind.

## 🛡️ The Solution
Mosaic-Ward uses **Computer Vision** to track **skeletal landmarks** (not video), creating a privacy-safe "Digital Twin."
- **Privacy-First:** No video is ever stored.
- **AI-Powered:** Generative AI analyzes fall physics to write clinical reports.
- **Real-Time:** Twilio voice alerts in <2 seconds.

## ⚙️ Tech Stack
- **Vision:** Python, MediaPipe
- **Backend:** FastAPI, WebSockets
- **Frontend:** Next.js, Three.js
- **AI:** Google Gemini (via OpenRouter)
- **Notifications:** Twilio Voice & SMS

## 🚀 How to Run
1. `pip install -r requirements.txt`
2. `python server.py`
3. `npm run dev`