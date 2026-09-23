import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";
import { LandingPosterRail } from "@/components/landing/poster-rail";

vi.mock("next/image", () => ({
  default: (props: { alt: string; src: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={props.alt} src={props.src} />
  ),
}));

describe("LandingPosterRail", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockImplementation((query) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }))
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("renders the rail container with accessible group label", () => {
    render(<LandingPosterRail />);
    const group = screen.getByRole("group", {
      name: /Diseños creados con HiTrendy/i,
    });
    expect(group).toBeInTheDocument();
  });

  test("renders poster cards including duplicated set for infinite loop", () => {
    const { container } = render(<LandingPosterRail />);
    const cards = container.querySelectorAll("[data-poster-card]");
    // 5 original posters duplicated once = 10 items
    expect(cards).toHaveLength(10);
  });
});
