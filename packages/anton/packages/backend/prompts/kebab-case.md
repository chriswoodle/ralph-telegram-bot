# Kebab-Case Name Generator

Convert the given display name into a kebab-case internal name suitable for use as a directory name, branch prefix, or identifier.

## Input

Display name: {{displayName}}

## Rules

1. Convert to lowercase
2. Remove all characters except letters, numbers, spaces, and hyphens
3. Replace spaces with hyphens
4. Collapse multiple hyphens into one
5. Remove leading and trailing hyphens
6. Append a 4-digit random numeric suffix (e.g., `-4821`)

## Output

Return ONLY the kebab-case string with suffix, no other text.
