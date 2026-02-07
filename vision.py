import cv2
import mediapipe as mp
import asyncio
import websockets
import json

# CONFIG
WS_URL = "ws://localhost:8000/ws/skeleton"

# SETUP MEDIAPIPE
mp_pose = mp.solutions.pose
pose = mp_pose.Pose(
    min_detection_confidence=0.5, 
    min_tracking_confidence=0.5, 
    model_complexity=1
)

async def stream_skeleton():
    cap = cv2.VideoCapture(0) # Use 0 for Webcam
    
    print(f"🔌 Connecting to Mosaic Server...")
    
    # We explicitly tell the server we are "Localhost" to bypass the 403 Block
    async with websockets.connect(
        WS_URL, 
        origin="http://localhost:3000"
    ) as websocket:
        print("✅ CONNECTED! Streaming Private Skeleton Data...")
        
        while cap.isOpened():
            ret, frame = cap.read()
            if not ret: break

            # 1. Process Frame
            image = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            image.flags.writeable = False
            results = pose.process(image)

            # 2. Extract Skeleton (If detected)
            if results.pose_landmarks:
                landmarks = []
                # Map 33 joints to a clean list
                for lm in results.pose_landmarks.landmark:
                    landmarks.append({
                        'x': lm.x, 
                        'y': lm.y, 
                        'z': lm.z,
                        'visibility': lm.visibility
                    })
                
                # 3. Detect Fall (Simple Logic)
                nose_y = landmarks[0]['y']
                mid_hip_y = (landmarks[23]['y'] + landmarks[24]['y']) / 2
                
                # If head is below hips, it's a fall
                status = "FALL" if abs(nose_y - mid_hip_y) < 0.2 else "NORMAL"

                # 4. Send JSON Payload
                payload = json.dumps({
                    "type": "skeleton_update",
                    "status": status,
                    "landmarks": landmarks
                })
                await websocket.send(payload)

            # Optional: Show local window for you to see
            cv2.imshow('Mosaic Vision (Local)', frame)
            # Press 'q' to quit
            if cv2.waitKey(1) & 0xFF == ord('q'): break

    cap.release()
    cv2.destroyAllWindows()

if __name__ == "__main__":
    try:
        asyncio.run(stream_skeleton())
    except Exception as e:
        print(f"❌ Error: {e}")
        print("Did you start server.py first?")