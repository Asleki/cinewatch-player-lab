import { CineWatchPlayer } from "@/components/player/CineWatchPlayer";
import { samplePlayable } from "@/fixtures/playable.sample";

export default function Home() {
  return (
    <main className="lab-shell">
      <section className="lab-panel">
        <header className="lab-heading">
          <div>
            <p className="eyebrow">CineWatch Player Lab</p>
            <h2>Player Foundation 001</h2>
          </div>

          <span className="lab-build-badge">Qualification</span>
        </header>

        <CineWatchPlayer manifest={samplePlayable} />

        <details className="lab-diagnostics">
          <summary>Engineering notes</summary>
          <p>
            Local qualification only. No media is committed to this public repository.
          </p>
        </details>
      </section>
    </main>
  );
}
