#!/usr/bin/env bash
set -euo pipefail

model_dir=/opt/momonihongo/backend/models/translation/m2m100_418M
revision=55c2e61bbf05dfb8d7abccdc3fae6fc8512fd636
base="https://huggingface.co/facebook/m2m100_418M/resolve/$revision"
expected=d907ea45e4e4b9db163382a6674f6218b3c59566fe06d77f4055c208b4e87ed1
files=(README.md config.json generation_config.json pytorch_model.bin
       sentencepiece.bpe.model special_tokens_map.json tokenizer_config.json vocab.json)

mkdir -p "$model_dir"
for file in "${files[@]}"; do
  if [[ -s "$model_dir/$file" ]]; then
    continue
  fi
  curl --fail --location --silent --show-error --retry 5 --retry-all-errors --connect-timeout 20 \
    --continue-at - --output "$model_dir/$file.part" "$base/$file?download=true"
  mv "$model_dir/$file.part" "$model_dir/$file"
done
printf '%s  %s\n' "$expected" "$model_dir/pytorch_model.bin" | sha256sum --check --status
echo "M2M100 model downloaded and checksum verified."
