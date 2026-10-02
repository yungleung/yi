#!/bin/sh
# A git that only records what it was asked to do.
#
# `test/probes/versioning-fake-git.js` points the app at this file through the app's own seam
# (`versioning_use_git`), so *every* argument the app hands to git — including the ones of a call
# it should never make — lands in a log the probe reads back. A call the app should never run
# cannot hide here behind a real git doing it harmlessly.
#
# It is committed rather than written by the probe, because a probe can make files and folders
# through the app but cannot set the executable bit on one.
#
# It answers with nothing and succeeds, so the app behaves as if git had done what it asked.

log="${HOME}/yi-probe-fake-git/argv.log"
mkdir -p "$(dirname "$log")" 2>/dev/null
printf 'git %s\n' "$*" >> "$log"
exit 0
