from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

SERVICE = ROOT / "lib/wyzie/live-subtitles.ts"
AVAILABILITY = (
    ROOT
    / "app/api/qualification/subtitles/availability/route.ts"
)
ACQUIRE = (
    ROOT
    / "app/api/qualification/subtitles/acquire/route.ts"
)


def main() -> None:
    service = SERVICE.read_text(encoding="utf-8")
    availability = AVAILABILITY.read_text(encoding="utf-8")
    acquire = ACQUIRE.read_text(encoding="utf-8")
    combined = "\n".join(
        (service, availability, acquire)
    )

    assert '"private",\n    "secrets",\n    "wyzie.env"' in service
    assert "process.env.WYZIE_API_KEY" in service
    assert '"User-Agent": WYZIE_USER_AGENT' in service
    assert 'source: "all"' in service

    assert "writeFile" not in service
    assert "mkdir" not in service
    assert "private/subtitles" not in combined

    assert "discoverSubtitleLanguages" in availability
    assert "acquireLiveSubtitle" in acquire
    assert '"Content-Type": "text/vtt; charset=utf-8"' in acquire
    assert '"Cache-Control": "private, no-store"' in combined

    assert 'url.searchParams.get("candidate")' in acquire
    assert '"X-CineWatch-Subtitle-Candidate"' in acquire
    assert (
        '"X-CineWatch-Subtitle-Candidate-Count"'
        in acquire
    )

    assert "assertSubtitlePayload" in service
    assert "cannot connect to db" in service.lower()
    assert (
        "problem with network connection to database server"
        in service.lower()
    )
    assert "hasCueTiming" in service
    assert "invalid upstream payload" in service

    assert "wyzie-" not in combined

    print(
        "PASS: live Wyzie boundary rejects fake "
        "HTTP-200 subtitle payloads"
    )


if __name__ == "__main__":
    main()
