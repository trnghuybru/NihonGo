#!/usr/bin/env python3
"""Remove only reviewed, archived source files; dry-run unless --apply is set."""
import argparse
import hashlib
import json
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument('--manifest', type=Path,
                        default=Path(__file__).with_name('data_cleanup_manifest.json'))
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    root = args.root.resolve()
    manifest = json.loads(args.manifest.read_text())
    candidates, missing, changed = [], 0, []
    for entry in manifest['files']:
        relative = Path(entry['path'])
        if (relative.is_absolute() or '..' in relative.parts or
                relative.parts[:2] != ('backend', 'data')):
            raise SystemExit('Unsafe manifest path: ' + str(relative))
        path = root / relative
        # Refuse symlinks anywhere in the path, including parent directories.
        if any(parent.is_symlink() for parent in (path, *path.parents)):
            raise SystemExit('Refusing symlink: ' + str(relative))
        if not path.exists():
            missing += 1
            continue
        if (not path.is_file() or path.stat().st_size != entry['bytes'] or
                hashlib.sha256(path.read_bytes()).hexdigest() != entry['sha256']):
            changed.append(str(relative))
            continue
        candidates.append((path, entry['bytes']))
    # Validate every file before deleting any. VPS-only or updated data is preserved.
    if changed:
        raise SystemExit('Changed files must be archived separately; nothing removed:\n' +
                         '\n'.join(changed))
    total = sum(size for _, size in candidates)
    for path, _ in candidates:
        print(('REMOVE ' if args.apply else 'WOULD REMOVE ') + str(path.relative_to(root)))
        if args.apply:
            path.unlink()
    print(json.dumps({'applied': args.apply, 'files': len(candidates),
                      'bytes': total, 'already_absent': missing,
                      'archive_branch': manifest['archive_branch']}))


if __name__ == '__main__':
    main()
