"use client";

import { DashboardView } from "../../../components/DashboardView";
import { useSession } from "../../../components/SessionProvider";

export default function Page() {
  const { user } = useSession();
  // SessionProvider no renderiza a sus hijos sin sesión, así que acá `user` siempre existe.
  if (!user) return null;
  return <DashboardView user={user} />;
}
