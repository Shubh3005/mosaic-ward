"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import type { SkeletonFrame, SystemStatus } from "./DigitalTwin";

/* ═══════════════════════════════════════════════════════
   Dynamic import — Three.js must NOT be server-rendered
   ═══════════════════════════════════════════════════════ */

const DigitalTwin = dynamic(() => import("./DigitalTwin"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center">
      <span className="text-cyan-400/50 font-mono text-sm animate-pulse">
        Initializing 3D Engine…
      </span>
    </div>
  ),
});

/* ═══════════════════════════════════════════════════════
   Patient Data Registry
   ═══════════════════════════════════════════════════════ */

interface PatientData {
  name: string;
  initials: string;
  ward: string;
  condition: string;
  risk: string;
  riskColor: string;
  attending: string;
  admitted: string;
}

export const WARD_PATIENTS: Record<string, PatientData> = {
  "301-A": { name: "James R.", initials: "JR", ward: "Cardiology — Rm 301", condition: "Cardiac Monitoring", risk: "MODERATE", riskColor: "amber", attending: "Dr. Chen", admitted: "Jan 28, 2026" },
  "302-B": { name: "Elena K.", initials: "EK", ward: "Orthopedic — Rm 302", condition: "Post-op Knee Replacement", risk: "LOW", riskColor: "emerald", attending: "Dr. Patel", admitted: "Feb 1, 2026" },
  "303-C": { name: "Robert M.", initials: "RM", ward: "General — Rm 303", condition: "Fall Recovery", risk: "HIGH", riskColor: "red", attending: "Dr. Kim", admitted: "Jan 30, 2026" },
  "304-A": { name: "Martha V.", initials: "MV", ward: "Orthopedic — Rm 304", condition: "Post-op Hip Replacement", risk: "HIGH", riskColor: "red", attending: "Dr. Ramirez", admitted: "Feb 2, 2026" },
};

const MOCK_VITALS: Record<string, { hr: number; spo2: number; bp: string; temp: string }> = {
  "301-A": { hr: 82, spo2: 97, bp: "128/82", temp: "98.4" },
  "302-B": { hr: 68, spo2: 99, bp: "118/76", temp: "98.2" },
  "303-C": { hr: 88, spo2: 96, bp: "132/86", temp: "98.8" },
  "304-A": { hr: 80, spo2: 98, bp: "120/80", temp: "98.6" },
};

/* ═══════════════════════════════════════════════════════
   Terminal simulation data
   ═══════════════════════════════════════════════════════ */

const NORMAL_LOGS = [
  "[SYSTEM] Processing Frame…",
  "[AI] Gait Analysis: Stable",
  "[WEBSOCKET] Latency: 12ms",
  "[POSE] 33 Landmarks Detected",
  "[AI] Confidence: 98.2%",
  "[SYSTEM] Buffer: Nominal",
  "[HIPAA] Data Stream: Coordinates Only ✓",
  "[AI] Stride Length: Normal Range",
  "[SYSTEM] Memory: 124 MB",
  "[POSE] Tracking Quality: HIGH",
  "[WEBSOCKET] Heartbeat OK",
  "[AI] Fall Risk Assessment: LOW",
  "[SYSTEM] Frame Rate: 30 FPS",
  "[HIPAA] No PII in transmission ✓",
  "[AI] Posture Score: 94/100",
  "[SYSTEM] GPU Utilization: 34%",
  "[POSE] Visibility Avg: 0.92",
  "[AI] Gait Symmetry: 97%",
];

const FALL_LOGS = [
  "[🚨 ALERT] FALL DETECTED — Confidence: 97.3%",
  "[SYSTEM] ⚠ Emergency Protocol ACTIVATED",
  "[TWILIO] Dispatching Call to Attending…",
  "[AI] Reclassifying Posture: HORIZONTAL",
  "[SYSTEM] Recording Incident…",
  "[AI] Impact Velocity: 1.2 m/s",
  "[SYSTEM] Notifying Nurse Station…",
  "[HIPAA] Incident logged — no video stored ✓",
];

