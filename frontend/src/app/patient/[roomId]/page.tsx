"use client";

import { useParams } from "next/navigation";
import Dashboard from "../../components/Dashboard";

export default function PatientPage() {
  const params = useParams<{ roomId: string }>();
  const roomId = params.roomId ?? "304-A";

  return <Dashboard roomId={roomId} />;
}
