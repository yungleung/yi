#!/bin/sh
# A curl that only records what it was asked to do, and "fetches" the app's own icon.
#
# `test/probes/export-web-image.js` points the app at this file through the app's own seam
# (`export_use_curl`), so every argument the app gives curl lands in a log the probe reads back — and
# what it writes is a real PNG, which is what makes the document an export produces have a picture in
# it. A probe cannot set an executable bit, so the recorder is committed beside it.
#
# It answers the way curl answers with `--write-out '%{content_type}'`: the type on stdout, the body
# in the file `--output` named, and a status curl would give for a URL that says no (any URL with
# `refuse` in it), which is how the app's own refusal is exercised. A URL with `svg` or `webp` in it
# is answered with the picture a probe put in `$log/picture.svg` or `$log/picture.webp`, so a probe
# can fetch the two formats the app draws or carries by the kind; every other URL gets the PNG.

log="${HOME}/yi-probe-fake-curl"
mkdir -p "$log" 2>/dev/null
{
  echo 'curl'
  for argument in "$@"; do
    echo "$argument"
  done
} >> "$log/argv.log"

output=""
url=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --output)
      output="$2"
      shift 2
      ;;
    --write-out)
      shift 2
      ;;
    --)
      shift
      ;;
    *)
      url="$1"
      shift
      ;;
  esac
done

case "$url" in
  *refuse*)
    echo "curl: (22) the fake curl refuses $url" >&2
    exit 22
    ;;
esac

here=$(dirname "$0")
case "$url" in
  *webp*)
    [ -n "$output" ] && cp "$log/picture.webp" "$output" 2>/dev/null
    content_type='image/webp'
    ;;
  *svg*)
    [ -n "$output" ] && cp "$log/picture.svg" "$output" 2>/dev/null
    content_type='image/svg+xml'
    ;;
  *)
    [ -n "$output" ] && cp "$here/../../src-tauri/icons/32x32.png" "$output" 2>/dev/null
    content_type='image/png'
    ;;
esac
printf '%s' "$content_type"
exit 0
