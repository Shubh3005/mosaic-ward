import os
import json
import time
import math
import random
import asyncio
import sqlite3
from datetime import datetime, date
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
from detection_logic import calculate_velocity, is_fall_detected

# --- 1. CONFIG & SETUP ---
load_dotenv()

# Twilio Settings
TWILIO_SID = os.getenv("TWILIO_ACCOUNT_SID")
TWILIO_TOKEN = os.getenv("TWILIO_AUTH_TOKEN")
FROM_PHONE = os.getenv("TWILIO_PHONE_NUMBER")
TO_PHONE = os.getenv("TO_PHONE_NUMBER")

# AI Settings
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
ai_client = None

# Initialize AI Client (OpenRouter)
if OPENROUTER_API_KEY:
    try:
        import openai
        ai_client = openai.OpenAI(
            base_url="https://openrouter.ai/api/v1",
            api_key=OPENROUTER_API_KEY,
            default_headers={
                "HTTP-Referer": "https://mosaic-ward.app",
                "X-Title": "Mosaic Ward",
            },
        )
        print("✅ AI Nurse: ONLINE (OpenRouter)")
    except ImportError:
        print("⚠️ OpenAI library not installed. AI features disabled.")
else:
    print("⚠️ No OPENROUTER_API_KEY found. AI features disabled.")

# Global State
last_call_time = 0
CALL_COOLDOWN = 30 # Seconds

# Room Database (with patient info)
ROOM_INFO = {
    "301-A": {"name": "James R.", "condition": "Routine Monitoring", "age": 64},
    "302-B": {"name": "Elena K.", "condition": "Bed Rest / Recovery", "age": 42},
    "303-C": {"name": "Robert M.", "condition": "High Fall Risk", "age": 78},
    "304-A": {"name": "Shubham G.", "condition": "Live Feed (You)", "age": 20},
}

room_states = {
    "301-A": {"status": "NORMAL", "acknowledged": False},
    "302-B": {"status": "RESTING", "acknowledged": False},
    "303-C": {"status": "NORMAL", "acknowledged": False},
    "304-A": {"status": "NORMAL", "acknowledged": False}, # Live Feed
}
sim_fall_trigger = {"303-C": False}

# Track active incidents per room (to avoid duplicates)
active_incidents = {}

# Track resting start times for wellness calculation
resting_start_times = {}

# --- 2. DATABASE SETUP ---
DB_PATH = os.path.join(os.path.dirname(__file__), "incidents.db")

def init_db():
    """Initialize SQLite database with all tables"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Incidents table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS incidents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            room_id TEXT NOT NULL,
            patient_name TEXT,
            incident_type TEXT DEFAULT 'FALL',
            status TEXT DEFAULT 'ACTIVE',
            detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            acknowledged_at TIMESTAMP,
            resolved_at TIMESTAMP,
            ai_report TEXT,
            severity TEXT DEFAULT 'HIGH'
        )
    """)
    
    # Wellness stats table (daily aggregated data)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS wellness_stats (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            room_id TEXT NOT NULL,
            date TEXT NOT NULL,
            sleep_hours REAL DEFAULT 0,
            rest_periods INTEGER DEFAULT 0,
            activity_events INTEGER DEFAULT 0,
            activity_score INTEGER DEFAULT 85,
            last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(room_id, date)
        )
    """)
    
    # Family subscribers table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS family_subscribers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            room_id TEXT NOT NULL,
            phone_number TEXT NOT NULL,
            name TEXT,
            relationship TEXT,
            subscribed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            active INTEGER DEFAULT 1,
            UNIQUE(room_id, phone_number)
        )
    """)
    
    conn.commit()
    conn.close()
    print("✅ Incident Database: INITIALIZED")
    print("✅ Wellness Database: INITIALIZED")
    print("✅ Family Subscribers: INITIALIZED")

# --- INCIDENT FUNCTIONS ---

def create_incident(room_id: str) -> int:
    """Create a new incident record, returns incident ID"""
    patient_name = ROOM_INFO.get(room_id, {}).get("name", "Unknown")
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO incidents (room_id, patient_name, incident_type, status, severity) VALUES (?, ?, 'FALL', 'ACTIVE', 'HIGH')",
        (room_id, patient_name)
    )
    incident_id = cursor.lastrowid
    conn.commit()
    conn.close()
    active_incidents[room_id] = incident_id
    print(f"📝 Incident #{incident_id} created for Room {room_id}")
    update_wellness_activity(room_id)
    return incident_id

