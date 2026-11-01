#!/usr/bin/env bash
set -euo pipefail
umask 077

cd /opt/momonihongo
backup_dir=/opt/momonihongo/backups
mkdir -p "$backup_dir"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
OUTPUT_PATH="$backup_dir/daily-$stamp.dump" bash ./deploy/beta/backup_db.sh
OUTPUT_PATH="$backup_dir/daily-$stamp-audio.tar.gz" bash ./deploy/beta/backup_audio.sh
find "$backup_dir" -maxdepth 1 -type f -name 'daily-*.dump' -mtime +7 -delete
find "$backup_dir" -maxdepth 1 -type f -name 'daily-*-audio.tar.gz' -mtime +7 -delete
