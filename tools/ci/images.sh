#!/usr/bin/env bash
# Usage: images.sh load|save <dir>
# Keeps the Supabase images a CI job pulled in the Actions cache, so a later run starts its stack without asking a
# registry that may be rate limiting shared runners. load tags each cached image under both registries db-start.sh
# may use; save writes the images once, on a cache miss, after the stack started.
set -euo pipefail

dir=$2
supabase_images() {
	docker images --format '{{.Repository}}:{{.Tag}}' | grep -E '^(ghcr\.io|public\.ecr\.aws)/supabase/' || true
}

case $1 in
load)
	[ -f "$dir/images.tar" ] || exit 0
	docker load -q -i "$dir/images.tar"
	supabase_images | while read -r ref; do
		for registry in ghcr.io public.ecr.aws; do
			docker tag "$ref" "$registry/supabase/${ref#*/supabase/}"
		done
	done
	;;
save)
	[ -f "$dir/images.tar" ] && exit 0
	mkdir -p "$dir"
	mapfile -t refs < <(supabase_images)
	if [ "${#refs[@]}" -gt 0 ]; then
		docker save -o "$dir/images.tar" "${refs[@]}"
	fi
	;;
*)
	echo "usage: images.sh load|save <dir>" >&2
	exit 2
	;;
esac
