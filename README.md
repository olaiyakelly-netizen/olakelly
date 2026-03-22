# olakelly
Thought leadership website

The Ola Kelly brand represents thoughtful leadership, responsible influence, and intellectual curiosity. The brand is grounded in the belief that leadership is stewardship — influence is not something to accumulate, but something to manage carefully and use responsibly.

This brand exists to explore leadership through reflection, conversation, and practical frameworks that help ambitious professionals pursue meaningful success without sacrificing integrity, perspective, or long-term capacity.

Visually, the brand blends quiet authority with warmth and approachability. The color palette centers on Cosmic Void (#050a30) as the primary anchor color, supported by Metallic Gold (#d4af37), Silver Bird (#fbf6f2), and Evening in Paris (#908f9e). The overall aesthetic is polished, modern, and editorial — conveying credibility, clarity of thought, and a calm, confident leadership presence.

Typography reinforces this tone. Raleway is used for headings to convey structure and modernity, while Lato provides clean, readable body text that supports thoughtful long-form writing and professional communication. The typographic system follows a Major Third scale to maintain visual harmony and clear hierarchy across all materials.

The voice of the brand is reflective, analytical, and grounded in real leadership experiences. It avoids hype, corporate clichés, and performative thought leadership. Instead, the tone favors thoughtful insight, practical wisdom, and occasionally a bit of wit — because leadership conversations should be intelligent, but they don’t have to be dull.

Overall, the Ola Kelly brand should feel like a calm, credible voice in the leadership conversation: thoughtful, steady, and quietly confident.

## Run locally

From this folder, start a local web server with:

```powershell
.\start.ps1
```

Then open `http://localhost:8000` in your browser.

Optional: choose a different port.

```powershell
.\start.ps1 -Port 3000
```

If PowerShell blocks local scripts on your machine, you can still run:

```powershell
python -m http.server 8000
```

or:

```powershell
py -m http.server 8000
```

## Deployment workflow

This project uses Vercel's built-in Git integration.

### Branch workflow

- `staging` is the deployment branch
- Pushes to `staging` are the branch used for live deployment going forward
- Other branches can still be used for working changes and review before merging into `staging`

### Recommended branch naming

- `feature/...` for new features
- `fix/...` for bug fixes
- `content/...` for copy/content changes
- `design/...` for visual refinements

Examples:
- `feature/about-page`
- `fix/footer-spacing`
- `content/privacy-copy`
- `design/favicon-update`

### Typical flow

`Local -> Branch -> Review -> Merge -> Deploy from staging`

1. Start from `staging`
2. Create a branch
3. Push the branch to GitHub
4. Review the branch changes
   - Available in the Vercel dashboard under "Deployments"
   - Also appears in the GitHub pull request checks
5. Open a pull request into `staging`
6. Merge when ready
7. Vercel deploys from `staging`

### Example commands

```bash
git checkout staging
git pull origin staging
git checkout -b feature/about-page-update

git add .
git commit -m "Refine About page copy"
git push -u origin feature/about-page-update
```

### Important

Do not make deployment changes directly on the `main` branch.

Use a feature/content/design branch when you want review before merging into `staging`.

### Stewardship Principle

Before merging to `staging`, confirm:
- The change is complete enough to publish
- It aligns with the purpose of the site
- It does not introduce unnecessary complexity

Preview before you publish.
