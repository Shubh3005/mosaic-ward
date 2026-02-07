"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useRef, useState, useEffect, useMemo, useCallback } from "react";
import { OrbitControls, Line } from "@react-three/drei";
import * as THREE from "three";
import Link from "next/link";
import type { Landmark, SystemStatus } from "./DigitalTwin";

/* ═══════════════════════════════════════════════════════
   Per-Room State
   ═══════════════════════════════════════════════════════ */

interface PatientState {
  landmarks: Landmark[];
  status: SystemStatus;
  tracked: boolean;
}

interface PatientInfo {
  name: string;
  initials: string;
  room: string;
  condition: string;
  risk: "HIGH" | "MODERATE" | "LOW";
  attending: string;
  isLive: boolean;
  vitals: { hr: number; spo2: number; bp: string; temp: string };
}

/* ═══════════════════════════════════════════════════════
   Patient Registry
   ═══════════════════════════════════════════════════════ */

const PATIENTS: PatientInfo[] = [
  {
    name: "James R.", initials: "JR", room: "301-A",
    condition: "Cardiac Monitoring", risk: "MODERATE",
    attending: "Dr. Chen", isLive: false,
    vitals: { hr: 82, spo2: 97, bp: "128/82", temp: "98.4" },
  },
  {
    name: "Elena K.", initials: "EK", room: "302-B",
    condition: "Post-op Knee Replacement", risk: "LOW",
    attending: "Dr. Patel", isLive: false,
    vitals: { hr: 68, spo2: 99, bp: "118/76", temp: "98.2" },
  },
  {
    name: "Robert M.", initials: "RM", room: "303-C",
    condition: "Fall Recovery", risk: "HIGH",
    attending: "Dr. Kim", isLive: false,
    vitals: { hr: 88, spo2: 96, bp: "132/86", temp: "98.8" },
  },
  {
    name: "Martha V.", initials: "MV", room: "304-A",
    condition: "Post-op Hip Replacement", risk: "HIGH",
    attending: "Dr. Ramirez", isLive: true,
    vitals: { hr: 80, spo2: 98, bp: "120/80", temp: "98.6" },
  },
];

const DEFAULT_STATE: PatientState = { landmarks: [], status: "NORMAL", tracked: false };

/* ═══════════════════════════════════════════════════════
   Skeleton Topology (shared with DigitalTwin)
   ═══════════════════════════════════════════════════════ */

const CONNECTIONS: [number, number][] = [
  [11, 12], [11, 23], [12, 24], [23, 24],
  [11, 13], [13, 15], [12, 14], [14, 16],
  [23, 25], [25, 27], [24, 26], [26, 28],
];

const DISPLAYED_JOINTS = new Set([
  0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28,
]);

function toWorld(lm: Landmark): [number, number, number] {
  return [-(lm.x - 0.5) * 6, -(lm.y - 0.5) * 6, -lm.z * 2];
}

function midpoint(
  a: [number, number, number],
  b: [number, number, number]
): [number, number, number] {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
}

function isVis(landmarks: Landmark[], i: number): boolean {
  return i < landmarks.length && landmarks[i].visibility > 0.5;
}

/* ═══════════════════════════════════════════════════════
   Color Map
   ═══════════════════════════════════════════════════════ */

const COLOR_MAP: Record<
  string,
  { joint: string; bone: string; emissive: string; intensity: number }
> = {
  FALL:         { joint: "#ff2244", bone: "#ff4466", emissive: "#ff0000", intensity: 2.0 },
  ACKNOWLEDGED: { joint: "#f97316", bone: "#ea580c", emissive: "#7c2d12", intensity: 1.0 },
  RESTING:      { joint: "#f0b840", bone: "#d4a030", emissive: "#665510", intensity: 0.6 },
  NORMAL:       { joint: "#00e5ff", bone: "#00d4ff", emissive: "#005577", intensity: 0.8 },
};

/* ═══════════════════════════════════════════════════════
   3-D Mini Components (lightweight for 4-up grid)
   ═══════════════════════════════════════════════════════ */

