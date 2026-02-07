"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import type { SystemStatus } from "./components/DigitalTwin";

/* ═══════════════════════════════════════════════════════
   Ward Patient Data
   ═══════════════════════════════════════════════════════ */

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

/* ═══════════════════════════════════════════════════════
   Ward Overview Page
   ═══════════════════════════════════════════════════════ */

export default function WardOverview() {
  const [roomStatuses, setRoomStatuses] = useState<Record<string, SystemStatus>>({
    "301-A": "NORMAL",
    "302-B": "RESTING",
    "303-C": "NORMAL",
    "304-A": "NORMAL",
  });
  const [connected, setConnected] = useState(false);
  const [clock, setClock] = useState(new Date());

  // Live clock
  useEffect(() => {
    const id = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // WebSocket — receives all room updates
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
          const roomId = data.room_id;
          const status = data.status as SystemStatus;
          if (roomId && status) {
            setRoomStatuses((prev) => ({ ...prev, [roomId]: status }));
          }
        } catch { /* ignore */ }
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

  // Aggregate stats
  const alertCount = Object.values(roomStatuses).filter(
    (s) => s === "FALL" || s === "ACKNOWLEDGED"
  ).length;
  const restingCount = Object.values(roomStatuses).filter(
    (s) => s === "RESTING"
  ).length;

  // Check for any active FALL (for ward-level alert bar)
  const fallingRooms = PATIENTS.filter(
    (p) => roomStatuses[p.room] === "FALL"
  );

  return (
    <div className="h-screen w-screen bg-slate-950 text-white overflow-hidden flex flex-col">
      {/* ═══ Header ═══ */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-slate-800/70 bg-slate-950/80 backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-xs font-black tracking-tight shadow-[0_0_20px_rgba(0,229,255,0.2)]">
            MW
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-widest uppercase">
              Mosaic Ward
            </h1>
            <p className="text-[10px] text-slate-500 font-mono tracking-wide">
              HIPAA-Compliant Patient Monitoring · Multi-Patient Dashboard
            </p>
          </div>
        </div>

        <div className="flex items-center gap-5">
          {/* Live clock */}
          <div className="text-xs font-mono text-slate-500 tabular-nums">
            {clock.toLocaleTimeString("en-US", { hour12: false })}
          </div>

          {/* Connection */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-800/60 border border-slate-700/40">
            <span
              className={`w-2 h-2 rounded-full ${
                connected
                  ? "bg-emerald-400 shadow-[0_0_6px_#34d399]"
                  : "bg-red-500 animate-pulse"
              }`}
            />
            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">
              {connected ? "Online" : "Offline"}
            </span>
          </div>

          {/* Patient count */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-cyan-500/10 border border-cyan-500/20">
            <span className="text-sm font-bold text-cyan-400 tabular-nums">
              {PATIENTS.length}
            </span>
            <span className="text-[10px] font-mono text-cyan-400/60 uppercase tracking-wider">
              Patients
            </span>
          </div>
        </div>
      </header>

      {/* ═══ Ward Alert Bar (if any FALL) ═══ */}
      {fallingRooms.length > 0 && (
        <div className="shrink-0 mx-4 mt-3 rounded-xl border border-red-500/40 bg-red-500/10 backdrop-blur-sm px-6 py-3 flex items-center justify-between animate-pulse">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🚨</span>
            <div>
              <p className="text-red-400 font-bold text-sm tracking-wide uppercase">
                Active Fall Alert — {fallingRooms.length} Patient{fallingRooms.length > 1 ? "s" : ""}
              </p>
              <p className="text-red-400/60 text-xs font-mono">
                {fallingRooms.map((p) => `${p.name} (Room ${p.room})`).join(" · ")}
              </p>
            </div>
          </div>
          <Link
            href={`/patient/${fallingRooms[0].room}`}
            className="px-5 py-2 text-xs font-black rounded-xl bg-red-600 hover:bg-red-500 text-white border border-red-400/30 shadow-[0_0_20px_rgba(239,68,68,0.3)] transition-all uppercase tracking-wider"
          >
            Respond Now
          </Link>
        </div>
      )}

      {/* ═══ Ward Summary Bar ═══ */}
      <div className="shrink-0 mx-4 mt-3 flex items-center gap-6 px-5 py-2.5 rounded-xl bg-slate-900/40 border border-slate-800/50">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-400" />
          <span className="text-xs text-slate-400 font-mono">
            <span className="text-slate-200 font-semibold">{PATIENTS.length - alertCount - restingCount}</span> Normal
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-amber-400" />
          <span className="text-xs text-slate-400 font-mono">
            <span className="text-slate-200 font-semibold">{restingCount}</span> Resting
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${alertCount > 0 ? "bg-red-500 animate-pulse" : "bg-slate-600"}`} />
          <span className="text-xs text-slate-400 font-mono">
            <span className={`font-semibold ${alertCount > 0 ? "text-red-400" : "text-slate-200"}`}>{alertCount}</span> Alert{alertCount !== 1 ? "s" : ""}
          </span>
        </div>
        <div className="ml-auto text-[10px] text-slate-600 font-mono">
          WARD TELEMETRY · 10 FPS SIM · 30 FPS LIVE
        </div>
      </div>

      {/* ═══ Patient Cards Grid ═══ */}
      <div className="flex-1 grid grid-cols-2 gap-4 p-4 min-h-0 overflow-auto">
        {PATIENTS.map((patient) => (
          <PatientCard
            key={patient.room}
            patient={patient}
            status={roomStatuses[patient.room] ?? "NORMAL"}
          />
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   Patient Card Component
   ═══════════════════════════════════════════════════════ */

function PatientCard({
  patient,
  status,
}: {
  patient: PatientInfo;
  status: SystemStatus;
}) {
  const isFall = status === "FALL";
  const isAck = status === "ACKNOWLEDGED";
  const isResting = status === "RESTING";

  const borderColor = isFall
    ? "border-red-500/50 shadow-[0_0_40px_-8px_rgba(239,68,68,0.25)]"
    : isAck
      ? "border-orange-500/40 shadow-[0_0_30px_-8px_rgba(249,115,22,0.15)]"
      : isResting
        ? "border-amber-500/25 shadow-[0_0_30px_-8px_rgba(240,184,64,0.08)]"
        : "border-slate-700/50 shadow-[0_0_40px_-12px_rgba(0,229,255,0.08)]";

  const riskStyles: Record<string, string> = {
    HIGH: "bg-red-500/15 text-red-400 border-red-500/25",
    MODERATE: "bg-amber-500/15 text-amber-400 border-amber-500/25",
    LOW: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
  };

  const statusConfig: Record<string, { dot: string; text: string; label: string; bg: string }> = {
    FALL: { dot: "bg-red-500 animate-pulse", text: "text-red-400", label: "FALL DETECTED", bg: "bg-red-500/10" },
    ACKNOWLEDGED: { dot: "bg-orange-400", text: "text-orange-400", label: "STAFF EN ROUTE", bg: "bg-orange-500/10" },
    RESTING: { dot: "bg-amber-400", text: "text-amber-400", label: "RESTING", bg: "bg-amber-500/10" },
    NORMAL: { dot: "bg-emerald-400", text: "text-emerald-400", label: "NORMAL", bg: "bg-emerald-500/10" },
  };
  const sc = statusConfig[status] ?? statusConfig.NORMAL;

  return (
    <div
      className={`
        rounded-2xl border bg-slate-900/60 backdrop-blur-xl
        p-5 flex flex-col gap-4 transition-all duration-300
        ${borderColor}
        ${isFall ? "animate-pulse" : ""}
      `}
    >
      {/* ── Card Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Avatar */}
          <div
            className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold shrink-0 border ${
              isFall
                ? "bg-red-500/20 border-red-500/30 text-red-400"
                : isAck
                  ? "bg-orange-500/20 border-orange-500/30 text-orange-400"
                  : "bg-gradient-to-br from-cyan-500/20 to-blue-600/20 border-cyan-500/30 text-cyan-400"
            }`}
          >
            {patient.initials}
          </div>
          {/* Name + Room */}
          <div>
            <h2 className="text-white font-semibold text-base leading-tight">
              {patient.name}
            </h2>
            <span className="text-slate-500 text-xs font-mono">
              Room {patient.room}
            </span>
          </div>
        </div>

        {/* Badges: Risk + Live */}
        <div className="flex items-center gap-2">
          {patient.isLive && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/15 text-cyan-400 border border-cyan-500/25 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
              LIVE
            </span>
          )}
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-bold border tracking-wide ${riskStyles[patient.risk]}`}
          >
            {patient.risk}
          </span>
        </div>
      </div>

      {/* ── Condition + Attending ── */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-amber-400/80 font-medium truncate">
          {patient.condition}
        </span>
        <span className="text-slate-500 text-xs shrink-0 ml-2">
          {patient.attending}
        </span>
      </div>

      {/* ── Status Badge ── */}
      <div
        className={`flex items-center gap-2 px-3 py-2 rounded-lg ${sc.bg}`}
      >
        <span className={`w-2.5 h-2.5 rounded-full ${sc.dot}`} />
        <span className={`text-xs font-bold tracking-widest uppercase ${sc.text}`}>
          {sc.label}
        </span>
      </div>

      {/* ── Vitals Row ── */}
      <div className="grid grid-cols-4 gap-2">
        <VitalMini label="HR" value={`${patient.vitals.hr}`} unit="bpm" status={status} />
        <VitalMini label="SpO₂" value={`${patient.vitals.spo2}`} unit="%" status={status} />
        <VitalMini label="BP" value={patient.vitals.bp} unit="mmHg" status={status} />
        <VitalMini label="Temp" value={patient.vitals.temp} unit="°F" status={status} />
      </div>

      {/* ── Activity Indicator ── */}
      <MiniWaveform status={status} />

      {/* ── View Button ── */}
      <Link
        href={`/patient/${patient.room}`}
        className={`
          w-full py-3 rounded-xl text-center text-sm font-bold uppercase tracking-widest
          transition-all duration-200 flex items-center justify-center gap-2
          ${
            isFall
              ? "bg-red-600 hover:bg-red-500 text-white shadow-[0_0_20px_rgba(239,68,68,0.3)]"
              : isAck
                ? "bg-orange-600/80 hover:bg-orange-500 text-white shadow-[0_0_15px_rgba(249,115,22,0.2)]"
                : "bg-slate-800/80 hover:bg-slate-700/80 text-cyan-400 hover:text-cyan-300 border border-slate-700/50 hover:border-cyan-500/30"
          }
        `}
      >
        {isFall ? "Respond — View Twin" : "View Digital Twin"}
        <span className="text-lg">→</span>
      </Link>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   Mini Vital Display
   ═══════════════════════════════════════════════════════ */

function VitalMini({
  label,
  value,
  unit,
  status,
}: {
  label: string;
  value: string;
  unit: string;
  status: SystemStatus;
}) {
  const color =
    status === "FALL" ? "text-red-300" : status === "ACKNOWLEDGED" ? "text-orange-300" : "text-white";

  return (
    <div className="bg-slate-800/40 rounded-lg px-2.5 py-2 text-center">
      <div className={`text-sm font-bold tabular-nums ${color}`}>
        {value}
        <span className="text-[9px] font-normal text-slate-500 ml-0.5">{unit}</span>
      </div>
      <div className="text-[9px] text-slate-500 uppercase tracking-wider mt-0.5">
        {label}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   Mini Waveform (ambient activity indicator per card)
   ═══════════════════════════════════════════════════════ */

function MiniWaveform({ status }: { status: SystemStatus }) {
  const polyRef = useRef<SVGPolylineElement>(null);

  const color =
    status === "FALL" ? "#ef4444"
      : status === "ACKNOWLEDGED" ? "#f97316"
      : status === "RESTING" ? "#f0b840"
      : "#00e5ff";

  useEffect(() => {
    const buffer = new Array(80).fill(0);
    let phase = Math.random() * 10;
    let lastTick = 0;
    let handle: number;

    const tick = (t: number) => {
      if (t - lastTick > 60) {
        buffer.shift();
        const amplitude = status === "RESTING" ? 1 : status === "FALL" ? 4 : 2;
        const speed = status === "RESTING" ? 0.15 : status === "FALL" ? 0.6 : 0.3;
        buffer.push(
          Math.sin(phase) * amplitude +
          Math.sin(phase * 2.7) * (amplitude * 0.3)
        );
        phase += speed;
        lastTick = t;
        polyRef.current?.setAttribute(
          "points",
          buffer.map((y, x) => `${x * 2.5},${15 - y * 2}`).join(" ")
        );
      }
      handle = requestAnimationFrame(tick);
    };
    handle = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(handle);
  }, [status]);

  return (
    <div className="bg-slate-800/30 rounded-lg px-2 py-1">
      <svg
        viewBox="0 0 200 30"
        className="w-full h-6"
        preserveAspectRatio="none"
      >
        <polyline
          ref={polyRef}
          fill="none"
          stroke={color}
          strokeWidth="1.2"
          strokeLinejoin="round"
          opacity={0.6}
        />
      </svg>
    </div>
  );
}
