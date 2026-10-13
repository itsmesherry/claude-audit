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
Set TypingSpeed 45ms
Set Framerate 10

# Use the local build under the name people will type
Hide
Type "alias claude-audit='node dist/index.js' && PS1='$ ' && clear"
Enter
Sleep 500ms
Show

Sleep 600ms
Type "claude-audit --static examples/shop-api"
Sleep 600ms
Enter
Sleep 7s
