"""Build the small, inspectable course download from an explicit source allowlist."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import json
import subprocess

root = Path(__file__).resolve().parents[1] / "public" / "course-kit"
source = """
import {course} from './src/course-content.ts';
import {courseHandbook,assignmentMarkdown} from './src/course-handbook.ts';
console.log(JSON.stringify({handbook:courseHandbook(),assignments:course.assignments.map(row=>({id:row.id,text:assignmentMarkdown(row.id)})),templates:course.toolkit}));
"""
result = subprocess.run(["node", "--import", "tsx", "--input-type=module", "-e", source], cwd=root.parents[1], capture_output=True, text=True, check=True)
materials = json.loads(result.stdout)
(root / "Course Handbook.md").write_text(materials["handbook"], encoding="utf-8")
for folder in ("assignments", "templates"):
    (root / folder).mkdir(exist_ok=True)
for assignment in materials["assignments"]:
    (root / "assignments" / (assignment["id"] + ".md")).write_text(assignment["text"], encoding="utf-8")
for template in materials["templates"]:
    (root / "templates" / (template["id"] + ".md")).write_text("# " + template["title"] + "\n\n" + template["text"] + "\n", encoding="utf-8")
files = [root / "README.md", root / "database-lab.sql", root / "Course Handbook.md"]
pdf = root / "Vibecode 101 - Course Handbook.pdf"
if pdf.exists():
    files.append(pdf)
for folder in ("api-starter", "storage-lab", "assignments", "templates"):
    files.extend(sorted((root / folder).glob("*")))
with ZipFile(root / "course-kit.zip", "w", ZIP_DEFLATED) as archive:
    for file in files:
        if file.is_file() and file.suffix in (".html", ".css", ".js", ".md", ".sql", ".pdf"):
            archive.write(file, "Vibecode 101 Course Kit/" + str(file.relative_to(root)))
print("Built public/course-kit/course-kit.zip from", len(files), "source files.")
