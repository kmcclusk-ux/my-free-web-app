import argparse
from copy import copy
import hashlib
import json
from pathlib import Path, PurePosixPath
from zipfile import ZipFile, ZIP_DEFLATED


def package_marketing(base, expected_sha256, output, repo):
    if hashlib.sha256(base.read_bytes()).hexdigest() != expected_sha256.lower():
        raise ValueError("Base artifact checksum does not match the verified live deployment.")
    source = repo / "aftertaxus-aws-static"
    replacements = json.loads((repo / "scripts/public-marketing-files.json").read_text())
    if len(replacements) != len(set(replacements)):
        raise ValueError("Duplicate marketing asset.")
    for name in replacements:
        relative = PurePosixPath(name)
        if relative.is_absolute() or ".." in relative.parts or "\\" in name:
            raise ValueError("Invalid marketing asset path.")
        if relative.parts[0] == "app" or not (source / name).is_file():
            raise ValueError("Missing asset or attempted portfolio-app replacement.")
        if not (source / name).resolve().is_relative_to(source.resolve()):
            raise ValueError("Marketing asset escapes the source directory.")
    if output.resolve() == base.resolve():
        raise ValueError("The verified base artifact must remain unchanged.")
    if not output.resolve().is_relative_to((repo / "tmp").resolve()):
        raise ValueError("Write release artifacts only under the repository tmp directory.")
    output.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(base) as previous:
        names = previous.namelist()
        if len(names) != len(set(names)):
            raise ValueError("Duplicate entries in the base artifact.")
        if "app/index.html" not in names:
            raise ValueError("Base artifact is missing the live portfolio app.")
        with ZipFile(output, "w", ZIP_DEFLATED) as release:
            for entry in previous.infolist():
                if entry.filename not in replacements:
                    release.writestr(copy(entry), previous.read(entry.filename))
            for name in replacements:
                release.write(source / name, name)
        with ZipFile(output) as release:
            for name in names:
                if name not in replacements and release.read(name) != previous.read(name):
                    raise ValueError(f"Unrelated production asset changed: {name}")
            for name in replacements:
                if release.read(name) != (source / name).read_bytes():
                    raise ValueError(f"Marketing asset verification failed: {name}")
    return {"output": str(output), "marketingFiles": len(replacements), "preservedFiles": len(set(names) - set(replacements)), "sha256": hashlib.sha256(output.read_bytes()).hexdigest()}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Overlay approved marketing files onto a verified live Amplify artifact; preserve the app and all other assets.")
    parser.add_argument("--base", required=True, type=Path)
    parser.add_argument("--base-sha256", required=True)
    parser.add_argument("--output", required=True, type=Path)
    arguments = parser.parse_args()
    print(json.dumps(package_marketing(arguments.base, arguments.base_sha256, arguments.output, Path(__file__).resolve().parents[1]), indent=2))
