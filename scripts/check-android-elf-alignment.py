#!/usr/bin/env python3
import os
import re
import subprocess
import sys
import tempfile
import zipfile

MIN_ALIGN = 0x4000  # 16 KiB


def fail(message: str) -> None:
    print(f"[android-16kb] FAIL: {message}", file=sys.stderr)


def main() -> int:
    if len(sys.argv) != 2:
        fail("Usage: check-android-elf-alignment.py <app-release.aab>")
        return 2

    bundle = sys.argv[1]
    if not os.path.isfile(bundle):
        fail(f"AAB not found: {bundle}")
        return 2

    with tempfile.TemporaryDirectory(prefix="teswa-aab-") as tmp:
        with zipfile.ZipFile(bundle) as zf:
            native_entries = [
                name for name in zf.namelist()
                if name.startswith("base/lib/") and name.endswith(".so")
            ]
            if not native_entries:
                fail("No native shared libraries found in the AAB")
                return 1

            zf.extractall(tmp, native_entries)

        failures = []
        checked = 0

        for entry in sorted(native_entries):
            so_path = os.path.join(tmp, entry)
            proc = subprocess.run(
                ["readelf", "-lW", so_path],
                check=False,
                capture_output=True,
                text=True,
            )
            if proc.returncode != 0:
                failures.append((entry, "readelf failed"))
                continue

            aligns = []
            for line in proc.stdout.splitlines():
                if re.match(r"^\s*LOAD\s", line):
                    match = re.search(r"(0x[0-9a-fA-F]+)\s*$", line)
                    if match:
                        aligns.append(int(match.group(1), 16))

            if not aligns:
                failures.append((entry, "no PT_LOAD alignment found"))
                continue

            checked += 1
            minimum = min(aligns)
            if minimum < MIN_ALIGN:
                failures.append((entry, f"minimum PT_LOAD alignment 0x{minimum:x} < 0x{MIN_ALIGN:x}"))

        print(f"[android-16kb] Checked {checked} native libraries.")

        if failures:
            for entry, reason in failures:
                fail(f"{entry}: {reason}")
            return 1

        print("[android-16kb] PASS: all native ELF PT_LOAD segments are aligned for 16 KiB pages.")
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
