# Generates media/demo.gif from a real run against examples/shop-api.
# Install: brew install vhs
# Run:     npm run build && vhs media/demo.tape   (from the project root)

Output media/demo.gif

Set Shell "bash"
Set FontSize 15
Set Width 1200
Set Height 800
Set Padding 24
Set Theme "Catppuccin Mocha"
Set TypingSpeed 70ms
Set Framerate 15

# Use the local build under the name people will type. The real run prints
# everything in about 20 ms, which reads as a flash in a GIF, so the lines are
# shown 60 ms apart. The text itself is the tool's unmodified output.
Hide
Type `claude-audit() { FORCE_COLOR=3 node dist/index.js "$@" 2>/dev/null | while IFS= read -r line; do echo "$line"; sleep 0.06; done; }`
Enter
Type "PS1='$ ' && clear"
Enter
Sleep 500ms
Show

Sleep 1s
Type "claude-audit --static examples/shop-api"
Sleep 800ms
Enter
Sleep 9s