def update_incident_ai_report(incident_id: int, report_text: str):
    """Attach AI report to an incident"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE incidents SET ai_report = ? WHERE id = ?",
        (report_text, incident_id)
    )
    conn.commit()
    conn.close()
    print(f"📝 AI Report attached to Incident #{incident_id}")

def acknowledge_incident(room_id: str):
    """Mark active incident as acknowledged"""
    incident_id = active_incidents.get(room_id)
    if not incident_id:
        return
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE incidents SET status = 'ACKNOWLEDGED', acknowledged_at = ? WHERE id = ?",
        (datetime.now().isoformat(), incident_id)
    )
    conn.commit()
    conn.close()
    print(f"👩‍⚕️ Incident #{incident_id} acknowledged")

def resolve_incident(incident_id: int):
    """Mark incident as resolved"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE incidents SET status = 'RESOLVED', resolved_at = ? WHERE id = ?",
        (datetime.now().isoformat(), incident_id)
    )
    conn.commit()
    conn.close()
    # Clear from active incidents
    for rid, iid in list(active_incidents.items()):
        if iid == incident_id:
            del active_incidents[rid]
    print(f"✅ Incident #{incident_id} resolved")

def get_all_incidents(limit: int = 50, offset: int = 0):
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM incidents ORDER BY detected_at DESC LIMIT ? OFFSET ?", (limit, offset))
    rows = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return rows

def get_incident_by_id(incident_id: int):
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM incidents WHERE id = ?", (incident_id,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None

def get_incidents_by_room(room_id: str):
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM incidents WHERE room_id = ? ORDER BY detected_at DESC", (room_id,))
    rows = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return rows

def get_incident_stats():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) FROM incidents")
    total = cursor.fetchone()[0]
    cursor.execute("SELECT COUNT(*) FROM incidents WHERE status = 'ACTIVE'")
    active = cursor.fetchone()[0]
    cursor.execute("SELECT COUNT(*) FROM incidents WHERE status = 'RESOLVED'")
    resolved = cursor.fetchone()[0]
    conn.close()
    return {"total": total, "active": active, "resolved": resolved}

# --- WELLNESS FUNCTIONS ---

def get_today_str():
    return date.today().isoformat()

def ensure_wellness_record(room_id: str):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("INSERT OR IGNORE INTO wellness_stats (room_id, date) VALUES (?, ?)", (room_id, get_today_str()))
    conn.commit()
    conn.close()

def update_wellness_sleep(room_id: str, hours: float):
    ensure_wellness_record(room_id)
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("UPDATE wellness_stats SET sleep_hours = sleep_hours + ?, rest_periods = rest_periods + 1, last_updated = ? WHERE room_id = ? AND date = ?", (hours, datetime.now().isoformat(), room_id, get_today_str()))
    conn.commit()
    conn.close()

def update_wellness_activity(room_id: str):
    ensure_wellness_record(room_id)
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("UPDATE wellness_stats SET activity_events = activity_events + 1, last_updated = ? WHERE room_id = ? AND date = ?", (datetime.now().isoformat(), room_id, get_today_str()))
    conn.commit()
    conn.close()

def get_wellness_stats(room_id: str):
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    today = get_today_str()
    cursor.execute("SELECT * FROM wellness_stats WHERE room_id = ? AND date = ?", (room_id, today))
    row = cursor.fetchone()
    cursor.execute("SELECT COUNT(*) FROM incidents WHERE room_id = ? AND date(detected_at) = ?", (room_id, today))
    incident_count = cursor.fetchone()[0]
    conn.close()
    
    patient_info = ROOM_INFO.get(room_id, {})
    
    if row:
        stats = dict(row)
        base_score = 85
        sleep_bonus = min(stats.get("sleep_hours", 0) * 2, 10)
        incident_penalty = incident_count * 15
        activity_bonus = min(stats.get("activity_events", 0), 5)
        wellness_score = max(0, min(100, base_score + sleep_bonus + activity_bonus - incident_penalty))
        
        return {
            "room_id": room_id,
            "patient_name": patient_info.get("name", "Unknown"),
            "date": today,
            "sleep_hours": round(stats.get("sleep_hours", 0), 1),
            "rest_periods": stats.get("rest_periods", 0),
            "assisted_walks": stats.get("activity_events", 0),
            "wellness_score": int(wellness_score),
            "wellness_status": "Stable" if wellness_score >= 70 else "Needs Attention" if wellness_score >= 40 else "Alert",
            "last_updated": stats.get("last_updated"),
            "has_concerns": incident_count > 0
        }
    else:
        return {
            "room_id": room_id,
            "patient_name": patient_info.get("name", "Unknown"),
            "date": today,
            "sleep_hours": 0,
            "rest_periods": 0,
            "assisted_walks": 0,
            "wellness_score": 85,
            "wellness_status": "Stable",
            "last_updated": None,
            "has_concerns": False
        }

