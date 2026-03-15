# Contributing to OpenMail CLI

Thanks for your interest in contributing! This is the official CLI for the [OpenMail API](https://openmail.sh).

## Before you start

- Check [open issues](https://github.com/openmailsh/cli/issues) to avoid duplicates
- For large changes, open an issue first to discuss the approach
- All contributions are released under the [MIT License](LICENSE)

## Development setup

```bash
git clone https://github.com/openmailsh/cli.git
cd cli
npm install
```

Run in dev mode (watch):

```bash
npm run dev
```

You'll need an API key to test against the real API:

```bash
export OPENMAIL_API_KEY=om_xxx
```

## Making changes

1. Fork the repo and create a branch: `git checkout -b fix/my-fix` or `feat/my-feature`
2. Make your changes in `src/`
3. Run tests: `npm test`
4. Build to verify TypeScript compiles: `npm run build`
5. Open a pull request against `main`

## Commit style

Use conventional commits:

- `fix: correct inbox delete error message`
- `feat: add --output flag to threads list`
- `chore: bump dependencies`

## Reporting bugs

Use the [bug report template](https://github.com/openmailsh/cli/issues/new?template=bug_report.md). Include:

- CLI version (`openmail --version`)
- Node.js version (`node --version`)
- Steps to reproduce
- Expected vs actual output

## Security vulnerabilities

Do **not** open a public issue. See [SECURITY.md](SECURITY.md).
