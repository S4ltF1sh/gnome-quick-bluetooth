#!/bin/bash

# Bluetooth Quick Manager - Installation Script

UUID="bluetooth-quick-manager@s4ltf1sh.local"
INSTALL_DIR="$HOME/.local/share/gnome-shell/extensions/$UUID"

echo "=== Bluetooth Quick Manager - Installation ==="
echo ""
echo "Installing full-featured extension with:"
echo "  ✓ Bluetooth on/off toggle"
echo "  ✓ Device connect/disconnect"
echo "  ✓ Device scanning"
echo "  ✓ Quick pairing"
echo "  ✓ Signal strength indicators"
echo ""

# Create directory if not exists
mkdir -p "$INSTALL_DIR"

# Copy files
cp ../* "$INSTALL_DIR/"

echo "✓ Extension installed to: $INSTALL_DIR"
echo ""
echo "Next steps:"
echo "1. Restart GNOME Shell:"
echo "   • On X11: Press Alt+F2, type 'r', press Enter"
echo "   • On Wayland: Log out and log back in"
echo ""
echo "2. Enable extension:"
echo "   gnome-extensions enable $UUID"
echo ""
echo "3. Or use GNOME Extensions app to enable it"
echo ""
echo "For help, see:"
echo "  • README.md - Main documentation"
echo "  • SCANNING_GUIDE.md - How to scan and pair devices"
echo "  • TROUBLESHOOTING.md - Fix common issues"