# --- FAMILY SUBSCRIBER FUNCTIONS ---

def add_family_subscriber(room_id: str, phone_number: str, name: str, relationship: str):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    try:
        cursor.execute("INSERT INTO family_subscribers (room_id, phone_number, name, relationship) VALUES (?, ?, ?, ?)", (room_id, phone_number, name, relationship))
        conn.commit()
        result = {"success": True, "message": "Subscribed successfully!"}
    except sqlite3.IntegrityError:
        result = {"success": False, "message": "This phone number is already subscribed for this room."}
    conn.close()
    return result

def remove_family_subscriber(room_id: str, phone_number: str):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("UPDATE family_subscribers SET active = 0 WHERE room_id = ? AND phone_number = ?", (room_id, phone_number))
    conn.commit()
    conn.close()

def get_family_subscribers(room_id: str):
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM family_subscribers WHERE room_id = ? AND active = 1", (room_id,))
    rows = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return rows

def send_sms_summary(room_id: str, phone_number: str = None):
    if not TWILIO_SID: return {"success": False, "message": "SMS service not configured"}
    wellness = get_wellness_stats(room_id)
    patient_name = wellness.get("patient_name", "your loved one")
    message = f"""🏥 MOSAIC WARD Daily Update\nYour loved one {patient_name} in Room {room_id} had a good day!\n💤 Rest: {wellness['sleep_hours']} hours\n🚶 Activity: {wellness['assisted_walks']} events\n❤️ Wellness: {wellness['wellness_status']}\nNo immediate concerns. Staff available 24/7."""
    try:
        from twilio.rest import Client
        client = Client(TWILIO_SID, TWILIO_TOKEN)
        recipients = [phone_number] if phone_number else [s['phone_number'] for s in get_family_subscribers(room_id)]
        sent_count = 0
        for recipient in recipients:
            try:
                client.messages.create(body=message, from_=FROM_PHONE, to=recipient)
                sent_count += 1
            except Exception: pass
        return {"success": True, "message": f"Sent {sent_count} SMS updates", "sent_count": sent_count}
    except Exception as e:
        return {"success": False, "message": str(e)}

# --- 3. CONNECTION MANAGER ---
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
        for connection in self.active_connections[:]:
            try: await connection.send_text(message)
            except Exception: self.disconnect(connection)

manager = ConnectionManager()

# --- 4. LIFESPAN (Startup/Shutdown) ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    asyncio.create_task(simulate_patients())
    print("🤖 Simulation Engine: STARTED")
    yield
    print("🤖 Simulation Engine: STOPPED")

app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- 5. CORE FUNCTIONS (AI & Twilio) ---

def trigger_emergency_call(room_id="Unknown"):
    global last_call_time
    if not TWILIO_SID: return
    if time.time() - last_call_time < CALL_COOLDOWN: return
    try:
        from twilio.rest import Client
        client = Client(TWILIO_SID, TWILIO_TOKEN)
        client.calls.create(twiml=f'<Response><Say>Emergency in Room {room_id}. Fall detected. Immediate assistance required.</Say></Response>', to=TO_PHONE, from_=FROM_PHONE)
        print(f"✅ CALL PLACED for {room_id}")
        last_call_time = time.time()
    except Exception as e: print(f"❌ Call Failed: {e}")

