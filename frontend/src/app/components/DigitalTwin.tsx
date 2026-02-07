"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useRef, useState, useEffect, useMemo } from "react";
import { OrbitControls, Grid, Line } from "@react-three/drei";
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
   Skeleton Topology — STRUCTURAL BONES ONLY
   No face detail, no finger tips. Clean human silhouette.
   ═══════════════════════════════════════════════════════ */

const CONNECTIONS: [number, number][] = [
  // Torso frame
  [11, 12], // shoulder span
  [11, 23], // L shoulder → L hip
  [12, 24], // R shoulder → R hip
  [23, 24], // hip span
  // Left arm
  [11, 13], // shoulder → elbow
  [13, 15], // elbow → wrist
  // Right arm
  [12, 14], // shoulder → elbow
  [14, 16], // elbow → wrist
  // Left leg
  [23, 25], // hip → knee
  [25, 27], // knee → ankle
  // Right leg
  [24, 26], // hip → knee
  [26, 28], // knee → ankle
];

/** Only these joints get rendered — head + major body joints */
const DISPLAYED_JOINTS = new Set([
  0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28,
]);

/* ═══════════════════════════════════════════════════════
   Coordinate Mapping (tighter scale)
   MediaPipe: x[0-1] y[0-1] z[~-1..1]
   Three.js:  mapped to approx [-3, 3]
   ═══════════════════════════════════════════════════════ */

function toWorld(lm: Landmark): [number, number, number] {
  return [
    -(lm.x - 0.5) * 6, // mirror X, center, scale → [-3, 3]
    -(lm.y - 0.5) * 6, // flip Y (MP y↓, Three y↑)  → [-3, 3]
    -lm.z * 2, // gentle depth
  ];
}

function midpoint(
  a: [number, number, number],
  b: [number, number, number]
): [number, number, number] {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
}

function isVisible(landmarks: Landmark[], idx: number): boolean {
  return idx < landmarks.length && landmarks[idx].visibility > 0.5;
}

/* ═══════════════════════════════════════════════════════
   3D Scene Components
   ═══════════════════════════════════════════════════════ */

// ── Wireframe Skeleton (redesigned) ────────────────────

function Skeleton({
  landmarks,
  status,
}: {
  landmarks: Landmark[];
  status: SystemStatus;
}) {
  const isFall = status === "FALL";
  const jointColor = isFall ? "#ff2244" : "#00e5ff";
  const boneColor = isFall ? "#ff4466" : "#00d4ff";
  const emissiveHex = isFall ? "#ff0000" : "#005577";
  const emissiveIntensity = isFall ? 2.5 : 0.8;

  // All 33 world-space positions (indexed by landmark ID)
  const worldPos = useMemo(
    () => landmarks.map((lm) => toWorld(lm)),
    [landmarks]
  );

  // Virtual points: neck (shoulder midpoint) & spine center (hip midpoint)
  const neckPos = useMemo((): [number, number, number] | null => {
    if (!isVisible(landmarks, 11) || !isVisible(landmarks, 12)) return null;
    return midpoint(worldPos[11], worldPos[12]);
  }, [worldPos, landmarks]);

  const hipCenter = useMemo((): [number, number, number] | null => {
    if (!isVisible(landmarks, 23) || !isVisible(landmarks, 24)) return null;
    return midpoint(worldPos[23], worldPos[24]);
  }, [worldPos, landmarks]);

  // Filter to only visible bone connections
  const visibleBones = useMemo(
    () =>
      CONNECTIONS.filter(
        ([a, b]) => isVisible(landmarks, a) && isVisible(landmarks, b)
      ),
    [landmarks]
  );

  return (
    <group>
      {/* ── Bones (thick lines via drei Line2) ── */}
      {visibleBones.map(([a, b]) => (
        <Line
          key={`${a}-${b}`}
          points={[worldPos[a], worldPos[b]]}
          color={boneColor}
          lineWidth={2.5}
        />
      ))}

      {/* ── Virtual bones: neck + spine ── */}
      {neckPos && isVisible(landmarks, 0) && (
        <Line
          points={[worldPos[0], neckPos]}
          color={boneColor}
          lineWidth={2.5}
        />
      )}
      {neckPos && hipCenter && (
        <Line
          points={[neckPos, hipCenter]}
          color={boneColor}
          lineWidth={1.8}
          dashed
          dashScale={20}
          dashSize={0.3}
          gapSize={0.15}
        />
      )}

      {/* ── Torso fill (faint transparent quad) ── */}
      {isVisible(landmarks, 11) &&
        isVisible(landmarks, 12) &&
        isVisible(landmarks, 23) &&
        isVisible(landmarks, 24) && (
          <TorsoFill
            points={[
              worldPos[11],
              worldPos[12],
              worldPos[24],
              worldPos[23],
            ]}
            color={jointColor}
          />
        )}

      {/* ── Joint markers (only major body joints) ── */}
      {worldPos.map((pos, i) =>
        DISPLAYED_JOINTS.has(i) && isVisible(landmarks, i) ? (
          i === 0 ? (
            // Head — wireframe icosahedron + halo
            <group key={i} position={pos}>
              <mesh>
                <icosahedronGeometry args={[0.16, 1]} />
                <meshStandardMaterial
                  color={jointColor}
                  emissive={emissiveHex}
                  emissiveIntensity={emissiveIntensity}
                  wireframe
                  toneMapped={false}
                />
              </mesh>
              <mesh rotation={[Math.PI / 2, 0, 0]}>
                <torusGeometry args={[0.22, 0.006, 16, 48]} />
                <meshBasicMaterial
                  color={jointColor}
                  transparent
                  opacity={0.4}
                />
              </mesh>
            </group>
          ) : (
            // Body joints — glowing spheres
            <mesh key={i} position={pos}>
              <sphereGeometry args={[0.055, 14, 14]} />
              <meshStandardMaterial
                color={jointColor}
                emissive={emissiveHex}
                emissiveIntensity={emissiveIntensity}
                toneMapped={false}
              />
            </mesh>
          )
        ) : null
      )}

      {/* ── Spine midpoint marker ── */}
      {hipCenter && (
        <mesh position={hipCenter}>
          <sphereGeometry args={[0.035, 10, 10]} />
          <meshBasicMaterial color={jointColor} transparent opacity={0.5} />
        </mesh>
      )}
    </group>
  );
}

