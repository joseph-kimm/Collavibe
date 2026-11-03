"""Build the small, inspectable course download from an explicit source allowlist."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

root = Path(__file__).resolve().parents[1] / "public" / "course-kit"
files = [root / "README.md", root / "database-lab.sql"]
for folder in ("api-starter", "storage-lab"):
    files.extend(sorted((root / folder).glob("*")))
with ZipFile(root / "course-kit.zip", "w", ZIP_DEFLATED) as archive:
    for file in files:
        if file.is_file() and file.suffix in (".html", ".css", ".js", ".md", ".sql"):
            archive.write(file, "Vibecode 101 Course Kit/" + str(file.relative_to(root)))
print("Built public/course-kit/course-kit.zip from", len(files), "source files.")