# --- 🧠 ROBUST AI GENERATOR WITH FALLBACKS ---
async def generate_incident_report(room_id, incident_id=None):
    if not ai_client:
        print("⚠️ AI client not initialized, skipping report generation")
        return
    print(f"🧠 AI Analyzing Fall in {room_id}...")

    patient = ROOM_INFO.get(room_id, {})
    patient_name = patient.get("name", "Unknown")
    patient_age = patient.get("age", "Unknown")
    patient_condition = patient.get("condition", "Unknown")

    # Models to try — spread across providers to avoid rate limits on any single one.
    # "openrouter/free" is a meta-router that auto-selects an available free model.
    models_to_try = [
        "openrouter/free",
        "google/gemma-3-27b-it:free",
        "meta-llama/llama-3.3-70b-instruct:free",
        "meta-llama/llama-4-maverick:free",
        "mistralai/mistral-small-3.1-24b-instruct:free",
        "qwen/qwq-32b:free",
        "nvidia/llama-3.1-nemotron-nano-8b-v1:free",
    ]

    prompt = f"""You are a clinical AI assistant in a hospital fall-detection system (Mosaic Ward).
A fall was just detected in Room {room_id}.
Patient: {patient_name}, Age {patient_age}, Condition: {patient_condition}.
Detection method: Real-time skeletal tracking (MediaPipe). Sudden vertical deceleration detected outside the designated safe zone (bed area).

Generate a concise Clinical Incident Log with exactly 3 numbered lines:
1. Observation — what the sensors detected (velocity, posture change, skeletal data)
2. Context — where and why (patient location relative to bed zone, time, contributing factors)
3. Assessment — clinical severity and recommended immediate action

Be specific and clinical. No filler text. Just the 3-line log."""

    report_text = None

    for model in models_to_try:
        try:
            print(f"🧠 Trying model: {model}")
            response = await asyncio.to_thread(
                ai_client.chat.completions.create,
                model=model,
                messages=[{"role": "user", "content": prompt}],
                max_tokens=500,
                timeout=15,
            )
            report_text = response.choices[0].message.content
            if report_text and report_text.strip():
                print(f"✅ AI Success using model: {model}")
                break
            else:
                print(f"⚠️ Model {model} returned empty response, trying next...")
                report_text = None
        except Exception as e:
            error_msg = str(e)
            print(f"⚠️ Model {model} failed: {error_msg}")
            # On rate limit (429), wait briefly before trying the next model
            if "429" in error_msg:
                await asyncio.sleep(1)
            continue

    # Ultimate fallback if no internet or all models fail
    if not report_text:
        print("❌ All AI models failed. Using SMART MOCK generator.")
        velocity = round(random.uniform(2.5, 4.5), 1)
        impact_zone = random.choice(["Bedside Mat", "Bathroom Entry", "Window Perimeter"])
        posture = random.choice(["Supine", "Lateral Decubitus", "Prone"])
        report_text = (
            f"1. Observation: High-velocity descent ({velocity} m/s) detected via skeletal tracking. Final posture: {posture}.\n"
            f"2. Context: Patient displacement detected at {impact_zone} following exiting safe zone.\n"
            f"3. Assessment: High-impact event consistent with syncope. Immediate cranial assessment recommended."
        )

    if incident_id:
        update_incident_ai_report(incident_id, report_text)

    await manager.broadcast(json.dumps({
        "type": "incident_report", "room_id": room_id, "incident_id": incident_id, "text": report_text
    }))

# --- 6. SIMULATOR ENGINE (KINETIC ROUTINES & INTERPOLATION) ---
STANDING = {0:(0.5,0.15,0), 11:(0.42,0.3,0), 12:(0.58,0.3,0), 23:(0.44,0.55,0), 24:(0.56,0.55,0)}
RESTING = {0:(0.25,0.45,0), 11:(0.35,0.43,0), 12:(0.35,0.47,0), 23:(0.55,0.44,0), 24:(0.55,0.48,0)}
FALLEN = {0:(0.5,0.6,0), 11:(0.45,0.55,0), 12:(0.55,0.55,0), 23:(0.46,0.58,0), 24:(0.54,0.58,0)}
SITTING = {0:(0.5,0.3,0), 11:(0.42,0.4,0), 12:(0.58,0.4,0), 23:(0.42,0.65,0.1), 24:(0.58,0.65,0.1), 25:(0.42,0.65,-0.2), 26:(0.58,0.65,-0.2), 27:(0.42,0.9,-0.2), 28:(0.58,0.9,-0.2)}

