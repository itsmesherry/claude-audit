# VHS tape file — generates media/demo.gif
# Install: brew install charmbracelet/tap/vhs
# Run:     npm link && vhs media/demo.tape  (from project root)

Output media/demo.gif

Set Shell "bash"
Set FontSize 14
Set Width 1200
Set Height 800
Set Theme "Catppuccin Mocha"
Set Padding 20
Set TypingSpeed 60ms
Set Framerate 12

# Silently set up: link the package + alias to delayed output wrapper
Hide
Type "npm link --force 2>/dev/null"
Enter
Sleep 4s
Type "alias claude-audit='./demo-helper.sh'"
Enter
Sleep 0.3s
Type "clear"
Enter
Sleep 0.5s
Show

# Let the terminal settle
Sleep 0.5s

# Type the command (what users run after: npm install -g claude-audit)
Type "claude-audit --static ./my-saas-app"
Sleep 0.8s
Enter

# Output scrolls in line-by-line (~6.4s for 160 lines at 40ms each)
Sleep 8s

# Hold so viewers can read the final findings
Sleep 5s

# Final pause
Sleep 1s
