class StaqanYt < Formula
  desc "CLI tool for managing YouTube videos and metadata using the YouTube Data API v3"
  homepage "https://github.com/prog893/staqan-yt-cli"
  version "1.1.0"
  license "MIT"

  # For private GitHub repos, we use the GitHub API endpoint with authentication
  # The url block is evaluated at install time, allowing dynamic asset URL resolution
  # SHA256 checksums are automatically updated by scripts/release.sh
  on_macos do
    on_arm do
      # Use a lambda/proc to delay evaluation until install time
      url do
        require "utils/github"

        # Fetch release metadata to get the asset API URL
        release_data = GitHub.get_release("prog893", "staqan-yt-cli", "v#{version}")
        assets = release_data["assets"]
        asset = assets.find { |a| a["name"] == "staqan-yt-macos-arm64.tar.gz" }

        odie "Asset staqan-yt-macos-arm64.tar.gz not found in release v#{version}" if asset.nil?

        # GitHub API URL for the asset (not browser_download_url)
        api_url = asset["url"]

        # Get GitHub token - Homebrew automatically checks gh CLI, keychain, and env vars
        token = GitHub::API.credentials
        odie "GitHub authentication required. Run 'gh auth login' or set HOMEBREW_GITHUB_API_TOKEN" if token.nil?

        # Return array: [url, options_hash]
        [
          api_url,
          { headers: ["Accept: application/octet-stream",
                      "X-GitHub-Api-Version: 2022-11-28",
                      "Authorization: bearer #{token}"] }
        ]
      end
      sha256 "9a1197f182e25178655f939654aa51a9362aa90fc81e43de7ce1c9b943b3593e" # arm64
    end

    on_intel do
      # Use a lambda/proc to delay evaluation until install time
      url do
        require "utils/github"

        # Fetch release metadata to get the asset API URL
        release_data = GitHub.get_release("prog893", "staqan-yt-cli", "v#{version}")
        assets = release_data["assets"]
        asset = assets.find { |a| a["name"] == "staqan-yt-macos-x64.tar.gz" }

        odie "Asset staqan-yt-macos-x64.tar.gz not found in release v#{version}" if asset.nil?

        # GitHub API URL for the asset (not browser_download_url)
        api_url = asset["url"]

        # Get GitHub token - Homebrew automatically checks gh CLI, keychain, and env vars
        token = GitHub::API.credentials
        odie "GitHub authentication required. Run 'gh auth login' or set HOMEBREW_GITHUB_API_TOKEN" if token.nil?

        # Return array: [url, options_hash]
        [
          api_url,
          { headers: ["Accept: application/octet-stream",
                      "X-GitHub-Api-Version: 2022-11-28",
                      "Authorization: bearer #{token}"] }
        ]
      end
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