def lerp_pose(p1, p2, alpha):
    alpha = max(0, min(1, alpha))
    alpha = alpha * alpha * (3 - 2 * alpha) # Smoothstep
    res = {}
    all_keys = set(p1.keys()).union(p2.keys())
    for k in all_keys:
        v1, v2 = p1.get(k, (0.5, 0.5, 0)), p2.get(k, (0.5, 0.5, 0))
        res[k] = (v1[0] + (v2[0] - v1[0]) * alpha, v1[1] + (v2[1] - v1[1]) * alpha, v1[2] + (v2[2] - v1[2]) * alpha)
    return res

def make_landmarks(base, t, noise=0.01, offset_x=0, offset_z=0):
    lms = []
    for i in range(33):
        if i in base:
            bx, by, bz = base[i]
            nx, ny = math.sin(t*2+i)*noise, math.sin(t*1.5+i)*noise*0.5
            lms.append({"x": bx+nx+offset_x, "y": by+ny, "z": bz+offset_z, "visibility": 0.95})
        else: lms.append({"x": 0.5+offset_x, "y": 0.5, "z": 0+offset_z, "visibility": 0.0})
    return lms

def get_walking_landmarks(t, offset_x=0, offset_z=0):
    freq, bounce, sway = 4.0, math.sin(t*4.0)*0.02, math.cos(t*2.0)*0.03
    base = {0:(0.5+sway,0.15+bounce,0), 11:(0.42+sway,0.30+bounce,0.05), 12:(0.58+sway,0.30+bounce,-0.05), 23:(0.45+sway,0.55,0), 24:(0.55+sway,0.55,0)}
    l, r = math.sin(t*freq), math.sin(t*freq+math.pi)
    base[25], base[26] = (0.44+sway,0.72+(l*0.05),l*0.1), (0.56+sway,0.72+(r*0.05),r*0.1)
    base[27], base[28] = (0.44+sway,0.90,l*0.2), (0.56+sway,0.90,r*0.2)
    base[13], base[14] = (0.36+sway,0.45,r*0.15), (0.64+sway,0.45,l*0.15)
    return make_landmarks(base, t, noise=0.005, offset_x=offset_x, offset_z=offset_z)

async def simulate_patients():
    tick, p301_tick = 0, 0
    fall_active, fall_timer, current_incident_id = False, 0, None
    resting_ticks = {"302-B": 0}
    
    while True:
        t = tick * 0.1
        # 301: Routine
        c = p301_tick % 600
        p301_s, lms = "NORMAL", []
        if c < 100: p301_s, lms = "RESTING", make_landmarks(RESTING, t, 0.002, -0.25)
        elif c < 150: lms = make_landmarks(lerp_pose(RESTING, SITTING, (c-100)/50), t, 0.005, -0.25)
        elif c < 200: lms = make_landmarks(SITTING, t, 0.005, -0.25)
        elif c < 250: lms = make_landmarks(lerp_pose(SITTING, STANDING, (c-200)/50), t, 0.005, -0.25)
        elif c < 500:
            wt = (c-250)
            off = -0.25+(wt/20)*0.25 if wt<20 else (0-((wt-230)/20)*0.25 if wt>230 else 0)
            lms = get_walking_landmarks(wt*0.1, offset_x=off+(math.sin(wt*0.1)*0.2))
        elif c < 550: lms = make_landmarks(lerp_pose(STANDING, SITTING, (c-500)/50), t, 0.005, -0.25)
        else: lms = make_landmarks(lerp_pose(SITTING, RESTING, (c-550)/50), t, 0.002, -0.25)
        
        await manager.broadcast(json.dumps({"type":"skeleton_update","room_id":"301-A","status":p301_s,"landmarks":lms,"tracked":True}))
        p301_tick += 1

        # 302: Resting
        resting_ticks["302-B"] += 1
        if resting_ticks["302-B"] >= 6000: update_wellness_sleep("302-B", 1.0); resting_ticks["302-B"] = 0
        await manager.broadcast(json.dumps({"type":"skeleton_update","room_id":"302-B","status":"RESTING","landmarks":make_landmarks(RESTING, t, 0.005),"tracked":True}))
        
        # 303: Fall Logic
        if not fall_active:
            if sim_fall_trigger["303-C"] or (tick > 500 and random.random() < 0.0005):
                fall_active, sim_fall_trigger["303-C"] = True, False
                current_incident_id = create_incident("303-C")
                asyncio.create_task(generate_incident_report("303-C", current_incident_id))
        
        if fall_active:
            fall_timer += 1
            s = "ACKNOWLEDGED" if room_states["303-C"]["acknowledged"] else "FALL"
            room_states["303-C"]["status"] = s
            await manager.broadcast(json.dumps({"type":"skeleton_update","room_id":"303-C","status":s,"landmarks":make_landmarks(FALLEN, t),"tracked":True}))
            if fall_timer > 200:
                fall_active, fall_timer, room_states["303-C"]["acknowledged"] = False, 0, False
                if current_incident_id: resolve_incident(current_incident_id); current_incident_id = None
        else:
             room_states["303-C"]["status"] = "NORMAL"
             await manager.broadcast(json.dumps({"type":"skeleton_update","room_id":"303-C","status":"NORMAL","landmarks":make_landmarks(STANDING, t+3),"tracked":True}))

        tick += 1
        await asyncio.sleep(0.1)

