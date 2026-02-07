"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useRef, useState, useEffect, useMemo } from "react";
import { OrbitControls, Grid } from "@react-three/drei";
import * as THREE from "three";

/* ═══════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════ */

export interface Landmark {
  x: number;
  y: number;
  z: number;
  visibility: number;
}

export interface SkeletonFrame {
  type: string;
  status: "NORMAL" | "FALL";
  landmarks: Landmark[];
}

export type SystemStatus = "NORMAL" | "FALL";

/* ═══════════════════════════════════════════════════════
   MediaPipe Pose Constants
   33 landmarks → bone connections
   ═══════════════════════════════════════════════════════ */

const CONNECTIONS: [number, number][] = [
  // ── Torso ──
  [11, 12],
  [11, 23],
  [12, 24],
  [23, 24],
  // ── Left Arm ──
  [11, 13],
  [13, 15],
  [15, 17],
  [15, 19],
  [15, 21],
  // ── Right Arm ──
  [12, 14],
  [14, 16],
  [16, 18],
  [16, 20],
  [16, 22],
  // ── Left Leg ──
  [23, 25],
  [25, 27],
  [27, 29],
  [27, 31],
  [29, 31],
  // ── Right Leg ──
  [24, 26],
  [26, 28],
  [28, 30],
  [28, 32],
  [30, 32],
  // ── Neck (nose → shoulders) ──
  [0, 11],
  [0, 12],
  // ── Face detail ──
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 7],
  [0, 4],
  [4, 5],
  [5, 6],
  [6, 8],
  [9, 10],
];

/** Major joints get larger spheres */
const MAJOR_JOINTS = new Set([
  0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28,
]);

/** Pre-allocated buffer for bone vertices (2 vertices per connection × 3 floats) */
const MAX_BONE_FLOATS = CONNECTIONS.length * 2 * 3;

/* ═══════════════════════════════════════════════════════
   Coordinate Mapping
   MediaPipe: x[0-1] y[0-1] z[~-1 to 1]
   Three.js:  x[-5,5] y[-5,5] z[-5,5]
   Flip X so the avatar mirrors the user.
   ═══════════════════════════════════════════════════════ */

function toWorld(lm: Landmark): [number, number, number] {
  return [
    -(lm.x - 0.5) * 10, // flip & center X → [-5, 5]
    -(lm.y - 0.5) * 10, // flip Y (MP y↓, Three y↑) → [-5, 5]
    -lm.z * 5, // depth
  ];
}

/* ═══════════════════════════════════════════════════════
   3D Scene Components
   ═══════════════════════════════════════════════════════ */

// ── Wireframe Skeleton ─────────────────────────────────

function Skeleton({
  landmarks,
  status,
}: {
  landmarks: Landmark[];
  status: SystemStatus;
}) {
  const linesRef = useRef<THREE.LineSegments>(null);
  const bufferRef = useRef(new Float32Array(MAX_BONE_FLOATS));
  const attrRef = useRef<THREE.BufferAttribute | null>(null);

  const isFall = status === "FALL";
  const jointColor = isFall ? "#ff2244" : "#00e5ff";
  const emissiveHex = isFall ? "#ff0000" : "#004466";
  const emissiveIntensity = isFall ? 2.0 : 0.5;
  const boneColor = isFall ? "#ff4466" : "#00b8d4";

  // Convert landmarks → world-space tuples
  const worldPos = useMemo(
    () => landmarks.map((lm) => toWorld(lm)),
    [landmarks]
  );

  // Imperatively update bone geometry when landmarks change
  useEffect(() => {
    if (!linesRef.current || worldPos.length === 0) return;

    const buf = bufferRef.current;
    let vertexCount = 0;

    for (const [a, b] of CONNECTIONS) {
      if (
        a < landmarks.length &&
        b < landmarks.length &&
        landmarks[a].visibility > 0.5 &&
        landmarks[b].visibility > 0.5
      ) {
        const pa = worldPos[a];
        const pb = worldPos[b];
        const off = vertexCount * 3;
        buf[off] = pa[0];
        buf[off + 1] = pa[1];
        buf[off + 2] = pa[2];
        buf[off + 3] = pb[0];
        buf[off + 4] = pb[1];
        buf[off + 5] = pb[2];
        vertexCount += 2;
      }
    }

    const geom = linesRef.current.geometry;
    if (!attrRef.current) {
      attrRef.current = new THREE.BufferAttribute(buf, 3);
      geom.setAttribute("position", attrRef.current);
    } else {
      attrRef.current.needsUpdate = true;
    }
    geom.setDrawRange(0, vertexCount);
    geom.computeBoundingSphere();
  }, [worldPos, landmarks]);

  return (
    <group>
      {/* Joint spheres */}
      {worldPos.map((pos, i) =>
        landmarks[i].visibility > 0.5 ? (
          <mesh key={i} position={pos}>
            <sphereGeometry
              args={[MAJOR_JOINTS.has(i) ? 0.09 : 0.045, 12, 12]}
            />
            <meshStandardMaterial
              color={jointColor}
              emissive={emissiveHex}
              emissiveIntensity={emissiveIntensity}
              toneMapped={false}
            />
          </mesh>
        ) : null
      )}

      {/* Bone line segments */}
      <lineSegments ref={linesRef}>
        <bufferGeometry />
        <lineBasicMaterial
          color={boneColor}
          transparent
          opacity={0.75}
        />
      </lineSegments>
    </group>
  );
}

