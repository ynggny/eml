#!/bin/bash
# Session start hook - Install GitHub CLI if not present

GH_VERSION="2.45.0"

if ! command -v gh &> /dev/null; then
  echo "Installing GitHub CLI v${GH_VERSION}..."
  cd /tmp
  curl -sL -o gh.tar.gz "https://github.com/cli/cli/releases/download/v${GH_VERSION}/gh_${GH_VERSION}_linux_amd64.tar.gz"
  tar -xzf gh.tar.gz
  sudo cp "gh_${GH_VERSION}_linux_amd64/bin/gh" /usr/local/bin/
  rm -rf gh.tar.gz "gh_${GH_VERSION}_linux_amd64"
  echo "GitHub CLI installed: $(gh --version | head -1)"
fi
