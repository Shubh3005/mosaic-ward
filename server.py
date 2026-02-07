import os
import json
import time
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from twilio.rest import Client

load_dotenv()

app = FastAPI()

# --- CONFIG ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Twilio Settings (Make sure these are in your .env file!)
TWILIO_SID = os.getenv("TWILIO_ACCOUNT_SID")
TWILIO_TOKEN = os.getenv("TWILIO_AUTH_TOKEN")
FROM_PHONE = os.getenv("TWILIO_PHONE_NUMBER")
TO_PHONE = os.getenv("TO_PHONE_NUMBER") # Add this to your .env

# Global State
system_state = {"status": "NORMAL"}
last_call_time = 0
CALL_COOLDOWN = 30 # Seconds between calls

# --- CONNECTION MANAGER ---
class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, message: str):
        for connection in self.active_connections:
            await connection.send_text(message)

manager = ConnectionManager()

# --- THE TRIGGER FUNCTION ---
def trigger_emergency_call():
    global last_call_time
    
    # 1. Check Cooldown
    if time.time() - last_call_time < CALL_COOLDOWN:
        print("⏳ Call on cooldown... skipping.")
        return

    print("🚨 DETECTED FALL -> DIALING NURSE...")
    
    # 2. Make the Call
    try:
        client = Client(TWILIO_SID, TWILIO_TOKEN)
        call = client.calls.create(
            twiml='<Response><Say>Emergency alert. Fall detected in Room 304. Immediate assistance required.</Say></Response>',
            to=TO_PHONE,
            from_=FROM_PHONE
        )
        print(f"✅ CALL PLACED SUCCESSFULLY! SID: {call.sid}")
        last_call_time = time.time()
    except Exception as e:
        print(f"❌ CALL FAILED: {e}")
        print("Did you check your .env file?")
@app.get("/api/status")
async def get_status():
    """Frontend polls this to check status if WebSocket disconnects"""
    return system_state

@app.post("/api/reset")
async def reset_status():
    """Optional: Button to manually reset alarm"""
    system_state["status"] = "NORMAL"
    return {"status": "reset"}
# --- WEBSOCKET ENDPOINT ---
@app.websocket("/ws/skeleton")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            # 1. Receive Data
            data_text = await websocket.receive_text()
            data_json = json.loads(data_text)
            
            # 2. READ THE DATA (The Brain)
            status = data_json.get("status")
            
            if status == "FALL":
                print(f"⚠️ FALL PACKET RECEIVED")
                # Trigger the real-world action
                trigger_emergency_call()
            
            # 3. Update Global State
            system_state["status"] = status
            
            # 4. Forward to Frontend
            await manager.broadcast(data_text)
            
    except WebSocketDisconnect:
        manager.disconnect(websocket)
        print("🔌 Client Disconnected")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)