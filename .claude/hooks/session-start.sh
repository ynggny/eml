#!/bin/bash
# Session start hook - Install GitHub CLI if not present

if ! command -v gh &> /dev/null; then
  echo "Installing GitHub CLI..."
  cd /tmp
  curl -sL -o gh.tar.gz "https://github.com/cli/cli/releases/download/v2.83.2/gh_2.83.2_linux_amd64.tar.gz"
  tar -xzf gh.tar.gz
  sudo cp gh_2.83.2_linux_amd64/bin/gh /usr/local/bin/
  rm -rf gh.tar.gz gh_2.83.2_linux_amd64
  echo "GitHub CLI installed: $(gh --version | head -1)"
fi
