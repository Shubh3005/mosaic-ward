import os
import json
import time
import math
import random
import asyncio
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import openai 

load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
#AI NURSE Settings

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")

# Configure Client
ai_client = openai.OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=OPENROUTER_API_KEY,
)

@app.post("/api/analyze_fall")
async def analyze_fall_event(data: dict):
    """
    Sends skeleton data to LLM to generate a Clinical Incident Report.
    """
    room_id = data.get("room_id")
    
    # We cheat a bit: We don't send all detection numbers (too token heavy).
    # We send a summary describing the fall context.
    prompt = f"""
    You are a clinical AI assistant. A fall was detected in Room {room_id}.
    The detection detected:
    - Status: FALL DETECTED
    - Location: Outside Safe Zone (Floor)
    - Velocity: High (Sudden Impact)
    
    Write a concise, 2-sentence medical incident report for the nurse. 
    Use professional medical terminology (e.g., "ambulatory mismatch", "rapid deceleration").
    Do not offer advice, just state the observed event for the log.
    """
    
    try:
        response = ai_client.chat.completions.create(
            model="meta-llama/llama-3-8b-instruct:free", # Free & Fast
            messages=[{"role": "user", "content": prompt}],
        )
        report = response.choices[0].message.content
        print(f"📝 AI REPORT: {report}")
        
        # Broadcast the report to the dashboard
        await manager.broadcast(json.dumps({
            "type": "incident_report",
            "room_id": room_id,
            "text": report
        }))
        
        return {"report": report}
    except Exception as e:
        print(f"❌ AI Error: {e}")
        return {"error": str(e)}
# --- CONFIG ---
# Twilio Settings
TWILIO_SID = os.getenv("TWILIO_ACCOUNT_SID")
TWILIO_TOKEN = os.getenv("TWILIO_AUTH_TOKEN")
FROM_PHONE = os.getenv("TWILIO_PHONE_NUMBER")
TO_PHONE = os.getenv("TO_PHONE_NUMBER")

# Global Timers
last_call_time = 0
CALL_COOLDOWN = 3000 # Set to 30s for demo, 3000s for dev

# ═══════════════════════════════════════════════════════
#  Per-Room State (The "Database")
# ═══════════════════════════════════════════════════════

PATIENTS = {
    "301-A": {"name": "James R.", "condition": "Stable"},
    "302-B": {"name": "Elena K.", "condition": "Bed Rest"},
    "303-C": {"name": "Robert M.", "condition": "High Risk"},
    "304-A": {"name": "Martha V.", "condition": "Live Feed"}, # <--- THIS IS YOU
}

room_states = {
    "301-A": {"status": "NORMAL", "acknowledged": False},
    "302-B": {"status": "RESTING", "acknowledged": False},
    "303-C": {"status": "NORMAL", "acknowledged": False},
    "304-A": {"status": "NORMAL", "acknowledged": False}, # Your Room
}

# Simulation Control Flags (For Director Mode)
sim_fall_trigger = {"303-C": False}

# ═══════════════════════════════════════════════════════
#  Connection Manager
# ═══════════════════════════════════════════════════════

class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: str):
        # iterate over copy to avoid modification errors
        for connection in self.active_connections[:]:
            try:
                await connection.send_text(message)
            except Exception:
                self.disconnect(connection)

manager = ConnectionManager()

# ═══════════════════════════════════════════════════════
#  Twilio Logic
# ═══════════════════════════════════════════════════════

def trigger_emergency_call(room_id="Unknown"):
    global last_call_time
    if not TWILIO_SID:
        print("❌ Twilio not configured in .env")
        return
    
    if time.time() - last_call_time < CALL_COOLDOWN:
        print("⏳ Call on cooldown... skipping.")
        return

    try:
        from twilio.rest import Client
        client = Client(TWILIO_SID, TWILIO_TOKEN)
        msg = f'<Response><Say>Emergency alert. Fall detected in Room {room_id}. Immediate assistance required.</Say></Response>'
        
        call = client.calls.create(
            twiml=msg,
            to=TO_PHONE,
            from_=FROM_PHONE,
        )
        print(f"✅ CALL PLACED for {room_id}: {call.sid}")
        last_call_time = time.time()
    except Exception as e:
        print(f"❌ Call failed: {e}")

# ═══════════════════════════════════════════════════════
#  Simulation Engine (Generates Fake Skeletons)
# ═══════════════════════════════════════════════════════

# Base Poses
STANDING = {0:(0.5,0.15,0), 11:(0.42,0.3,0), 12:(0.58,0.3,0), 23:(0.44,0.55,0), 24:(0.56,0.55,0)}
RESTING = {0:(0.25,0.45,0), 11:(0.35,0.43,0), 12:(0.35,0.47,0), 23:(0.55,0.44,0), 24:(0.55,0.48,0)}
FALLEN = {0:(0.5,0.6,0), 11:(0.45,0.55,0), 12:(0.55,0.55,0), 23:(0.46,0.58,0), 24:(0.54,0.58,0)}

