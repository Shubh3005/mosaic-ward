import cv2
import mediapipe as mp
import asyncio
import websockets
import json
from collections import deque

# --- CONFIG ---
WS_URL = "ws://localhost:8000/ws/skeleton"
SMOOTHING_WINDOW = 6  # Slightly higher for creamier movement

# --- VIRTUAL BED CONFIG ---
# Normalized coordinates (0.0 = Left, 1.0 = Right)
# The "Bed" is the middle 50% of the screen
BED_X_MIN = 0.25
BED_X_MAX = 0.75

class LandmarkSmoother:
    def __init__(self, window_size=5):
        self.window_size = window_size
        self.history = deque(maxlen=window_size)

    def update(self, landmarks):
        """Adds new landmarks and returns the average."""
        self.history.append(landmarks)
        
        if len(self.history) < 2:
            return landmarks

        smoothed = []
        for joint_frames in zip(*self.history):
            avg_x = sum(lm['x'] for lm in joint_frames) / len(joint_frames)
            avg_y = sum(lm['y'] for lm in joint_frames) / len(joint_frames)
            avg_z = sum(lm['z'] for lm in joint_frames) / len(joint_frames)
            avg_vis = sum(lm['visibility'] for lm in joint_frames) / len(joint_frames)
            smoothed.append({'x': avg_x, 'y': avg_y, 'z': avg_z, 'visibility': avg_vis})
        return smoothed

    def reset(self):
        """Wipes the memory. Xbox-style 'Player Lost' logic."""
        self.history.clear()
        print("🧹 Buffer Cleared (Player Left Frame)")

class SafeZone:
    def check(self, landmarks):
        """
        Determines if patient is RESTING (in bed) or FALLING (floor).
        """
        # 1. Get key body parts
        nose_y = landmarks[0]['y']
        
        # Calculate mid-hip (Average of Left and Right Hip)
        hip_y = (landmarks[23]['y'] + landmarks[24]['y']) / 2
        hip_x = (landmarks[23]['x'] + landmarks[24]['x']) / 2
        
        # 2. Check if "Horizontal" (Laying down)
        # In MediaPipe, Y increases downwards. If nose is roughly same Y as hips, we are flat.
        is_laying_down = abs(nose_y - hip_y) < 0.2
        
        # 3. Check Location (The Geofence)
        # Are the hips inside the horizontal "Bed Zone"?
        is_in_bed_zone = (BED_X_MIN < hip_x < BED_X_MAX)

        if is_laying_down:
            if is_in_bed_zone:
                return "RESTING"  # Safe! Just sleeping.
            else:
                return "FALL"     # Danger! On the floor.
        
        return "NORMAL"

# --- LANDMARK LABELS ---
JOINT_LABELS = {
    0: "NOSE", 11: "L_SHOULDER", 12: "R_SHOULDER",
    13: "L_ELBOW", 14: "R_ELBOW", 15: "L_WRIST", 16: "R_WRIST",
    23: "L_HIP", 24: "R_HIP", 25: "L_KNEE", 26: "R_KNEE",
    27: "L_ANKLE", 28: "R_ANKLE",
}

# --- MAIN SYSTEM ---
mp_pose = mp.solutions.pose
mp_drawing = mp.solutions.drawing_utils
mp_drawing_styles = mp.solutions.drawing_styles
pose = mp_pose.Pose(
    min_detection_confidence=0.5, 
    min_tracking_confidence=0.5, 
    model_complexity=1
)

async def stream_skeleton():
    cap = cv2.VideoCapture(0)
    smoother = LandmarkSmoother(window_size=SMOOTHING_WINDOW)
    zone = SafeZone()
    
    print(f"🔌 Connecting to Mosaic Server...")
    was_present_last_frame = False

    try:
        async with websockets.connect(WS_URL, origin="http://localhost:3000") as websocket:
            print("✅ CONNECTED! Streaming Smart-Reset Skeleton...")
            
            while cap.isOpened():
                ret, frame = cap.read()
                if not ret: break

                image = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                image.flags.writeable = False
                results = pose.process(image)

                status = "NORMAL" # Default
                debug_frame = frame.copy()
                h, w, _ = debug_frame.shape

                # --- DRAW THE VIRTUAL BED (Debug) ---
                # Draw two vertical lines representing the safe zone
                cv2.line(debug_frame, (int(w * BED_X_MIN), 0), (int(w * BED_X_MIN), h), (255, 255, 0), 2)
                cv2.line(debug_frame, (int(w * BED_X_MAX), 0), (int(w * BED_X_MAX), h), (255, 255, 0), 2)
                cv2.putText(debug_frame, "BED ZONE", (int(w * 0.45), 30), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 0), 2)

                if results.pose_landmarks:
                    was_present_last_frame = True
                    
                    # 1. Extract Raw
                    raw_landmarks = [{'x': lm.x, 'y': lm.y, 'z': lm.z, 'visibility': lm.visibility} for lm in results.pose_landmarks.landmark]
                    
                    # 2. Smooth
                    smooth_landmarks = smoother.update(raw_landmarks)

                    # 3. Smart Detect (Zone Check)
                    status = zone.check(smooth_landmarks)

                    # 4. Send
                    payload = json.dumps({
                        "type": "skeleton_update",
                        "room_id": "304-A",
                        "status": status,
                        "landmarks": smooth_landmarks,
                        "tracked": True
                    })
                    await websocket.send(payload)

                    # --- DRAW SKELETON ---
                    mp_drawing.draw_landmarks(
                        debug_frame,
                        results.pose_landmarks,
                        mp_pose.POSE_CONNECTIONS,
                        landmark_drawing_spec=mp_drawing_styles.get_default_pose_landmarks_style(),
                    )
                    
                    # --- LABEL JOINTS ---
                    for idx, label in JOINT_LABELS.items():
                        lm = results.pose_landmarks.landmark[idx]
                        if lm.visibility > 0.5:
                            cx, cy = int(lm.x * w), int(lm.y * h)
                            cv2.circle(debug_frame, (cx, cy), 5, (0, 255, 255), -1)
                            cv2.putText(debug_frame, label, (cx + 8, cy - 6),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.35, (0, 255, 255), 1, cv2.LINE_AA)

                else:
                    # PLAYER LOST
                    if was_present_last_frame:
                        smoother.reset()
                        was_present_last_frame = False
                        await websocket.send(json.dumps({
                            "type": "skeleton_update", "room_id": "304-A", "status": "NORMAL", "landmarks": [], "tracked": False
                        }))

                # --- DRAW STATUS HUD ---
                # Green = Resting, Red = Fall, Blue = Normal
                color = (0, 255, 0) if status == "RESTING" else (0, 0, 255) if status == "FALL" else (255, 0, 0)
                cv2.putText(debug_frame, f"STATUS: {status}", (50, 100), cv2.FONT_HERSHEY_SIMPLEX, 1.5, color, 3)

                cv2.imshow('Mosaic Vision (Debug)', debug_frame)
                if cv2.waitKey(1) & 0xFF == ord('q'): break

    # except Exception as e:
    #     print(f"❌ Error: {e}")
    finally:
        cap.release()
        cv2.destroyAllWindows()

if __name__ == "__main__":
    try:
        asyncio.run(stream_skeleton())
    except KeyboardInterrupt:
        print("\n👋 Stopping Vision Agent...")