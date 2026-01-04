class StaqanYt < Formula
  desc "CLI tool for managing YouTube videos and metadata using the YouTube Data API v3"
  homepage "https://github.com/prog893/staqan-yt-cli"
  version "1.1.0"
  license "MIT"

  # For private GitHub repos, we use direct GitHub API asset URLs with authentication
  # Asset IDs and SHA256 checksums are automatically updated by scripts/release.sh
  on_macos do
    on_arm do
      # GitHub API endpoint for release asset (not browser_download_url)
      # Asset ID is automatically updated by release script
      url "https://api.github.com/repos/prog893/staqan-yt-cli/releases/assets/336193257",
          headers: [
            "Accept: application/octet-stream",
            "X-GitHub-Api-Version: 2022-11-28",
            "Authorization: bearer #{ENV.fetch("HOMEBREW_GITHUB_API_TOKEN", nil)}"
          ]
      sha256 "9a1197f182e25178655f939654aa51a9362aa90fc81e43de7ce1c9b943b3593e" # arm64
    end

    on_intel do
      # GitHub API endpoint for release asset (not browser_download_url)
      # Asset ID is automatically updated by release script
      url "https://api.github.com/repos/prog893/staqan-yt-cli/releases/assets/336193256",
          headers: [
            "Accept: application/octet-stream",
            "X-GitHub-Api-Version: 2022-11-28",
            "Authorization: bearer #{ENV.fetch("HOMEBREW_GITHUB_API_TOKEN", nil)}"
          ]
      sha256 "51bc2faa04ffa26ad458644d4866e1233e26dc9d671bb7423e4e1554b0889cb2" # x64
    end
  end

  def install
    if Hardware::CPU.arm?
      bin.install "staqan-yt-macos-arm64" => "staqan-yt"
    else
      bin.install "staqan-yt-macos-x64" => "staqan-yt"
    end
  end

  def caveats
    <<~EOS
      This formula downloads from a private GitHub repository.
      Homebrew will automatically use credentials from:
      - gh CLI (GitHub CLI): Run 'gh auth login' if not authenticated
      - HOMEBREW_GITHUB_API_TOKEN environment variable
      - ~/.config/gh/hosts.yml
      - macOS Keychain

      Before using staqan-yt, you need to set up OAuth credentials:

      1. Create credentials at: https://console.cloud.google.com/apis/credentials
      2. Download the credentials.json file
      3. Place it in: ~/.staqan-yt-cli/credentials.json
      4. Run: staqan-yt auth

      For detailed setup instructions, visit:
      https://github.com/prog893/staqan-yt-cli#setup
    EOS
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/staqan-yt --version")
  end
end