// ── Hospital Bed (semi-transparent wireframe box) ──────

function HospitalBed() {
  return (
    <group position={[3, -3.8, 0]}>
      {/* Solid fill — very faint */}
      <mesh>
        <boxGeometry args={[2.8, 0.9, 1.4]} />
        <meshStandardMaterial
          color="#1a3a5c"
          transparent
          opacity={0.08}
        />
      </mesh>
      {/* Wireframe overlay */}
      <mesh>
        <boxGeometry args={[2.8, 0.9, 1.4]} />
        <meshStandardMaterial
          color="#2a6a9c"
          wireframe
          transparent
          opacity={0.2}
        />
      </mesh>
    </group>
  );
}

// ── Adaptive Lighting (cyan ↔ pulsing red) ─────────────

function Lighting({ status }: { status: SystemStatus }) {
  const mainRef = useRef<THREE.PointLight>(null);
  const ambientRef = useRef<THREE.AmbientLight>(null);

  useFrame(({ clock }) => {
    if (status === "FALL") {
      const pulse = Math.sin(clock.elapsedTime * 5) * 0.4 + 1;
      if (mainRef.current) {
        mainRef.current.intensity = pulse * 2.5;
        mainRef.current.color.set("#ff2244");
      }
      if (ambientRef.current) {
        ambientRef.current.intensity = 0.08 + pulse * 0.12;
        ambientRef.current.color.set("#441111");
      }
    } else {
      if (mainRef.current) {
        mainRef.current.intensity = 1.2;
        mainRef.current.color.set("#00e5ff");
      }
      if (ambientRef.current) {
        ambientRef.current.intensity = 0.25;
        ambientRef.current.color.set("#0a1a2a");
      }
    }
  });

  return (
    <>
      <ambientLight ref={ambientRef} intensity={0.25} color="#0a1a2a" />
      <pointLight
        ref={mainRef}
        position={[0, 6, 4]}
        intensity={1.2}
        color="#00e5ff"
        distance={25}
      />
      <pointLight position={[-4, 3, -3]} intensity={0.3} color="#003355" />
      <pointLight position={[4, 2, 2]} intensity={0.2} color="#004466" />
    </>
  );
}

// ── Scene Fog ──────────────────────────────────────────

function SceneFog({ status }: { status: SystemStatus }) {
  const fogRef = useRef<THREE.Fog>(null);

  useEffect(() => {
    if (fogRef.current) {
      fogRef.current.color.set(
        status === "FALL" ? "#1a0505" : "#070d15"
      );
    }
  }, [status]);

  return <fog ref={fogRef} attach="fog" args={["#070d15", 10, 25]} />;
}

// ── Reflective Floor Grid ──────────────────────────────

function FloorGrid({ status }: { status: SystemStatus }) {
  const isFall = status === "FALL";
  return (
    <Grid
      position={[0, -4.6, 0]}
      cellSize={0.6}
      cellThickness={0.6}
      cellColor={isFall ? "#3a0a0a" : "#0d3b4f"}
      sectionSize={3}
      sectionThickness={1.2}
      sectionColor={isFall ? "#6a1a1a" : "#1a6b7a"}
      fadeDistance={20}
      fadeStrength={1.5}
      followCamera={false}
      infiniteGrid
    />
  );
}

