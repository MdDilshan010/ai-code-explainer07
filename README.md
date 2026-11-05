# AI Code Explainer

A web tool that explains pasted code line by line at a difficulty level you choose.
Built for the NIAT x Geeta University Generative AI assessment (Project #16).

## Features
1. **Paste code** - paste code in any common language (Python, JavaScript, C/C++, Java).
2. **AI explains line by line** - every line gets its own plain-English explanation.
3. **Difficulty level selector** - beginner, intermediate or expert.
4. **History** - your last 15 explanations are saved in the browser and can be reopened or deleted.

## How the AI part works
- Role prompts (teacher, reviewer, mentor) and level prompts shape the model's answer.
- Output is controlled with parameters: model, temperature and max tokens.
- Add a Google Gemini API key under "AI settings" to use a real model.
- Without a key, a built-in offline explainer is used so the site always works.
- The key is only typed into the page and is never stored in this repository.

## Run locally
Open `index.html` in a browser. No build step is needed.

## Deploy
Import this repository into Vercel (or Netlify / GitHub Pages) and deploy with the default settings.

## Files
- `index.html` - page structure and SVG illustrations
- `style.css` - styling
- `script.js` - explainer logic, prompts, AI call and history

## Author
Md Dilshan - B.Tech CSE (AI), NIAT x Geeta University
