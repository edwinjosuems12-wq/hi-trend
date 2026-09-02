"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";

import { RouteSplash } from "@/components/auth/route-splash";
import { api, ApiError } from "@/lib/api";
import { routes } from "@/lib/routes";

type RouteState = "checking" | "ready" | "error";

function isExpectedUnauthenticated(error: unknown) {
  return error instanceof ApiError && error.status === 401;
}

export function PublicAuthRoute({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState<RouteState>("checking");

  useEffect(() => {
    let active = true;

    async function check() {
      try {
        await api.auth.me();
        if (active) router.replace(routes.dashboard);
        return;
      } catch (error) {
        if (!isExpectedUnauthenticated(error)) {
          if (active) setState("error");
          return;
        }
      }

      try {
        await api.auth.signup.get();
        if (active) router.replace(routes.onboarding);
      } catch (error) {
        if (!active) return;
        if (error instanceof ApiError && [404, 410].includes(error.status)) {
          setState("ready");
        } else {
          setState("error");
        }
      }
    }

    void check();
    return () => {
      active = false;
    };
  }, [pathname, router]);

  if (state === "checking") {
    return <RouteSplash />;
  }

  if (state === "error") {
    return (
      <RouteSplash tone="error">
        No pudimos comprobar tu sesión. Actualiza la página para intentarlo de
        nuevo.
      </RouteSplash>
    );
  }

  return <>{children}</>;
}