const ACKNOWLEDGED_LOGS = [
  "[NURSE] Alert Acknowledged — Staff En Route",
  "[SYSTEM] Alarm Muted — Staff Responding",
  "[AI] Continuing Posture Monitoring…",
  "[SYSTEM] Incident Timer: Active",
  "[POSE] Patient Position: Unchanged",
  "[WEBSOCKET] Latency: 10ms",
  "[HIPAA] Incident log open — no video ✓",
  "[AI] Awaiting Patient Recovery Signal",
  "[SYSTEM] Re-arm on NORMAL/RESTING detection",
];

const RESTING_LOGS = [
  "[AI] Patient in Safe Zone ✓",
  "[SYSTEM] Monitoring: Passive Mode",
  "[POSE] Posture: Reclined — Stable",
  "[AI] Fall Risk: MINIMAL (in bed)",
  "[SYSTEM] Safe Zone Boundary: Active",
  "[WEBSOCKET] Latency: 11ms",
  "[AI] Sleep Quality Estimate: Good",
  "[HIPAA] Data Stream: Coordinates Only ✓",
  "[SYSTEM] Frame Rate: 30 FPS",
  "[POSE] Visibility Avg: 0.87",
  "[AI] Movement: Minimal — Expected",
];

/* ═══════════════════════════════════════════════════════
   Shared Glass Panel wrapper
   ═══════════════════════════════════════════════════════ */

function GlassPanel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`
        rounded-2xl border border-slate-700/50
        bg-slate-900/60 backdrop-blur-xl
        shadow-[0_0_40px_-12px_rgba(0,229,255,0.08)]
        p-5 overflow-hidden
        ${className}
      `}
    >
      {children}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   Widget: Patient Profile Card
   ═══════════════════════════════════════════════════════ */

