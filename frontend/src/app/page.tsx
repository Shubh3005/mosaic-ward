"use client";

import dynamic from "next/dynamic";

const WardDashboard = dynamic(
  () => import("./components/WardDashboard"),
  {
    ssr: false,
    loading: () => (
      <div className="h-screen w-screen bg-slate-950 flex items-center justify-center">
        <span className="text-cyan-400/50 font-mono text-sm animate-pulse">
          Loading Ward Dashboard…
        </span>
      </div>
    ),
  }
);

export default function Home() {
  return <WardDashboard />;
}
