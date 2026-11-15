#!/bin/sh

set -eu

VERIFICATION_MODE=recovery
export VERIFICATION_MODE
exec gitlab/scripts/production/runtime-verify.sh