// ── Idle placeholder (spinning torus while waiting) ────

function IdlePlaceholder() {
  const ringRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (ringRef.current) {
      ringRef.current.rotation.z = clock.elapsedTime * 0.5;
      ringRef.current.rotation.x =
        Math.sin(clock.elapsedTime * 0.3) * 0.3;
    }
  });

  return (
    <group>
      <mesh ref={ringRef}>
        <torusGeometry args={[1.5, 0.015, 16, 80]} />
        <meshBasicMaterial color="#00e5ff" transparent opacity={0.35} />
      </mesh>
      {/* Second ring, offset */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.2, 0.01, 16, 80]} />
        <meshBasicMaterial color="#00e5ff" transparent opacity={0.15} />
      </mesh>
    </group>
  );
}

/* ═══════════════════════════════════════════════════════
   Main Export: <DigitalTwin />
   Renders <Canvas> with the full 3D scene.
   Connects to ws://localhost:8000/ws/skeleton
   ═══════════════════════════════════════════════════════ */

interface DigitalTwinProps {
  onStatusChange?: (status: SystemStatus) => void;
  onFrameData?: (data: SkeletonFrame) => void;
}

export default function DigitalTwin({
  onStatusChange,
  onFrameData,
}: DigitalTwinProps) {
  const [landmarks, setLandmarks] = useState<Landmark[]>([]);
  const [status, setStatus] = useState<SystemStatus>("NORMAL");
  const [connected, setConnected] = useState(false);

  // Stable refs for callbacks so WebSocket effect doesn't re-run
  const statusCbRef = useRef(onStatusChange);
  const frameCbRef = useRef(onFrameData);
  statusCbRef.current = onStatusChange;
  frameCbRef.current = onFrameData;

  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout>;
    let alive = true;

    function connect() {
      if (!alive) return;
      ws = new WebSocket("ws://localhost:8000/ws/skeleton");

      ws.onopen = () => {
        console.log("[MOSAIC] WebSocket connected to skeleton stream");
        setConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const data: SkeletonFrame = JSON.parse(event.data);
          if (
            data.type === "skeleton_update" &&
            data.landmarks?.length > 0
          ) {
            setLandmarks(data.landmarks);
            setStatus(data.status);
            statusCbRef.current?.(data.status);
            frameCbRef.current?.(data);
          }
        } catch {
          // Ignore malformed frames
        }
      };

      ws.onclose = () => {
        console.log("[MOSAIC] WebSocket closed — reconnecting in 2 s");
        setConnected(false);
        if (alive) {
          reconnectTimer = setTimeout(connect, 2000);
        }
      };

      ws.onerror = () => ws?.close();
    }

    connect();

    return () => {
      alive = false;
      ws?.close();
      clearTimeout(reconnectTimer);
    };
  }, []);

  return (
    <div className="relative w-full h-full rounded-2xl overflow-hidden">
      {/* ── Connection status badge ── */}
      <div className="absolute top-3 left-3 z-10 flex items-center gap-2 px-2.5 py-1 rounded-full bg-black/50 backdrop-blur-sm border border-white/5">
        <span
          className={`inline-block w-2 h-2 rounded-full ${
            connected
              ? "bg-emerald-400 shadow-[0_0_6px_#34d399]"
              : "bg-red-500 animate-pulse"
          }`}
        />
        <span className="text-[10px] font-mono tracking-wider text-slate-300 uppercase">
          {connected ? "Live Feed" : "Reconnecting…"}
        </span>
      </div>

      <Canvas
        camera={{ position: [0, 0, 8], fov: 45 }}
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: "high-performance",
        }}
        style={{ background: "transparent" }}
      >
        {/* Scene-level */}
        <SceneFog status={status} />
        <Lighting status={status} />

        {/* Room */}
        <FloorGrid status={status} />
        <HospitalBed />

        {/* Skeleton or idle placeholder */}
        {landmarks.length > 0 ? (
          <Skeleton landmarks={landmarks} status={status} />
        ) : (
          <IdlePlaceholder />
        )}

        {/* Camera controls */}
        <OrbitControls
          enablePan={false}
          maxDistance={14}
          minDistance={3}
          autoRotate={status !== "FALL"}
          autoRotateSpeed={0.4}
          maxPolarAngle={Math.PI * 0.85}
        />
      </Canvas>
    </div>
  );
}