function MiniSkeleton({
  landmarks,
  status,
}: {
  landmarks: Landmark[];
  status: SystemStatus;
}) {
  const c = COLOR_MAP[status] ?? COLOR_MAP.NORMAL;

  const worldPos = useMemo(
    () => landmarks.map((lm) => toWorld(lm)),
    [landmarks]
  );

  const neckPos = useMemo((): [number, number, number] | null => {
    if (!isVis(landmarks, 11) || !isVis(landmarks, 12)) return null;
    return midpoint(worldPos[11], worldPos[12]);
  }, [worldPos, landmarks]);

  const visibleBones = useMemo(
    () =>
      CONNECTIONS.filter(
        ([a, b]) => isVis(landmarks, a) && isVis(landmarks, b)
      ),
    [landmarks]
  );

  return (
    <group>
      {/* Bones */}
      {visibleBones.map(([a, b]) => (
        <Line
          key={`${a}-${b}`}
          points={[worldPos[a], worldPos[b]]}
          color={c.bone}
          lineWidth={1.8}
        />
      ))}

      {/* Neck bone (virtual) */}
      {neckPos && isVis(landmarks, 0) && (
        <Line
          points={[worldPos[0], neckPos]}
          color={c.bone}
          lineWidth={1.8}
        />
      )}

      {/* Joint markers */}
      {worldPos.map((pos, i) =>
        DISPLAYED_JOINTS.has(i) && isVis(landmarks, i) ? (
          i === 0 ? (
            // Head — small wireframe icosahedron
            <mesh key={i} position={pos}>
              <icosahedronGeometry args={[0.14, 1]} />
              <meshStandardMaterial
                color={c.joint}
                emissive={c.emissive}
                emissiveIntensity={c.intensity}
                wireframe
                toneMapped={false}
              />
            </mesh>
          ) : (
            <mesh key={i} position={pos}>
              <sphereGeometry args={[0.045, 10, 10]} />
              <meshStandardMaterial
                color={c.joint}
                emissive={c.emissive}
                emissiveIntensity={c.intensity}
                toneMapped={false}
              />
            </mesh>
          )
        ) : null
      )}
    </group>
  );
}

// ── Lighting (pulsing red for FALL) ──────────────────

function MiniLighting({ status }: { status: SystemStatus }) {
  const mainRef = useRef<THREE.PointLight>(null);

  useFrame(({ clock }) => {
    if (!mainRef.current) return;
    if (status === "FALL") {
      mainRef.current.intensity =
        1.2 + Math.sin(clock.elapsedTime * 5) * 0.5;
      mainRef.current.color.set("#ff2244");
    } else {
      const col =
        status === "ACKNOWLEDGED"
          ? "#f97316"
          : status === "RESTING"
            ? "#f0b840"
            : "#00e5ff";
      mainRef.current.intensity = 1.0;
      mainRef.current.color.set(col);
    }
  });

  return (
    <>
      <ambientLight intensity={0.15} color="#0a1a2a" />
      <pointLight
        ref={mainRef}
        position={[0, 4, 4]}
        intensity={1}
        color="#00e5ff"
        distance={20}
      />
    </>
  );
}

// ── Idle ring (shown when no landmarks) ─────────────

function MiniIdlePlaceholder() {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (ref.current) ref.current.rotation.z = clock.elapsedTime * 0.5;
  });
  return (
    <mesh ref={ref}>
      <torusGeometry args={[0.8, 0.008, 16, 60]} />
      <meshBasicMaterial color="#00e5ff" transparent opacity={0.3} />
    </mesh>
  );
}

// ── Canvas wrapper ──────────────────────────────────

function MiniTwin({
  landmarks,
  status,
}: {
  landmarks: Landmark[];
  status: SystemStatus;
}) {
  return (
    <Canvas
      camera={{ position: [0, 0.5, 5.5], fov: 45 }}
      dpr={[1, 1.5]}
      gl={{ antialias: false, alpha: true, powerPreference: "default" }}
      style={{ background: "transparent" }}
    >
      <MiniLighting status={status} />

      {landmarks.length > 0 ? (
        <MiniSkeleton landmarks={landmarks} status={status} />
      ) : (
        <MiniIdlePlaceholder />
      )}

      <OrbitControls
        enablePan={false}
        enableZoom={false}
        enableRotate={false}
        autoRotate
        autoRotateSpeed={0.4}
      />
    </Canvas>
  );
}

/* ═══════════════════════════════════════════════════════
   Patient Card (header → 3-D → vitals → status/actions)
   ═══════════════════════════════════════════════════════ */

