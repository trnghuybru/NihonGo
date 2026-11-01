#!/usr/bin/env bash
set -euo pipefail
umask 077

: "${OUTPUT_PATH:?Set OUTPUT_PATH to a private .dump path}"
case "$OUTPUT_PATH" in
  /*.dump) ;;
  *) echo "OUTPUT_PATH must be an absolute .dump path" >&2; exit 2 ;;
esac
if [[ -z "${SOURCE_PGURI:-}" && -z "${SOURCE_CONTAINER:-}" ]]; then
  echo "Set SOURCE_PGURI or SOURCE_CONTAINER" >&2
  exit 2
fi

# Curated/shared content only. Do not add users, progress, auth, messages,
# submissions, dictionary history, flashcards, or AI wallet tables here.
tables=(
  vocabulary_textbooks vocabulary_lessons vocabulary_words
  reading_passages reading_insights
  dictionary_entries dictionary_terms dictionary_kanji dictionary_sources
  example_videos video_caption_segments
  shadowing_jobs shadowing_translations
  scenario_categories scenarios scenario_roles evaluation_criteria
)
args=()
for table in "${tables[@]}"; do
  args+=("--table=public.${table}")
done
mkdir -p "$(dirname "$OUTPUT_PATH")"
temporary="${OUTPUT_PATH}.partial"
trap 'rm -f "$temporary"' EXIT

if [[ -n "${SOURCE_CONTAINER:-}" ]]; then
  docker exec "$SOURCE_CONTAINER" pg_dump -U "${SOURCE_PGUSER:-nihongo}" \
    -d "${SOURCE_PGDB:-nihongo}" --format=custom --data-only \
    --no-owner --no-privileges "${args[@]}" > "$temporary"
  docker exec -i "$SOURCE_CONTAINER" pg_restore --list > /dev/null < "$temporary"
else
  pg_dump --dbname="$SOURCE_PGURI" --format=custom --data-only \
    --no-owner --no-privileges --file="$temporary" "${args[@]}"
  pg_restore --list "$temporary" > /dev/null
fi
mv "$temporary" "$OUTPUT_PATH"
trap - EXIT
echo "Wrote curated content archive to $OUTPUT_PATH"
