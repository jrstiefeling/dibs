# Putting this on GitHub

The whole project is in this folder. Nothing here contains an API key or any
personal data — the key is entered in the extension's own settings and lives
only in your browser.

## Option A — web upload, no tools needed

1. Go to https://github.com/new
2. Name it `dibs`, set it **Private** (this automates Facebook, so don't make
   it public), and **don't** tick "Add a README" — this folder has one.
3. On the empty repo page click **uploading an existing file**.
4. Drag in *everything* from this folder. Two things to watch:
   - Drag the `test/` and `icons/` **folders** in as folders so the structure
     is preserved.
   - `.gitignore` starts with a dot and some file pickers hide it. If it
     doesn't upload, make it afterwards with **Add file → Create new file**,
     name it `.gitignore`, and paste the contents in.
5. Commit.

## Option B — command line

    cd path/to/dibs
    git init
    git add .
    git commit -m "Dibs: Marketplace listing and buyer-handling extension"
    git branch -M main
    git remote add origin https://github.com/YOUR_USERNAME/dibs.git
    git push -u origin main

## Handing it to another Claude

Point it at the repo and say:

> Read HANDOFF.md first, then DESIGN.md. Everything's built and tested except
> the real Facebook selectors. The blocker is running diagnose.js on a live
> Marketplace thread and fixing messenger.js from the output.

`HANDOFF.md` is written for exactly that — it covers the decisions and why they
were made, the ten bugs already found and fixed, what's verified versus not, and
the working agreements. A fresh session shouldn't need this conversation.
