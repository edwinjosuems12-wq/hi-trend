import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { PublicAuthRoute } from "@/components/auth/public-auth-route";
import { ApiError } from "@/lib/api";

const replace = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => "/login",
  useRouter: () => ({ replace, refresh: vi.fn() }),
}));

const me = vi.fn();
const getSignup = vi.fn();

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    api: {
      auth: {
        me: () => me(),
        signup: { get: () => getSignup() },
      },
    },
  };
});

function unauthenticated() {
  return new ApiError(401, "UNAUTHORIZED", "Sesión requerida.", false);
}

describe("PublicAuthRoute", () => {
  beforeEach(() => {
    replace.mockClear();
    me.mockReset();
    getSignup.mockReset();
  });

  test("shows the form when the session check itself fails", async () => {
    me.mockRejectedValue(
      new ApiError(500, "INTERNAL", "Error del servidor.", true)
    );

    render(
      <PublicAuthRoute>
        <p>Formulario</p>
      </PublicAuthRoute>
    );

    expect(await screen.findByText("Formulario")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  test("offers an unfinished registration without taking over the page", async () => {
    me.mockRejectedValue(unauthenticated());
    getSignup.mockResolvedValue({ current_step: "business" });

    render(
      <PublicAuthRoute onPendingSignup="notice">
        <p>Formulario</p>
      </PublicAuthRoute>
    );

    expect(await screen.findByText("Formulario")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Continuar registro" })
    ).toHaveAttribute("href", "/onboarding");
    expect(replace).not.toHaveBeenCalled();
  });

  test("resumes the wizard where starting over is not possible", async () => {
    me.mockRejectedValue(unauthenticated());
    getSignup.mockResolvedValue({ current_step: "business" });

    render(
      <PublicAuthRoute>
        <p>Formulario</p>
      </PublicAuthRoute>
    );

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/onboarding"));
  });

  test("renders the form when there is no registration to resume", async () => {
    me.mockRejectedValue(unauthenticated());
    getSignup.mockRejectedValue(
      new ApiError(404, "SIGNUP_NOT_FOUND", "No hay registro.", false)
    );

    render(
      <PublicAuthRoute onPendingSignup="notice">
        <p>Formulario</p>
      </PublicAuthRoute>
    );

    expect(await screen.findByText("Formulario")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  test("sends an authenticated visitor to the dashboard", async () => {
    me.mockResolvedValue({ user: { id: "u1" } });

    render(
      <PublicAuthRoute>
        <p>Formulario</p>
      </PublicAuthRoute>
    );

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/dashboard"));
    expect(screen.queryByText("Formulario")).not.toBeInTheDocument();
  });
});