function PatientCard({
  patient,
  state,
  onAcknowledge,
  onReset,
}: {
  patient: PatientInfo;
  state: PatientState;
  onAcknowledge: (roomId: string) => void;
  onReset: (roomId: string) => void;
}) {
  const { status } = state;
  const isFall = status === "FALL";
  const isAck = status === "ACKNOWLEDGED";
  const isResting = status === "RESTING";

  const border = isFall
    ? "border-red-500/50 shadow-[0_0_40px_-8px_rgba(239,68,68,0.25)]"
    : isAck
      ? "border-orange-500/40 shadow-[0_0_30px_-8px_rgba(249,115,22,0.15)]"
      : isResting
        ? "border-amber-500/30"
        : "border-slate-700/50 shadow-[0_0_40px_-12px_rgba(0,229,255,0.06)]";

  const riskCls: Record<string, string> = {
    HIGH: "bg-red-500/15 text-red-400 border-red-500/25",
    MODERATE: "bg-amber-500/15 text-amber-400 border-amber-500/25",
    LOW: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
  };

  const SC: Record<
    string,
    { dot: string; text: string; label: string }
  > = {
    FALL: {
      dot: "bg-red-500 animate-pulse",
      text: "text-red-400",
      label: "FALL DETECTED",
    },
    ACKNOWLEDGED: {
      dot: "bg-orange-400",
      text: "text-orange-400",
      label: "STAFF EN ROUTE",
    },
    RESTING: {
      dot: "bg-amber-400",
      text: "text-amber-400",
      label: "IN BED",
    },
    NORMAL: {
      dot: "bg-emerald-400",
      text: "text-emerald-400",
      label: "NORMAL",
    },
  };
  const sc = SC[status] ?? SC.NORMAL;

  return (
    <div
      className={`
        rounded-2xl border bg-slate-900/60 backdrop-blur-xl
        flex flex-col overflow-hidden transition-all duration-300
        ${border}
      `}
    >
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-800/50 shrink-0">
        <div className="flex items-center gap-2.5">
          <div
            className={`w-9 h-9 rounded-full flex items-center justify-center
              text-sm font-bold shrink-0 border ${
                isFall
                  ? "bg-red-500/20 border-red-500/30 text-red-400"
                  : isAck
                    ? "bg-orange-500/20 border-orange-500/30 text-orange-400"
                    : "bg-cyan-500/10 border-cyan-500/30 text-cyan-400"
              }`}
          >
            {patient.initials}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-white font-semibold text-sm">
                {patient.name}
              </span>
              <span className="text-slate-600 text-[10px] font-mono">
                {patient.room}
              </span>
            </div>
            <span className="text-slate-500 text-[10px]">
              {patient.condition} · {patient.attending}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {patient.isLive && (
            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-cyan-500/15 text-cyan-400 border border-cyan-500/25 flex items-center gap-1">
              <span className="w-1 h-1 rounded-full bg-cyan-400 animate-pulse" />
              LIVE
            </span>
          )}
          <span
            className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${riskCls[patient.risk]}`}
          >
            {patient.risk}
          </span>
        </div>
      </div>

      {/* ── 3-D Canvas ── */}
      <div className="flex-1 relative min-h-0">
        <MiniTwin landmarks={state.landmarks} status={status} />

        {/* CRT scanline overlay */}
        <div className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(0deg,transparent,transparent_2px,rgba(0,229,255,0.008)_2px,rgba(0,229,255,0.008)_4px)]" />

        {/* Corner frames */}
        <div className="pointer-events-none absolute top-0 left-0 w-5 h-5 border-t border-l border-cyan-500/15" />
        <div className="pointer-events-none absolute top-0 right-0 w-5 h-5 border-t border-r border-cyan-500/15" />
        <div className="pointer-events-none absolute bottom-0 left-0 w-5 h-5 border-b border-l border-cyan-500/15" />
        <div className="pointer-events-none absolute bottom-0 right-0 w-5 h-5 border-b border-r border-cyan-500/15" />

        {/* FALL overlay glow */}
        {isFall && (
          <div className="pointer-events-none absolute inset-0 rounded-none bg-red-500/5 animate-pulse" />
        )}
      </div>

      {/* ── Vitals Bar ── */}
      <div className="grid grid-cols-4 gap-px bg-slate-800/30 border-t border-slate-800/50 shrink-0">
        <VitalCell label="HR" value={`${patient.vitals.hr}`} unit="bpm" />
        <VitalCell label="SpO₂" value={`${patient.vitals.spo2}`} unit="%" />
        <VitalCell label="BP" value={patient.vitals.bp} unit="" />
        <VitalCell label="Temp" value={patient.vitals.temp} unit="°F" />
      </div>

      {/* ── Footer: Status + Actions ── */}
      <div className="flex items-center justify-between px-4 py-2 border-t border-slate-800/50 shrink-0">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${sc.dot}`} />
          <span
            className={`text-[10px] font-bold tracking-widest uppercase ${sc.text}`}
          >
            {sc.label}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {isFall && (
            <button
              onClick={() => onAcknowledge(patient.room)}
              className="px-3 py-1 text-[9px] font-black rounded-lg bg-red-600
                hover:bg-red-500 text-white border border-red-400/30
                shadow-[0_0_12px_rgba(239,68,68,0.3)] transition-all
                cursor-pointer uppercase tracking-wider animate-pulse"
            >
              Acknowledge
            </button>
          )}
          {isAck && (
            <button
              onClick={() => onReset(patient.room)}
              className="px-3 py-1 text-[9px] font-bold rounded-lg bg-white/10
                hover:bg-white/20 border border-white/20 transition-colors
                cursor-pointer text-white uppercase tracking-wider"
            >
              Resolve
            </button>
          )}
          <Link
            href={`/patient/${patient.room}`}
            className="px-3 py-1 text-[9px] font-bold rounded-lg
              bg-slate-800/80 hover:bg-slate-700/80 text-cyan-400
              hover:text-cyan-300 border border-slate-700/50
              hover:border-cyan-500/30 transition-all uppercase tracking-wider"
          >
            View →
          </Link>
        </div>
      </div>
    </div>
  );
}

