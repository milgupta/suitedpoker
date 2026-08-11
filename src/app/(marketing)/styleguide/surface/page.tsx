import type { Metadata } from "next";
import Link from "next/link";
import { SurfaceStates } from "./surface-states";

export const metadata: Metadata = {
  title: "Game surface styleguide",
  description: "The tableless game surface in every meaningful state.",
  robots: { index: false, follow: false },
};

export default function SurfaceStyleguidePage() {
  return (
    <div className="mx-auto max-w-(--container-app) px-4 py-10">
      <header>
        <Link href="/styleguide" className="text-accent-bright text-body-sm hover:underline">
          ← Design system
        </Link>
        <h1 className="text-display-lg mt-3">The game surface</h1>
        <p className="text-text-secondary text-body-lg mt-3 max-w-[52ch]">
          Three horizontal bands on the canvas — no oval, no felt, no ring. These are SCRIPTED PROP
          states, not engine-driven ones: the surface components are presentational and hold no game
          state, so every state below is exactly a set of props. The engine-driven table lives on
          /styleguide/table until the screens migrate.
        </p>
      </header>

      <div className="mt-10">
        <SurfaceStates />
      </div>
    </div>
  );
}