function PatientProfile({ status, patient, roomId }: { status: SystemStatus; patient: PatientData; roomId: string }) {
  const riskStyles: Record<string, string> = {
    red: "bg-red-500/15 text-red-400 border-red-500/25",
    amber: "bg-amber-500/15 text-amber-400 border-amber-500/25",
    emerald: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
  };

  return (
    <GlassPanel className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-cyan-500/20 to-blue-600/20 border border-cyan-500/30 flex items-center justify-center text-lg font-bold text-cyan-400 shrink-0">
          {patient.initials}
        </div>
        <div className="min-w-0">
          <h2 className="text-white font-semibold text-lg leading-tight truncate">
            {patient.name}
          </h2>
          <span className="text-slate-400 text-xs font-mono">
            Patient ID: {roomId}
          </span>
        </div>
      </div>

      <div className="space-y-2.5 text-sm">
        <Row label="Ward" value={patient.ward} />
        <Row label="Condition" value={patient.condition} valueClass="text-amber-400" />
        <div className="flex justify-between items-center">
          <span className="text-slate-400">Risk Level</span>
          <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold border tracking-wide ${riskStyles[patient.riskColor] ?? riskStyles.red}`}>
            {patient.risk} RISK
          </span>
        </div>
        <Row label="Attending" value={patient.attending} />
        <Row label="Admitted" value={patient.admitted} />
      </div>

      <div
        className={`mt-auto pt-3 border-t border-slate-700/40 text-xs font-mono flex items-center gap-2 ${
          status === "FALL" ? "text-red-400"
            : status === "ACKNOWLEDGED" ? "text-orange-400"
            : status === "RESTING" ? "text-amber-400"
            : "text-emerald-400"
        }`}
      >
        <span
          className={`inline-block w-1.5 h-1.5 rounded-full ${
            status === "FALL" ? "bg-red-400 animate-pulse"
              : status === "ACKNOWLEDGED" ? "bg-orange-400"
              : status === "RESTING" ? "bg-amber-400"
              : "bg-emerald-400"
          }`}
        />
        {status === "FALL" ? "ALERT ACTIVE"
          : status === "ACKNOWLEDGED" ? "STAFF RESPONDING"
          : status === "RESTING" ? "PATIENT RESTING"
          : "MONITORING ACTIVE"}
      </div>
    </GlassPanel>
  );
}

function Row({
  label,
  value,
  valueClass = "text-slate-200",
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-slate-500 shrink-0">{label}</span>
      <span className={`font-medium truncate ${valueClass}`}>{value}</span>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   Widget: Vital Signs HUD
   ═══════════════════════════════════════════════════════ */

function VitalSigns({ status, vitals }: { status: SystemStatus; vitals: { hr: number; spo2: number; bp: string; temp: string } }) {
  const waveColor =
    status === "FALL" ? "#ef4444" : status === "ACKNOWLEDGED" ? "#f97316"
    : status === "RESTING" ? "#f0b840" : "#00e5ff";
  const spo2Color =
    status === "FALL" ? "#ef4444" : status === "ACKNOWLEDGED" ? "#ea580c"
    : status === "RESTING" ? "#d4a030" : "#22d3ee";

  return (
    <GlassPanel className="flex flex-col gap-3">
      <h3 className="text-[10px] font-mono text-slate-500 uppercase tracking-[0.2em]">
        Vital Signs
      </h3>

      <div className="flex items-center justify-between">
        <div>
          <div className="text-2xl font-bold text-white tabular-nums leading-none">
            {vitals.hr}{" "}
            <span className="text-sm font-normal text-slate-500">bpm</span>
          </div>
          <div className="text-[10px] text-slate-500 uppercase tracking-wider mt-1">
            Heart Rate
          </div>
        </div>
        <ECGWaveform color={waveColor} />
      </div>

      <div className="h-px bg-slate-700/40" />

      <div className="flex items-center justify-between">
        <div>
          <div className="text-2xl font-bold text-white tabular-nums leading-none">
            {vitals.spo2}
            <span className="text-sm font-normal text-slate-500">%</span>
          </div>
          <div className="text-[10px] text-slate-500 uppercase tracking-wider mt-1">
            SpO₂
          </div>
        </div>
        <SineWaveform color={spo2Color} />
      </div>

      <div className="h-px bg-slate-700/40" />

      <div>
        <div className="text-2xl font-bold text-white tabular-nums leading-none">
          {vitals.bp}{" "}
          <span className="text-sm font-normal text-slate-500">mmHg</span>
        </div>
        <div className="text-[10px] text-slate-500 uppercase tracking-wider mt-1">
          Blood Pressure
        </div>
      </div>

      <div className="h-px bg-slate-700/40" />

      <div>
        <div className="text-2xl font-bold text-white tabular-nums leading-none">
          {vitals.temp}
          <span className="text-sm font-normal text-slate-500">°F</span>
        </div>
        <div className="text-[10px] text-slate-500 uppercase tracking-wider mt-1">
          Temperature
        </div>
      </div>
    </GlassPanel>
  );
}

function ECGWaveform({ color }: { color: string }) {
  const polyRef = useRef<SVGPolylineElement>(null);

  useEffect(() => {
    const pattern = [
      0, 0, 0, 0, 0, -1, 6, -2.5, 0.5, 0, 0, 0, 0, 1, 2, 1, 0, 0, 0, 0,
    ];
    const buffer = new Array(60).fill(0);
    let idx = 0;
    let lastTick = 0;
    let handle: number;

    const tick = (t: number) => {
      if (t - lastTick > 55) {
        buffer.shift();
        buffer.push(pattern[idx % pattern.length]);
        idx++;
        lastTick = t;
        polyRef.current?.setAttribute(
          "points",
          buffer.map((y, x) => `${x * 2.5},${25 - y * 3}`).join(" ")
        );
      }
      handle = requestAnimationFrame(tick);
    };
    handle = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(handle);
  }, []);

  return (
    <svg viewBox="0 0 150 50" className="w-28 h-10 shrink-0" preserveAspectRatio="none">
      <polyline ref={polyRef} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function SineWaveform({ color }: { color: string }) {
  const polyRef = useRef<SVGPolylineElement>(null);

  useEffect(() => {
    const buffer = new Array(60).fill(0);
    let phase = 0;
    let lastTick = 0;
    let handle: number;

    const tick = (t: number) => {
      if (t - lastTick > 55) {
        buffer.shift();
        buffer.push(Math.sin(phase) * 3 + Math.sin(phase * 0.3));
        phase += 0.35;
        lastTick = t;
        polyRef.current?.setAttribute(
          "points",
          buffer.map((y, x) => `${x * 2.5},${25 - y * 3}`).join(" ")
        );
      }
      handle = requestAnimationFrame(tick);
    };
    handle = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(handle);
  }, []);

  return (
    <svg viewBox="0 0 150 50" className="w-28 h-10 shrink-0" preserveAspectRatio="none">
      <polyline ref={polyRef} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

/* ═══════════════════════════════════════════════════════
   Widget: Confidence Gauge
   ═══════════════════════════════════════════════════════ */

function ConfidenceGauge({ status }: { status: SystemStatus }) {
  const confidence = status === "FALL" ? 97 : 98;
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (confidence / 100) * circumference;
  const accentColor =
    status === "FALL" ? "#ef4444" : status === "ACKNOWLEDGED" ? "#f97316"
    : status === "RESTING" ? "#f0b840" : "#00e5ff";

  return (
    <GlassPanel className="flex flex-col items-center justify-center gap-4">
      <h3 className="text-[10px] font-mono text-slate-500 uppercase tracking-[0.2em] self-start">
        AI Confidence
      </h3>

      <div className="relative w-36 h-36">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
          <circle cx="60" cy="60" r={radius} fill="none" stroke="#1e293b" strokeWidth="6" />
          <circle
            cx="60" cy="60" r={radius} fill="none"
            stroke={accentColor} strokeWidth="6" strokeLinecap="round"
            strokeDasharray={circumference} strokeDashoffset={offset}
            className="transition-all duration-700 ease-out"
            style={{ filter: `drop-shadow(0 0 8px ${accentColor})` }}
          />
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {status === "FALL" ? (
            <span className="text-red-500 font-bold text-sm text-center animate-pulse leading-tight">
              CRITICAL<br />ALERT
            </span>
          ) : (
            <>
              <span className="text-3xl font-bold text-white tabular-nums">{confidence}%</span>
              <span className="text-[10px] text-slate-500 uppercase tracking-wider">
                {status === "ACKNOWLEDGED" ? "Responding" : status === "RESTING" ? "Resting" : "Stable"}
              </span>
            </>
          )}
        </div>
      </div>

      <div className={`text-xs font-mono text-center ${
        status === "FALL" ? "text-red-400 animate-pulse"
          : status === "ACKNOWLEDGED" ? "text-orange-400/70"
          : status === "RESTING" ? "text-amber-400/70"
          : "text-cyan-400/60"
      }`}>
        {status === "FALL" ? "⚠ FALL DETECTED — ALERTING STAFF"
          : status === "ACKNOWLEDGED" ? "Staff responding — monitoring"
          : status === "RESTING" ? "Patient safely in bed"
          : "All systems nominal"}
      </div>
    </GlassPanel>
  );
}

/* ═══════════════════════════════════════════════════════
   Widget: Live System Terminal
   ═══════════════════════════════════════════════════════ */

function SystemTerminal({ status }: { status: SystemStatus }) {
  const [logs, setLogs] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const addLog = () => {
      const now = new Date().toLocaleTimeString("en-US", { hour12: false });
      const pool =
        status === "FALL" ? FALL_LOGS
          : status === "ACKNOWLEDGED" ? ACKNOWLEDGED_LOGS
          : status === "RESTING" ? RESTING_LOGS
          : NORMAL_LOGS;
      const msg = pool[Math.floor(Math.random() * pool.length)];
      setLogs((prev) => [...prev.slice(-60), `${now} ${msg}`]);
    };

    addLog();
    const id = setInterval(addLog, 1000 + Math.random() * 800);
    return () => clearInterval(id);
  }, [status]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [logs]);

  return (
    <GlassPanel className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3 className="text-[10px] font-mono text-slate-500 uppercase tracking-[0.2em]">
          System Log
        </h3>
        <div className="flex gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500/50" />
          <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/50" />
          <span className="w-2.5 h-2.5 rounded-full bg-green-500/50" />
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto font-mono text-[11px] leading-relaxed space-y-0.5 scrollbar-thin"
      >
        {logs.map((log, i) => (
          <div
            key={i}
            className={
              log.includes("ALERT") || log.includes("FALL") ? "text-red-400"
                : log.includes("[AI]") ? "text-cyan-400"
                : log.includes("[WEBSOCKET]") ? "text-emerald-400"
                : log.includes("[HIPAA]") ? "text-violet-400"
                : "text-slate-500"
            }
          >
            {log}
          </div>
        ))}
        <span className="inline-block w-1.5 h-3.5 bg-cyan-400/70 animate-pulse" />
      </div>
    </GlassPanel>
  );
}

/* ═══════════════════════════════════════════════════════
   Widget: Nurse Action Panel
   ═══════════════════════════════════════════════════════ */

function NurseActionPanel({
  status,
  onAcknowledge,
  onReset,
  patientName,
  roomId,
}: {
  status: SystemStatus;
  onAcknowledge: () => void;
  onReset: () => void;
  patientName: string;
  roomId: string;
}) {
  if (status === "NORMAL" || status === "RESTING") return null;

  if (status === "ACKNOWLEDGED") {
    return (
      <div className="shrink-0 mx-3 mt-3 rounded-xl border border-orange-500/30 bg-orange-500/10 backdrop-blur-sm px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🏥</span>
          <div>
            <p className="text-orange-300 font-bold text-sm tracking-wide uppercase">
              Assistance En Route
            </p>
            <p className="text-orange-400/60 text-xs font-mono">
              Alarm muted — staff responding to Room {roomId}
            </p>
          </div>
        </div>
        <button
          onClick={onReset}
          className="px-4 py-1.5 text-xs font-bold rounded-lg bg-white/10 hover:bg-white/20 border border-white/20 transition-colors cursor-pointer text-white"
        >
          RESOLVE &amp; RESET
        </button>
      </div>
    );
  }

  return (
    <div className="shrink-0 mx-3 mt-3 rounded-xl border border-red-500/40 bg-red-500/10 backdrop-blur-sm px-6 py-4 flex items-center justify-between animate-pulse">
      <div className="flex items-center gap-3">
        <span className="text-3xl">🚨</span>
        <div>
          <p className="text-red-400 font-bold text-base tracking-wide uppercase">
            Fall Detected — Immediate Action Required
          </p>
          <p className="text-red-400/60 text-xs font-mono">
            Patient {patientName} · Room {roomId} · AI Confidence 97%
          </p>
        </div>
      </div>
      <button
        onClick={onAcknowledge}
        className="px-6 py-2.5 text-sm font-black rounded-xl bg-red-600 hover:bg-red-500 text-white border border-red-400/30 shadow-[0_0_20px_rgba(239,68,68,0.3)] transition-all cursor-pointer uppercase tracking-wider"
      >
        Acknowledge Alert
      </button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   Main Dashboard — "Command Center" Bento Layout
   ═══════════════════════════════════════════════════════ */

interface DashboardProps {
  roomId: string;
}

export default function Dashboard({ roomId }: DashboardProps) {
  const patient = WARD_PATIENTS[roomId] ?? WARD_PATIENTS["304-A"];
  const vitals = MOCK_VITALS[roomId] ?? MOCK_VITALS["304-A"];
  const [status, setStatus] = useState<SystemStatus>("NORMAL");

  const handleStatusChange = useCallback(
    (s: SystemStatus) => setStatus(s),
    []
  );

  // Fallback: poll REST status endpoint for this room
  useEffect(() => {
    const poll = setInterval(async () => {
      try {
        const res = await fetch(`http://localhost:8000/api/status/${roomId}`);
        const data = await res.json();
        if (["FALL", "NORMAL", "RESTING", "ACKNOWLEDGED"].includes(data.status)) {
          setStatus(data.status);
        }
      } catch {
        // Backend offline
      }
    }, 2000);
    return () => clearInterval(poll);
  }, [roomId]);

  const resetSystem = async () => {
    try {
      await fetch(`http://localhost:8000/api/reset/${roomId}`, { method: "POST" });
      setStatus("NORMAL");
    } catch { /* offline */ }
  };

  const acknowledgeAlert = async () => {
    try {
      await fetch(`http://localhost:8000/api/acknowledge/${roomId}`, { method: "POST" });
      setStatus("ACKNOWLEDGED");
    } catch { /* offline */ }
  };

  return (
    <div className="h-screen w-screen bg-slate-950 text-white overflow-hidden flex flex-col">
      {/* ═══ Header Bar ═══ */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-slate-800/70 bg-slate-950/80 backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="w-9 h-9 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-[11px] font-black tracking-tight hover:scale-105 transition-transform"
            title="Back to Ward"
          >
            MW
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold tracking-widest uppercase">
                Mosaic Ward
              </h1>
              <span className="text-slate-600 text-xs">·</span>
              <Link href="/" className="text-xs text-cyan-400/70 hover:text-cyan-400 font-mono transition-colors">
                ← Ward View
              </Link>
            </div>
            <p className="text-[10px] text-slate-500 font-mono tracking-wide">
              Room {roomId} · {patient.name} · {patient.condition}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-mono ${
              status === "FALL"
                ? "bg-red-500/15 text-red-400 border border-red-500/30 animate-pulse"
                : status === "ACKNOWLEDGED"
                  ? "bg-orange-500/15 text-orange-400 border border-orange-500/30"
                  : status === "RESTING"
                    ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                    : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                status === "FALL" ? "bg-red-500"
                  : status === "ACKNOWLEDGED" ? "bg-orange-400"
                  : status === "RESTING" ? "bg-amber-400"
                  : "bg-emerald-400"
              }`}
            />
            {status === "FALL" ? "FALL DETECTED"
              : status === "ACKNOWLEDGED" ? "ACKNOWLEDGED"
              : status === "RESTING" ? "PATIENT RESTING"
              : "ALL CLEAR"}
          </div>
        </div>
      </header>

      {/* ═══ Nurse Action Panel ═══ */}
      <NurseActionPanel
        status={status}
        onAcknowledge={acknowledgeAlert}
        onReset={resetSystem}
        patientName={patient.name}
        roomId={roomId}
      />

      {/* ═══ Bento Grid ═══ */}
      <div className="flex-1 grid grid-cols-[340px_1fr_340px] grid-rows-2 gap-3 p-3 min-h-0">
        <PatientProfile status={status} patient={patient} roomId={roomId} />

        <div className="row-span-2 rounded-2xl border border-slate-700/50 bg-slate-900/40 overflow-hidden relative">
          <DigitalTwin roomId={roomId} onStatusChange={handleStatusChange} />

          <div className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(0deg,transparent,transparent_2px,rgba(0,229,255,0.012)_2px,rgba(0,229,255,0.012)_4px)]" />
          <div className="pointer-events-none absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-cyan-500/20 rounded-tl-2xl" />
          <div className="pointer-events-none absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-cyan-500/20 rounded-tr-2xl" />
          <div className="pointer-events-none absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-cyan-500/20 rounded-bl-2xl" />
          <div className="pointer-events-none absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-cyan-500/20 rounded-br-2xl" />
        </div>

        <ConfidenceGauge status={status} />
        <VitalSigns status={status} vitals={vitals} />
        <SystemTerminal status={status} />
      </div>
    </div>
  );
}
