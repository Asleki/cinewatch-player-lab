import { CineWatchPlayer } from "@/components/player/CineWatchPlayer";
import { samplePlayable } from "@/fixtures/playable.sample";

export default function Home() {
  return (
    <main className="lab-shell">
      <section className="lab-panel">
        <p className="eyebrow">CineWatch TV Engineering</p>
        <h2>Player Foundation 001</h2>
        <p className="boundary">
          Local qualification only. No media is committed to this public repository.
        </p>

        <CineWatchPlayer manifest={samplePlayable} />
      </section>
    </main>
  );
}