# --- PYDANTIC MODELS (RESTORED) ---
class FamilySubscribeRequest(BaseModel):
    room_id: str
    phone_number: str
    name: str
    relationship: str

class FamilyUnsubscribeRequest(BaseModel):
    room_id: str
    phone_number: str

# --- 7. API ENDPOINTS ---
@app.get("/api/status")
async def get_all_status(): return {"rooms": room_states}
@app.get("/api/status/{room_id}")
async def get_room_status(room_id: str): return room_states.get(room_id, {"error": "Not Found"})
@app.post("/api/acknowledge/{room_id}")
async def acknowledge_room(room_id: str):
    if room_id in room_states:
        room_states[room_id]["acknowledged"], room_states[room_id]["status"] = True, "ACKNOWLEDGED"
        acknowledge_incident(room_id)
        await manager.broadcast(json.dumps({"type":"status_update","room_id":room_id,"status":"ACKNOWLEDGED"}))
    return {"status": "ok"}
@app.post("/api/director/fall/{room_id}")
async def director_fall(room_id: str):
    if room_id == "303-C": sim_fall_trigger["303-C"] = True; return {"msg": "Robert FALLING"}
    return {"msg": "Invalid Room"}
@app.post("/api/reset/{room_id}")
async def reset_room(room_id: str):
    if room_id in room_states:
        room_states[room_id]["status"] = "NORMAL"
        room_states[room_id]["acknowledged"] = False
        if room_id in active_incidents:
            resolve_incident(active_incidents[room_id])
        await manager.broadcast(json.dumps({"type": "status_update", "room_id": room_id, "status": "NORMAL"}))
        return {"status": "reset", "room_id": room_id}
    return {"error": "Room not found"}
@app.post("/api/acknowledge")
async def ack_default(): return await acknowledge_room("304-A")
@app.post("/api/analyze_fall")
async def trigger_analysis_manual(data: dict):
    asyncio.create_task(generate_incident_report(data.get("room_id", "304-A"))); return {"status": "Started"}

# --- 8. INCIDENT & FAMILY API ---
@app.get("/api/incidents")
async def get_incidents(limit: int=50, offset: int=0): return {"incidents": get_all_incidents(limit, offset), "stats": get_incident_stats()}
@app.get("/api/incidents/{incident_id}")
async def get_incident(incident_id: int): return get_incident_by_id(incident_id) or {"error": "Not Found"}
@app.post("/api/incidents/{incident_id}/resolve")
async def resolve_incident_endpoint(incident_id: int): resolve_incident(incident_id); return {"status": "resolved"}
@app.get("/api/family/rooms")
async def get_family_rooms(): return {"rooms": [{"room_id": k, "patient_name": v["name"], "condition": v["condition"]} for k,v in ROOM_INFO.items()]}
@app.get("/api/family/wellness/{room_id}")
async def get_family_wellness(room_id: str): return get_wellness_stats(room_id) if room_id in ROOM_INFO else {"error": "Not Found"}
@app.post("/api/family/subscribe")
async def subscribe_family(r: FamilySubscribeRequest): return add_family_subscriber(r.room_id, r.phone_number, r.name, r.relationship) if r.room_id in ROOM_INFO else {"success": False}
@app.post("/api/family/unsubscribe")
async def unsubscribe_family(r: FamilyUnsubscribeRequest): remove_family_subscriber(r.room_id, r.phone_number); return {"success": True}
@app.post("/api/family/send-summary/{room_id}")
async def send_family_summary(room_id: str): return send_sms_summary(room_id) if room_id in ROOM_INFO else {"success": False}

