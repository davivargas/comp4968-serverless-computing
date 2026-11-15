#!/usr/bin/env bash
# Builds dist/payroll-common-layer.zip (shared layer) and one dist/<function>.zip per Lambda.
# Usage: scripts/build.sh      (needs python3, pip, zip; run on Linux or build the layer with:  pip install --platform manylinux2014_x86_64 --only-binary=:all:)
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf dist build && mkdir -p dist build/layer
cp -r layers/common/python build/layer/python
pip install -q -r layers/common/requirements.txt -t build/layer/python \
  --platform manylinux2014_x86_64 --implementation cp --python-version 3.12 --only-binary=:all: --upgrade
find build/layer -name '__pycache__' -prune -exec rm -rf {} +
(cd build/layer && zip -qr ../../dist/payroll-common-layer.zip python)
for f in functions/*/; do
  name=$(basename "$f")
  (cd "$f" && zip -qr "../../dist/$name.zip" lambda_function.py)
done
zip -qj dist/db-init.zip db/schema.sql db/demo_data.sql db/demo_timesheets.csv db/demo_manifest.json   # db-init carries copies of the schema and demo data
ls -la dist