def make_landmarks(base, t, noise=0.01):
    lms = []
    for i in range(33):
        if i in base:
            bx, by, bz = base[i]
            # Add subtle sine wave motion (breathing/sway)
            nx = math.sin(t*2 + i)*noise
            ny = math.sin(t*1.5 + i)*noise*0.5
            lms.append({"x": bx+nx, "y": by+ny, "z": bz, "visibility": 0.95})
        else:
            # Fill unused joints with hidden data
            lms.append({"x": 0.5, "y": 0.5, "z": 0, "visibility": 0.0})
    return lms

async def simulate_patients():
    """Runs in background to animate Rooms 301, 302, 303"""
    print("🤖 Simulation Engine Started (Rooms 301-303)")
    tick = 0
    fall_active = False
    fall_timer = 0

    while True:
        t = tick * 0.1
        
        # Room 301: James (Standing)
        await manager.broadcast(json.dumps({
            "type": "skeleton_update", "room_id": "301-A",
            "status": "NORMAL", "landmarks": make_landmarks(STANDING, t), "tracked": True
        }))

        # Room 302: Elena (Resting)
        await manager.broadcast(json.dumps({
            "type": "skeleton_update", "room_id": "302-B",
            "status": "RESTING", "landmarks": make_landmarks(RESTING, t, 0.005), "tracked": True
        }))

        # Room 303: Robert (The Trouble Maker)
        # Check Director Trigger OR Random Chance (very low)
        if not fall_active:
            if sim_fall_trigger["303-C"] or (tick > 200 and random.random() < 0.001):
                fall_active = True
                sim_fall_trigger["303-C"] = False # Reset trigger
                print("🔴 [SIM] Robert (303-C) FALL DETECTED")

        # Handle Robert's State
        if fall_active:
            fall_timer += 1
            status = "ACKNOWLEDGED" if room_states["303-C"]["acknowledged"] else "FALL"
            room_states["303-C"]["status"] = status
            
            await manager.broadcast(json.dumps({
                "type": "skeleton_update", "room_id": "303-C",
                "status": status, "landmarks": make_landmarks(FALLEN, t), "tracked": True
            }))
            
            # Auto-recover after 15 seconds (150 ticks)
            if fall_timer > 150:
                fall_active = False
                fall_timer = 0
                room_states["303-C"]["acknowledged"] = False
                print("🟢 [SIM] Robert (303-C) Recovered")
        else:
            # Robert Standing
            room_states["303-C"]["status"] = "NORMAL"
            await manager.broadcast(json.dumps({
                "type": "skeleton_update", "room_id": "303-C",
                "status": "NORMAL", "landmarks": make_landmarks(STANDING, t+3), "tracked": True
            }))

        tick += 1
        await asyncio.sleep(0.1) # 10 FPS

@app.on_event("startup")
async def start_sim():
    asyncio.create_task(simulate_patients())

# ═══════════════════════════════════════════════════════
#  API Endpoints
# ═══════════════════════════════════════════════════════

@app.get("/api/status")
async def get_all_status():
    return {"rooms": room_states}

@app.post("/api/acknowledge/{room_id}")
async def acknowledge_room(room_id: str):
    if room_id in room_states:
        room_states[room_id]["acknowledged"] = True
        room_states[room_id]["status"] = "ACKNOWLEDGED"
        await manager.broadcast(json.dumps({
            "type": "status_update", "room_id": room_id, "status": "ACKNOWLEDGED"
        }))
        print(f"👩‍⚕️ Nurse Acknowledged: {room_id}")
    return {"status": "ok"}

@app.post("/api/director/fall/{room_id}")
async def director_force_fall(room_id: str):
    """Cheat Code for Demos: Forces a specific room to fall"""
    if room_id == "303-C":
        sim_fall_trigger["303-C"] = True
        return {"msg": "Robert will fall in 3...2...1..."}
    return {"msg": "Only Room 303-C supports forced falls"}

# Backward compatibility
@app.post("/api/acknowledge")
async def ack_default():
    return await acknowledge_room("304-A")

# ═══════════════════════════════════════════════════════
#  WebSocket (Your Live Feed)
# ═══════════════════════════════════════════════════════

@app.websocket("/ws/skeleton")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            data = json.loads(await websocket.receive_text())
            
            # Default to Room 304-A (Your Live Camera)
            room_id = data.get("room_id", "304-A")
            raw_status = data.get("status", "NORMAL")

            # Update State
            current_state = room_states.get(room_id, {})
            
            final_status = raw_status
            
            if raw_status == "FALL":
                if current_state.get("acknowledged"):
                    final_status = "ACKNOWLEDGED"
                else:
                    final_status = "FALL"
                    # Trigger Twilio only for the LIVE room to save credits/spam
                    if room_id == "304-A":
                        trigger_emergency_call(room_id)
            
            elif raw_status in ["NORMAL", "RESTING"]:
                # Auto-Reset
                if current_state.get("acknowledged"):
                    room_states[room_id]["acknowledged"] = False
                final_status = raw_status

            # Save
            if room_id in room_states:
                room_states[room_id]["status"] = final_status

            # Broadcast to Dashboard
            data["status"] = final_status
            data["room_id"] = room_id
            await manager.broadcast(json.dumps(data))

    except WebSocketDisconnect:
        manager.disconnect(websocket)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)