function VitalCell({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit: string;
}) {
  return (
    <div className="px-2 py-1.5 text-center">
      <div className="text-[11px] font-bold text-white tabular-nums">
        {value}
        <span className="text-[8px] text-slate-500 ml-0.5">{unit}</span>
      </div>
      <div className="text-[8px] text-slate-600 uppercase tracking-wider">
        {label}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   Main Ward Dashboard
   ═══════════════════════════════════════════════════════ */

export default function WardDashboard() {
  /* ── Per-room state dictionary ── */
  const [patients, setPatients] = useState<Record<string, PatientState>>({
    "301-A": { ...DEFAULT_STATE },
    "302-B": { ...DEFAULT_STATE, status: "RESTING" },
    "303-C": { ...DEFAULT_STATE },
    "304-A": { ...DEFAULT_STATE },
  });

  const [connected, setConnected] = useState(false);
  const [clock, setClock] = useState(new Date());

  // Live clock
  useEffect(() => {
    const id = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  /* ── Single WebSocket — routes to per-room state ── */
  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout>;
    let alive = true;

    function connect() {
      if (!alive) return;
      ws = new WebSocket("ws://localhost:8000/ws/skeleton");

      ws.onopen = () => setConnected(true);

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          const roomId: string | undefined = data.room_id;
          if (!roomId) return;

          if (data.type === "skeleton_update") {
            setPatients((prev) => ({
              ...prev,
              [roomId]: {
                landmarks: data.landmarks ?? [],
                status:
                  (data.status as SystemStatus) ??
                  prev[roomId]?.status ??
                  "NORMAL",
                tracked: data.tracked ?? false,
              },
            }));
          } else if (data.type === "status_update") {
            setPatients((prev) => ({
              ...prev,
              [roomId]: {
                ...(prev[roomId] ?? DEFAULT_STATE),
                status: (data.status as SystemStatus) ?? "NORMAL",
              },
            }));
          }
        } catch {
          /* malformed frame */
        }
      };

      ws.onclose = () => {
        setConnected(false);
        if (alive) reconnectTimer = setTimeout(connect, 2000);
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

  /* ── Actions ── */
  const handleAcknowledge = useCallback(async (roomId: string) => {
    try {
      await fetch(`http://localhost:8000/api/acknowledge/${roomId}`, {
        method: "POST",
      });
    } catch {
      /* offline */
    }
  }, []);

  const handleReset = useCallback(async (roomId: string) => {
    try {
      await fetch(`http://localhost:8000/api/reset/${roomId}`, {
        method: "POST",
      });
    } catch {
      /* offline */
    }
  }, []);

  /* ── Aggregate stats ── */
  const alertCount = Object.values(patients).filter(
    (p) => p.status === "FALL" || p.status === "ACKNOWLEDGED"
  ).length;
  const restingCount = Object.values(patients).filter(
    (p) => p.status === "RESTING"
  ).length;
  const normalCount = PATIENTS.length - alertCount - restingCount;

  // Rooms with active FALL (for the ward-level banner)
  const fallingRooms = PATIENTS.filter(
    (p) => patients[p.room]?.status === "FALL"
  );

  return (
    <div className="h-screen w-screen bg-slate-950 text-white overflow-hidden flex flex-col">
      {/* ═══ Header ═══ */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-slate-800/70 bg-slate-950/80 backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-[11px] font-black tracking-tight shadow-[0_0_15px_rgba(0,229,255,0.2)]">
            MW
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-widest uppercase">
              Mosaic Ward
            </h1>
            <p className="text-[10px] text-slate-500 font-mono tracking-wide">
              HIPAA-Compliant Patient Monitoring · Nursing Station
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Clock */}
          <span className="text-[11px] font-mono text-slate-500 tabular-nums hidden sm:inline">
            {clock.toLocaleTimeString("en-US", { hour12: false })}
          </span>

          {/* Summary pills */}
          <div className="flex items-center gap-3 px-3 py-1.5 rounded-full bg-slate-800/60 border border-slate-700/40">
            <Pill color="bg-emerald-400" count={normalCount} />
            <Pill color="bg-amber-400" count={restingCount} />
            <Pill
              color={
                alertCount > 0
                  ? "bg-red-500 animate-pulse"
                  : "bg-slate-600"
              }
              count={alertCount}
            />
          </div>

          {/* Connection dot */}
          <div className="flex items-center gap-1.5">
            <span
              className={`w-2 h-2 rounded-full ${
                connected
                  ? "bg-emerald-400 shadow-[0_0_6px_#34d399]"
                  : "bg-red-500 animate-pulse"
              }`}
            />
            <span className="text-[10px] font-mono text-slate-400 uppercase">
              {connected ? "Online" : "Offline"}
            </span>
          </div>
        </div>
      </header>

      {/* ═══ Ward Alert Banner (any active FALL) ═══ */}
      {fallingRooms.length > 0 && (
        <div className="shrink-0 mx-3 mt-2 rounded-xl border border-red-500/40 bg-red-500/10 backdrop-blur-sm px-5 py-2.5 flex items-center justify-between animate-pulse">
          <div className="flex items-center gap-3">
            <span className="text-xl">🚨</span>
            <div>
              <p className="text-red-400 font-bold text-xs tracking-wide uppercase">
                Active Fall Alert —{" "}
                {fallingRooms
                  .map((p) => `${p.name} (${p.room})`)
                  .join(" · ")}
              </p>
            </div>
          </div>
          <Link
            href={`/patient/${fallingRooms[0].room}`}
            className="px-4 py-1.5 text-[10px] font-black rounded-lg bg-red-600 hover:bg-red-500 text-white border border-red-400/30 shadow-[0_0_15px_rgba(239,68,68,0.3)] transition-all uppercase tracking-wider"
          >
            Respond Now
          </Link>
        </div>
      )}

      {/* ═══ 2×2 Patient Grid ═══ */}
      <div className="flex-1 grid grid-cols-2 grid-rows-2 gap-3 p-3 min-h-0">
        {PATIENTS.map((patient) => (
          <PatientCard
            key={patient.room}
            patient={patient}
            state={patients[patient.room] ?? DEFAULT_STATE}
            onAcknowledge={handleAcknowledge}
            onReset={handleReset}
          />
        ))}
      </div>
    </div>
  );
}

/* ── tiny helper ── */
function Pill({ color, count }: { color: string; count: number }) {
  return (
    <div className="flex items-center gap-1">
      <span className={`w-1.5 h-1.5 rounded-full ${color}`} />
      <span className="text-[10px] font-mono text-slate-400 tabular-nums">
        {count}
      </span>
    </div>
  );
}
