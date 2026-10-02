# Namespace Code Checkout

Check out a GitHub repository using [Namespace Git snapshots](https://namespace.so/docs/git-snapshots). Snapshots reuse prepared Git data and working trees across jobs instead of fetching and checking out the repository each time.

Requires a Namespace Linux, macOS, or Windows runner (x64 or arm64), Git snapshots enabled for your workspace, and a [GitHub association](https://cloud.namespace.so/workspace/workspace/integrations) with read access to the target repository. The action uses the runner's Namespace credentials; no GitHub token input or separate login step is needed.

```yaml
jobs:
  test:
    runs-on: nscloud-ubuntu-26.04-amd64-8x16
    steps:
      - uses: namespace-actions/code-checkout@main
      - run: go test ./...
```

Pin the action to a full commit SHA for reproducible workflows. Versioned releases are not published yet.

By default, this is equivalent to:

```bash
nsgit clone "github.com/$GITHUB_REPOSITORY@$GITHUB_SHA" "$GITHUB_WORKSPACE"
```

The action resolves the latest published `nsgit` release, verifies its SHA-256 checksum before extraction, and installs the executable in the GitHub Actions tool cache (`RUNNER_TOOL_CACHE/nsgit/<version>/<architecture>`). Later invocations reuse the cached version. `nsgit` is also added to `PATH`. Cache persistence across jobs depends on the runner's tool-cache configuration; this action does not upload or restore an Actions cache archive.

## Inputs

| Input             | Default                                                                                    | Description                                                                                          |
| ----------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `repository`      | `${{ github.repository }}`                                                                 | GitHub repository in `owner/name` form.                                                              |
| `ref`             | Workflow SHA for the workflow repository; otherwise the target repository's default branch | Commit, branch, or tag to check out. Use a commit SHA for reproducibility.                           |
| `path`            | `.`                                                                                        | Destination relative to `GITHUB_WORKSPACE`. Must be absent or empty and stay inside the workspace.   |
| `additional-refs` | None                                                                                       | Additional refs to include in the local Git data, one per line. Does not change the checked-out ref. |

```yaml
- uses: namespace-actions/code-checkout@main
  with:
    ref: ${{ github.sha }}
    path: source
    additional-refs: |
      main
      release/v2
```

For pull requests, the default is GitHub's workflow SHA (normally the merge commit), just like the documented shell example. Set `ref: ${{ github.event.pull_request.head.sha }}` to check out the head commit instead, provided the configured repository contains it.

This is not a full replacement for every `actions/checkout` option. It does not clean a nonempty destination, persist GitHub credentials, or expose submodule, LFS, sparse-checkout, or fetch-depth settings. GitHub Enterprise is not supported. Git snapshot/authentication failures fail the step; there is no fallback to a direct Git clone.

## Development

Use Node.js 24:

```bash
npm ci
npm test
npm run test:integration
npm run check
npm run build
```

The integration test downloads the real published `nsgit`, checks checksum rejection and cache reuse, and executes the installed binary. The snapshot workflow additionally checks out a real repository on a Namespace runner. Commit the generated JavaScript bundle in `dist/main` with source changes so consumers do not need to install dependencies.
