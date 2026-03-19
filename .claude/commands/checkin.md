Run the following git commands to stage all changes and commit with the provided message:

```bash
git add . && git commit -m "$ARGUMENTS"
```

If no message was provided (i.e., `$ARGUMENTS` is empty), ask the user for a commit message before proceeding.
