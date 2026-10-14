#!/bin/sh
# A pandoc that only records what it was asked to do, and keeps the note it was handed.
#
# `test/probes/export-pandoc-arguments.js` points the app at this file through the app's own seam
# (`export_use_pandoc`), so every argument the app gives pandoc lands in a log the probe reads back,
# and the note the app wrote for pandoc — the text *after* the export's own pre-process — is kept
# where the probe can read it. What the app asked for is then visible from the app's own hand, the
# way `fake-git.sh` makes what the app asks git visible.
#
# It is committed rather than written by the probe, because a probe can make files and folders
# through the app but cannot set the executable bit on one.
#
# An output *named* `refuse…` is the pandoc that will not write: a sentence on stderr and a non-zero
# status, which is what the app has to turn into a message for the reader. The name and not the whole
# path, because the path holds the folder a probe made — measured the hard way: a probe whose folder
# was called `yi-probe-export-refused-…` had every export refused, including the ones meant to write
# (`export-refused.js`'s picture).

log="${HOME}/yi-probe-fake-pandoc"
mkdir -p "$log" 2>/dev/null
# One argument per line, because a path may hold a space — "/Users/…/Application Support/…" is
# exactly the kind this app writes — and a log split on spaces would read that as two arguments.
{
  echo 'pandoc'
  for argument in "$@"; do
    echo "$argument"
  done
} >> "$log/argv.log"

output=""
note=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --output)
      output="$2"
      shift 2
      ;;
    *)
      # Everything else is either a flag's value or the note itself; the note is the last of them.
      note="$1"
      shift
      ;;
  esac
done

[ -n "$note" ] && cp "$note" "$log/input.md" 2>/dev/null

case "$(basename "$output")" in
  refuse*)
    echo "the fake pandoc refuses to write $output" >&2
    exit 1
    ;;
esac

[ -n "$output" ] && cp "$note" "$output" 2>/dev/null
exit 0
