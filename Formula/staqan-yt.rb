class StaqanYt < Formula
  desc "CLI tool for managing YouTube videos and metadata using the YouTube Data API v3"
  homepage "https://github.com/prog893/staqan-yt-cli"
  version "1.1.0"
  license "MIT"

  # For private GitHub repos, we use the GitHub API endpoint with authentication
  # Asset IDs and SHA256 checksums are automatically updated by scripts/release.sh
  on_macos do
    on_arm do
      url do
        require "utils/github"
        assets = GitHub.get_release("prog893", "staqan-yt-cli", "v#{version}").fetch("assets")
        asset = assets.find { |a| a["name"] == "staqan-yt-macos-arm64.tar.gz" }

        if asset.nil?
          raise "Could not find staqan-yt-macos-arm64.tar.gz in release v#{version}"
        end

        # Return [url, options_hash] for authenticated download
        [
          asset.fetch("url"),
          {
            headers: [
              "Accept: application/octet-stream",
              "X-GitHub-Api-Version: 2022-11-28",
              "Authorization: bearer #{GitHub::API.credentials}"
            ]
          }
        ]
      end
      sha256 "9a1197f182e25178655f939654aa51a9362aa90fc81e43de7ce1c9b943b3593e" # arm64
    end

    on_intel do
      url do
        require "utils/github"
        assets = GitHub.get_release("prog893", "staqan-yt-cli", "v#{version}").fetch("assets")
        asset = assets.find { |a| a["name"] == "staqan-yt-macos-x64.tar.gz" }

        if asset.nil?
          raise "Could not find staqan-yt-macos-x64.tar.gz in release v#{version}"
        end

        # Return [url, options_hash] for authenticated download
        [
          asset.fetch("url"),
          {
            headers: [
              "Accept: application/octet-stream",
              "X-GitHub-Api-Version: 2022-11-28",
              "Authorization: bearer #{GitHub::API.credentials}"
            ]
          }
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