// ── Torso fill (faint transparent quad) ────────────────

function TorsoFill({
  points,
  color,
}: {
  points: [number, number, number][];
  color: string;
}) {
  const meshRef = useRef<THREE.Mesh>(null);

  useEffect(() => {
    if (!meshRef.current || points.length < 4) return;
    const [ls, rs, rh, lh] = points;
    const vertices = new Float32Array([
      // Triangle 1: LS → RS → RH
      ls[0], ls[1], ls[2],
      rs[0], rs[1], rs[2],
      rh[0], rh[1], rh[2],
      // Triangle 2: LS → RH → LH
      ls[0], ls[1], ls[2],
      rh[0], rh[1], rh[2],
      lh[0], lh[1], lh[2],
    ]);
    const geom = meshRef.current.geometry;
    geom.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(vertices, 3)
    );
    geom.computeVertexNormals();
  }, [points]);

  return (
    <mesh ref={meshRef}>
      <bufferGeometry />
      <meshBasicMaterial
        color={color}
        transparent
        opacity={0.04}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

// ── Hospital Bed (semi-transparent wireframe box) ──────

function HospitalBed() {
  return (
    <group position={[2.5, -2.2, 0]}>
      <mesh>
        <boxGeometry args={[2.4, 0.7, 1.2]} />
        <meshStandardMaterial
          color="#1a3a5c"
          transparent
          opacity={0.08}
        />
      </mesh>
      <mesh>
        <boxGeometry args={[2.4, 0.7, 1.2]} />
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
        position={[0, 5, 4]}
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

  return <fog ref={fogRef} attach="fog" args={["#070d15", 8, 22]} />;
}

// ── Reflective Floor Grid ──────────────────────────────

function FloorGrid({ status }: { status: SystemStatus }) {
  const isFall = status === "FALL";
  return (
    <Grid
      position={[0, -2.8, 0]}
      cellSize={0.5}
      cellThickness={0.5}
      cellColor={isFall ? "#3a0a0a" : "#0d3b4f"}
      sectionSize={2.5}
      sectionThickness={1}
      sectionColor={isFall ? "#6a1a1a" : "#1a6b7a"}
      fadeDistance={18}
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
        <torusGeometry args={[1.2, 0.012, 16, 80]} />
        <meshBasicMaterial color="#00e5ff" transparent opacity={0.35} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.9, 0.008, 16, 80]} />
        <meshBasicMaterial color="#00e5ff" transparent opacity={0.15} />
      </mesh>
    </group>
  );
}

/* ═══════════════════════════════════════════════════════
   Main Export: <DigitalTwin />
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
      {/* Connection status badge */}
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
        camera={{ position: [0, 0.5, 6], fov: 45 }}
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: "high-performance",
        }}
        style={{ background: "transparent" }}
      >
        <SceneFog status={status} />
        <Lighting status={status} />
        <FloorGrid status={status} />
        <HospitalBed />

        {landmarks.length > 0 ? (
          <Skeleton landmarks={landmarks} status={status} />
        ) : (
          <IdlePlaceholder />
        )}

        <OrbitControls
          enablePan={false}
          maxDistance={12}
          minDistance={3}
          autoRotate={status !== "FALL"}
          autoRotateSpeed={0.4}
          maxPolarAngle={Math.PI * 0.85}
        />
      </Canvas>
    </div>
  );
}
