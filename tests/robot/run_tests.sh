#!/usr/bin/env bash
# Run RawDrive Robot Framework test suite
# Usage:
#   ./run_tests.sh                  # run all tests
#   ./run_tests.sh -i smoke         # run smoke-tagged tests only
#   ./run_tests.sh -i login         # run login tests only
#   ./run_tests.sh -i negative      # run negative tests only

set -e
cd "$(dirname "$0")"

python3 -m robot \
  --outputdir results \
  --log     results/log.html \
  --report  results/report.html \
  --output  results/output.xml \
  "$@" \
  login_tests.robot

echo ""
echo "Results → tests/robot/results/report.html"