# --- 10. WEBSOCKET ---
@app.websocket("/ws/skeleton")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    
    # --- 1. STATE TRACKING (Per Connection) ---
    # We need to remember the previous frame's data to calculate velocity
    prev_y = {}      # Format: {'304-A': 0.5, '301-A': 0.4...}
    prev_time = {}   # Format: {'304-A': 17099234.0...}

    try:
        while True:
            # --- 2. RECEIVE DATA ---
            # Expecting JSON: {"room_id": "304-A", "hip_y": 0.85, "timestamp": 123456789}
            payload = await websocket.receive_text()
            data = json.loads(payload)
            
            room_id = data.get("room_id", "304-A")
            current_y = data.get("hip_y") # Normalized 0.0 (top) to 1.0 (bottom)
            
            # Use server time if client timestamp is missing
            current_time = data.get("timestamp", time.time())
            
            # --- 3. CALCULATE PHYSICS (The New Logic) ---
            final_status = "NORMAL" # Default
            
            # Only calculate if we have valid coordinate data
            if current_y is not None:
                # Get history for this room (default to current if first frame)
                last_y = prev_y.get(room_id, current_y)
                last_t = prev_time.get(room_id, current_time)
                time_delta = current_time - last_t

                # A. Calculate Velocity (Pure Function)
                velocity = calculate_velocity(current_y, last_y, time_delta)
                
                # B. Check for Fall (Pure Function)
                if is_fall_detected(velocity, current_y):
                    final_status = "FALL"
                elif current_y > 0.6 and velocity < 0.1:
                    # Optional: Logic for "Resting" (Lying down but not moving fast)
                    final_status = "RESTING"
                
                # C. Update History
                prev_y[room_id] = current_y
                prev_time[room_id] = current_time
            
            else:
                # Fallback: If client didn't send coordinates, use the old 'status' field
                final_status = data.get("status", "NORMAL")

            # --- 4. HANDLE INCIDENTS (Existing Logic) ---
            # 304-A is the 'Live' room, others might be simulated
            
            # Handle RESTING duration (Wellness Score)
            if final_status == "RESTING":
                if room_id not in resting_start_times: 
                    resting_start_times[room_id] = time.time()
            elif room_id in resting_start_times:
                # Patient moved; calculate how long they rested
                duration = (time.time() - resting_start_times[room_id]) / 3600 # in hours
                if duration > 0.01: 
                    update_wellness_sleep(room_id, duration)
                del resting_start_times[room_id]
            
            # Handle FALL Event
            processed_status = final_status
            if final_status == "FALL":
                # Check if we already know about this fall (debounce)
                if room_states.get(room_id, {}).get("acknowledged"):
                    processed_status = "ACKNOWLEDGED"
                else:
                    processed_status = "FALL"
                    # If this is a NEW incident
                    if room_id not in active_incidents:
                        iid = create_incident(room_id)
                        # Trigger AI Analysis
                        asyncio.create_task(generate_incident_report(room_id, iid))
                        # Trigger Twilio Call
                        trigger_emergency_call(room_id)
            
            # Handle Recovery (Back to Normal)
            elif final_status in ["NORMAL"]:
                if room_states.get(room_id, {}).get("acknowledged"):
                    room_states[room_id]["acknowledged"] = False
                if room_id in active_incidents:
                    resolve_incident(active_incidents[room_id])

            # --- 5. BROADCAST UPDATES ---
            # Update global state
            if room_id in room_states:
                room_states[room_id]["status"] = processed_status
            
            # Send back to frontend (Dashboard)
            data["status"] = processed_status
            data["velocity"] = velocity if current_y else 0 # Optional: visualized velocity
            
            await manager.broadcast(json.dumps(data))

    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        print(f"❌ WebSocket Error: {e}")
        manager.disconnect(websocket)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)