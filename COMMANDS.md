# Development Commands Reference

## Getting Started

### Install Dependencies
```bash
npm install
```

### Start Development Server
```bash
npm run dev
```
This will start the local development server, typically at `http://localhost:3000`

### Build for Production
```bash
npm run build
```

### Preview Production Build
```bash
npm run preview
```

### Lint Code
```bash
npm run lint
```

## Common Workflow

1. **Start Development**: `npm run dev`
2. **Make Changes** - Edit files in `src/` directory
3. **View Changes** - Browser will auto-refresh at `http://localhost:5173`
4. **Build & Deploy**: `npm run build` then push to git (Vercel auto-deploys)

## File Structure Quick Reference

- `src/pages/` - Main page components
- `src/components/` - Reusable UI components
- `src/assets/` - Images and static files
- `public/` - Public assets and images
- `index.html` - Main HTML file
- `package.json` - Dependencies and scripts

## Git Commands (if needed)

```bash
git add .
git commit -m "Update Instagram handle to vero.art.photo"
git push origin main
```

## Notes

- The site uses Vite for fast development
- Changes are hot-reloaded in the browser
- Vercel automatically deploys when you push to the main branch
- All Instagram references have been updated to "vero.art.photo"
